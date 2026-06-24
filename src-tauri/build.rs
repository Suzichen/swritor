fn main() {
    // Env vars to embed at compile time.
    // Priority: environment variable > .env file
    const KEYS: &[&str] = &["PB_BASE_URL", "DEPLOY_API_BASE_URL"];

    println!("cargo:rerun-if-changed=.env");

    // Parse .env as fallback values
    let env_file: Vec<(String, String)> = std::fs::read_to_string(".env")
        .unwrap_or_default()
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (k, v) = line.split_once('=')?;
            Some((k.trim().to_string(), v.trim().to_string()))
        })
        .collect();

    for key in KEYS {
        if let Ok(val) = std::env::var(key) {
            // Use environment variable (CI sets these)
            println!("cargo:rustc-env={}={}", key, val);
        } else if let Some((_, val)) = env_file.iter().find(|(k, _)| k == key) {
            // Fallback to .env file (local dev)
            println!("cargo:rustc-env={}={}", key, val);
        } else {
            println!("cargo:warning={} not set", key);
        }
    }

    // Extract s-blog-engine and s-blog-scaffold versions from Cargo.lock
    println!("cargo:rerun-if-changed=Cargo.lock");
    let lock = std::fs::read_to_string("Cargo.lock").unwrap_or_default();
    
    let mut engine_version = String::from("unknown");
    let mut template_version = String::from("unknown");
    let mut current_name = String::new();

    for line in lock.lines() {
        let line = line.trim();
        if line.starts_with("name = ") {
            current_name = line.trim_start_matches("name = ").trim_matches('"').to_string();
        } else if line.starts_with("version = ") {
            let v = line.trim_start_matches("version = ").trim_matches('"').to_string();
            if current_name == "s-blog-engine" && engine_version == "unknown" {
                engine_version = v;
            } else if current_name == "s-blog-scaffold" && template_version == "unknown" {
                template_version = v;
            }
        }
    }

    println!("cargo:rustc-env=S_BLOG_ENGINE_VERSION={}", engine_version);
    println!("cargo:rustc-env=S_BLOG_TEMPLATE_VERSION={}", template_version);

    tauri_build::build()
}
