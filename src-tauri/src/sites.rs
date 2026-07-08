use serde::Serialize;
use tauri::AppHandle;

use crate::auth::{current_auth, pb_url, DEPLOY_API_BASE_URL};
use crate::state::AppState;

/// Default root domain for site hostnames (used as a fallback when the
/// PocketBase record does not carry an explicit hostname field).
const PAGES_ROOT_DOMAIN: &str = "spage.me";

/// Reserved slugs that may not be used. Mirrors the worker's RESERVED_SLUGS.
const RESERVED_SLUGS: &[&str] = &["www", "api", "development", "pb", "pages", "admin"];

fn deploy_api_url() -> Result<&'static str, String> {
    DEPLOY_API_BASE_URL.ok_or_else(|| "部署服务未配置".to_string())
}

fn current_token(state: &tauri::State<'_, AppState>) -> Result<String, String> {
    let (token, _uid) = current_auth(state)?;
    Ok(token)
}

// ── Models returned to the frontend ────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteInfo {
    pub site_slug: String,
    pub hostname: String,
}

// ── Slug validation (pure, unit-tested) ────────────────────

/// Validates a site slug against the same rules the server enforces:
/// `^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$` plus a reserved-word blacklist.
/// Returns a user-facing (Chinese) error message on failure.
pub fn validate_slug(slug: &str) -> Result<(), String> {
    let len = slug.chars().count();
    if len < 3 || len > 32 {
        return Err("博客网址长度需为 3-32 个字符".to_string());
    }
    if !slug
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("博客网址只能包含小写字母、数字和连字符".to_string());
    }
    let first = slug.chars().next().unwrap();
    let last = slug.chars().last().unwrap();
    if first == '-' || last == '-' {
        return Err("博客网址首尾不能是连字符".to_string());
    }
    if RESERVED_SLUGS.contains(&slug) {
        return Err("该博客网址为保留词，请更换".to_string());
    }
    Ok(())
}

// ── Error mapping ──────────────────────────────────────────

/// Maps a Deploy API Worker error response to a user-facing Chinese message.
pub fn map_deploy_error(status: u16, body: &str) -> String {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
        let code = v["error"].as_str().unwrap_or("");
        let msg = v["message"].as_str().unwrap_or("");
        match code {
            "invalid_site_slug" => {
                return "博客网址格式不正确（3-32 位，小写字母/数字/连字符，首尾为字母或数字）"
                    .to_string()
            }
            "reserved_site_slug" => return "该博客网址为保留词，请更换".to_string(),
            "site_limit_exceeded" => return "每个账号最多创建 2 个站点".to_string(),
            "site_not_found" => return "未找到该站点".to_string(),
            "artifact_too_large" => return "构建产物超过大小上限（200MB）".to_string(),
            "deployment_not_found" => return "未找到该部署记录".to_string(),
            "invalid_deployment_state" => return "部署状态异常，请重试".to_string(),
            "unauthorized" => return "登录已过期，请重新登录".to_string(),
            "pocketbase_error" => {
                let m = msg.to_ascii_lowercase();
                if m.contains("unique")
                    || m.contains("not_unique")
                    || m.contains("exists")
                    || m.contains("constraint")
                {
                    return "该博客网址已被占用，请更换".to_string();
                }
            }
            _ => {}
        }
        if !msg.is_empty() {
            return format!("操作失败：{}", msg);
        }
    }
    if status == 429 {
        return "请求过于频繁，请稍后再试".to_string();
    }
    format!("请求失败 ({})", status)
}

fn fallback_hostname(slug: &str) -> String {
    format!("{}.{}", slug, PAGES_ROOT_DOMAIN)
}

// ── Tauri commands ─────────────────────────────────────────

