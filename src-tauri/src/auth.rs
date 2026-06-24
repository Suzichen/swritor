use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

use crate::state::AppState;

pub const PB_BASE_URL: Option<&str> = option_env!("PB_BASE_URL");
pub const DEPLOY_API_BASE_URL: Option<&str> = option_env!("DEPLOY_API_BASE_URL");

fn pb_url() -> Result<&'static str, String> {
    PB_BASE_URL.ok_or_else(|| "认证服务未配置".to_string())
}
const STORE_FILENAME: &str = "auth.json";
const TOKEN_KEY: &str = "token";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub id: String,
    pub email: String,
    pub verified: bool,
    pub site_slug: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AuthState {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatusResponse {
    pub logged_in: bool,
    pub user: Option<UserInfo>,
}

// ── Token persistence ──────────────────────────────────────

pub fn save_token(app: &AppHandle, token: &str) {
    if let Ok(store) = app.store(STORE_FILENAME) {
        store.set(TOKEN_KEY, serde_json::json!(token));
        let _ = store.save();
    }
}

pub fn load_token(app: &AppHandle) -> Option<String> {
    let store = app.store(STORE_FILENAME).ok()?;
    store.get(TOKEN_KEY).and_then(|v| v.as_str().map(|s| s.to_string()))
}

pub fn clear_token(app: &AppHandle) {
    if let Ok(store) = app.store(STORE_FILENAME) {
        store.delete(TOKEN_KEY);
        let _ = store.save();
    }
}

// ── JWT helpers ────────────────────────────────────────────

fn decode_jwt_payload(token: &str) -> Option<serde_json::Value> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    // base64url decode the payload
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    let bytes = URL_SAFE_NO_PAD.decode(parts[1]).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub fn is_token_valid(token: &str) -> bool {
    if let Some(payload) = decode_jwt_payload(token) {
        if let Some(exp) = payload["exp"].as_u64() {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            return exp > now;
        }
    }
    false
}

fn token_expires_within(token: &str, secs: u64) -> bool {
    if let Some(payload) = decode_jwt_payload(token) {
        if let Some(exp) = payload["exp"].as_u64() {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            return exp > now && (exp - now) < secs;
        }
    }
    false
}

fn user_info_from_jwt(token: &str) -> Option<UserInfo> {
    let payload = decode_jwt_payload(token)?;
    Some(UserInfo {
        id: payload["id"].as_str()?.to_string(),
        email: payload["email"].as_str().unwrap_or("").to_string(),
        verified: payload["verified"].as_bool().unwrap_or(false),
        site_slug: None,
    })
}

// ── Startup restore ────────────────────────────────────────

pub fn restore_auth_on_startup(app: &AppHandle) {
    if PB_BASE_URL.is_none() {
        eprintln!("[warn] PB_BASE_URL not configured — auth features disabled");
        return;
    }
    if let Some(token) = load_token(app) {
        if is_token_valid(&token) {
            if let Some(user) = user_info_from_jwt(&token) {
                let state = app.state::<AppState>();
                *state.auth.lock().unwrap() = Some(AuthState { token, user });
            }
        } else {
            clear_token(app);
        }
    }
}

// ── Error mapping ──────────────────────────────────────────

fn map_pb_error(status: u16, body: &str) -> String {
    if status == 429 {
        return "请求过于频繁，请稍后再试".to_string();
    }
    // Try parse PocketBase error JSON
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
        let data = &v["data"];
        if data["email"].is_object() {
            let msg = data["email"]["message"].as_str().unwrap_or("");
            if msg.contains("already exists") || msg.contains("unique") {
                return "该邮箱已注册".to_string();
            }
            if msg.contains("valid") {
                return "邮箱格式不正确".to_string();
            }
        }
        if data["password"].is_object() {
            return "密码长度至少为 8 位".to_string();
        }
        if let Some(msg) = v["message"].as_str() {
            if msg.contains("identity") || msg.contains("password") {
                return "邮箱或密码错误".to_string();
            }
            if msg.contains("verified") {
                return "请先验证邮箱后再登录".to_string();
            }
        }
    }
    match status {
        400 => "邮箱或密码错误".to_string(),
        403 => "请先验证邮箱".to_string(),
        _ => format!("请求失败 ({})", status),
    }
}

// ── Tauri Commands ─────────────────────────────────────────

