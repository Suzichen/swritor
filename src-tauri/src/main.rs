// S-Blog Admin - Tauri 应用程序入口
// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    s_blog_admin_lib::run()
}