/// Create a site (reserve the slug) via the Deploy API.
#[tauri::command]
pub async fn site_create(
    site_slug: String,
    _app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<SiteInfo, String> {
    validate_slug(&site_slug)?;
    let base = deploy_api_url()?;
    let token = current_token(&state)?;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/sites", base))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({ "siteSlug": site_slug }))
        .send()
        .await
        .map_err(|_| "网络连接失败，请检查网络".to_string())?;

    let status = res.status().as_u16();
    let body = res.text().await.unwrap_or_default();
    if status >= 400 {
        return Err(map_deploy_error(status, &body));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&body).map_err(|_| "解析响应失败".to_string())?;
    let site = &parsed["site"];
    let slug = site["siteSlug"]
        .as_str()
        .unwrap_or(&site_slug)
        .to_string();
    let info = SiteInfo {
        hostname: site["hostname"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| fallback_hostname(&slug)),
        site_slug: slug.clone(),
    };

    // Persist site_slug onto the in-memory user so the first-time dialog
    // does not re-trigger.
    {
        let mut guard = state.auth.lock().unwrap();
        if let Some(a) = guard.as_mut() {
            a.user.site_slug = Some(slug);
        }
    }

    Ok(info)
}


/// List the current user's sites directly from PocketBase (owner-scoped),
/// reading the cached `siteStatus` for instant display.
#[tauri::command]
pub async fn sites_list(state: tauri::State<'_, AppState>) -> Result<Vec<SiteInfo>, String> {
    let pb = pb_url()?;
    let token = current_token(&state)?;

    let client = reqwest::Client::new();
    let res = client
        .get(format!(
            "{}/api/collections/sites/records?perPage=50&sort=created",
            pb
        ))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|_| "网络连接失败，请检查网络".to_string())?;

    let status = res.status().as_u16();
    let body = res.text().await.unwrap_or_default();
    if status >= 400 {
        return Err(format!("获取站点列表失败 ({})", status));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&body).map_err(|_| "解析响应失败".to_string())?;

    let mut out = Vec::new();
    if let Some(items) = parsed["items"].as_array() {
        for item in items {
            let slug = item["siteSlug"].as_str().unwrap_or("").to_string();
            if slug.is_empty() {
                continue;
            }
            let hostname = fallback_hostname(&slug);
            out.push(SiteInfo {
                hostname,
                site_slug: slug,
            });
        }
    }
    Ok(out)
}


// ── Tests ──────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_slugs() {
        assert!(validate_slug("abc").is_ok());
        assert!(validate_slug("my-blog").is_ok());
        assert!(validate_slug("a1b2c3").is_ok());
        assert!(validate_slug("foo-bar-baz").is_ok());
        // exactly 32 chars
        assert!(validate_slug("a234567890123456789012345678901z").is_ok());
    }

    #[test]
    fn rejects_too_short_or_too_long() {
        assert!(validate_slug("ab").is_err());
        assert!(validate_slug("").is_err());
        // 33 chars
        assert!(validate_slug("a2345678901234567890123456789012z").is_err());
    }

    #[test]
    fn rejects_invalid_characters() {
        assert!(validate_slug("Abc").is_err()); // uppercase
        assert!(validate_slug("a_b").is_err()); // underscore
        assert!(validate_slug("a b").is_err()); // space
        assert!(validate_slug("föö").is_err()); // non-ascii
    }

    #[test]
    fn rejects_leading_or_trailing_hyphen() {
        assert!(validate_slug("-abc").is_err());
        assert!(validate_slug("abc-").is_err());
        assert!(validate_slug("-ab-").is_err());
    }

    #[test]
    fn rejects_reserved_words() {
        for w in ["www", "api", "development", "pb", "pages", "admin"] {
            assert!(validate_slug(w).is_err(), "{} should be reserved", w);
        }
    }

    #[test]
    fn maps_known_deploy_errors() {
        assert_eq!(
            map_deploy_error(409, r#"{"error":"site_limit_exceeded"}"#),
            "每个账号最多创建 2 个站点"
        );
        assert_eq!(
            map_deploy_error(409, r#"{"error":"reserved_site_slug"}"#),
            "该博客网址为保留词，请更换"
        );
        assert_eq!(
            map_deploy_error(
                502,
                r#"{"error":"pocketbase_error","message":"validation_not_unique: Value must be unique"}"#
            ),
            "该博客网址已被占用，请更换"
        );
    }
}