#[tauri::command]
pub async fn auth_register(email: String, password: String) -> Result<(), String> {
    let pb = pb_url()?;
    let client = reqwest::Client::new();

    // Register
    let res = client
        .post(format!("{}/api/collections/users/records", pb))
        .json(&serde_json::json!({
            "email": email,
            "password": password,
            "passwordConfirm": password,
        }))
        .send()
        .await
        .map_err(|_| "网络连接失败，请检查网络".to_string())?;

    let status = res.status().as_u16();
    if status >= 400 {
        let body = res.text().await.unwrap_or_default();
        return Err(map_pb_error(status, &body));
    }

    // Send verification email
    let _ = client
        .post(format!(
            "{}/api/collections/users/request-verification",
            pb
        ))
        .json(&serde_json::json!({ "email": email }))
        .send()
        .await;

    Ok(())
}

#[tauri::command]
pub async fn auth_login(
    email: String,
    password: String,
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<UserInfo, String> {
    let pb = pb_url()?;
    let client = reqwest::Client::new();

    let res = client
        .post(format!(
            "{}/api/collections/users/auth-with-password",
            pb
        ))
        .json(&serde_json::json!({
            "identity": email,
            "password": password,
        }))
        .send()
        .await
        .map_err(|_| "网络连接失败，请检查网络".to_string())?;

    let status = res.status().as_u16();
    let body = res.text().await.unwrap_or_default();

    if status >= 400 {
        return Err(map_pb_error(status, &body));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&body).map_err(|_| "解析响应失败".to_string())?;

    let token = parsed["token"]
        .as_str()
        .ok_or("响应中缺少 token")?
        .to_string();
    let record = &parsed["record"];

    let mut user = UserInfo {
        id: record["id"].as_str().unwrap_or("").to_string(),
        email: record["email"].as_str().unwrap_or("").to_string(),
        verified: record["verified"].as_bool().unwrap_or(false),
        site_slug: None,
    };

    // Fetch user's sites
    let sites_res = client
        .get(format!("{}/api/collections/sites/records", pb))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await;

    if let Ok(sites_resp) = sites_res {
        if let Ok(sites_body) = sites_resp.text().await {
            if let Ok(sites_json) = serde_json::from_str::<serde_json::Value>(&sites_body) {
                if let Some(items) = sites_json["items"].as_array() {
                    if let Some(first) = items.first() {
                        user.site_slug =
                            first["siteSlug"].as_str().map(|s| s.to_string());
                    }
                }
            }
        }
    }

    save_token(&app, &token);
    *state.auth.lock().unwrap() = Some(AuthState {
        token,
        user: user.clone(),
    });

    Ok(user)
}

#[tauri::command]
pub async fn auth_logout(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    clear_token(&app);
    *state.auth.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub async fn auth_get_status(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<AuthStatusResponse, String> {
    let needs_refresh = {
        let auth_guard = state.auth.lock().unwrap();
        match auth_guard.as_ref() {
            Some(auth) => {
                if token_expires_within(&auth.token, 300) {
                    Some(auth.token.clone())
                } else {
                    None
                }
            }
            None => {
                return Ok(AuthStatusResponse {
                    logged_in: false,
                    user: None,
                });
            }
        }
    };

    // Refresh token if needed (guard is dropped)
    if let Some(old_token) = needs_refresh {
        let client = reqwest::Client::new();
        if let Some(pb) = PB_BASE_URL {
            let res = client
                .post(format!(
                    "{}/api/collections/users/auth-refresh",
                    pb
                ))
                .header("Authorization", format!("Bearer {}", old_token))
                .send()
                .await;

            if let Ok(resp) = res {
                if resp.status().is_success() {
                    if let Ok(body) = resp.text().await {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
                            if let Some(new_token) = v["token"].as_str() {
                                save_token(&app, new_token);
                                let mut auth_guard = state.auth.lock().unwrap();
                                if let Some(auth_mut) = auth_guard.as_mut() {
                                    auth_mut.token = new_token.to_string();
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let auth_guard = state.auth.lock().unwrap();
    let user = auth_guard.as_ref().map(|a| a.user.clone());
    Ok(AuthStatusResponse {
        logged_in: true,
        user,
    })
}

#[tauri::command]
pub async fn auth_request_verification(email: String) -> Result<(), String> {
    let pb = pb_url()?;
    let client = reqwest::Client::new();
    let res = client
        .post(format!(
            "{}/api/collections/users/request-verification",
            pb
        ))
        .json(&serde_json::json!({ "email": email }))
        .send()
        .await
        .map_err(|_| "网络连接失败，请检查网络".to_string())?;

    if res.status().as_u16() >= 400 {
        return Err("发送验证邮件失败".to_string());
    }
    Ok(())
}


#[tauri::command]
pub fn auth_is_configured() -> bool {
    PB_BASE_URL.is_some()
}
