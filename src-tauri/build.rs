fn main() {
    // Load .env for API URLs
    println!("cargo:rerun-if-changed=.env");
    if let Ok(content) = std::fs::read_to_string(".env") {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let value = value.trim();
                if key == "PB_BASE_URL" || key == "DEPLOY_API_BASE_URL" {
                    println!("cargo:rustc-env={}={}", key, value);
                }
            }
        }
    }

    // Warn if not set via .env or environment
    if std::env::var("PB_BASE_URL").is_err()
        && std::fs::read_to_string(".env")
            .map(|c| !c.contains("PB_BASE_URL"))
            .unwrap_or(true)
    {
        println!("cargo:warning=PB_BASE_URL not set — auth features will be disabled");
    }
    if std::env::var("DEPLOY_API_BASE_URL").is_err()
        && std::fs::read_to_string(".env")
            .map(|c| !c.contains("DEPLOY_API_BASE_URL"))
            .unwrap_or(true)
    {
        println!("cargo:warning=DEPLOY_API_BASE_URL not set — deploy features will be disabled");
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
