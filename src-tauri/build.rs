fn main() {
    // Extract s-blog-engine version from Cargo.lock
    println!("cargo:rerun-if-changed=Cargo.lock");
    let lock = std::fs::read_to_string("Cargo.lock").unwrap_or_default();
    let mut version = "unknown";
    let mut found_name = false;
    for line in lock.lines() {
        let line = line.trim();
        if line == r#"name = "s-blog-engine""# {
            found_name = true;
        } else if found_name && line.starts_with("version = ") {
            version = line.trim_start_matches("version = ").trim_matches('"');
            break;
        } else if found_name && line.starts_with("[[") {
            break;
        }
    }
    println!("cargo:rustc-env=S_BLOG_ENGINE_VERSION={version}");

    tauri_build::build()
}
