pub mod commands;
pub mod error;
pub mod models;
pub mod template_fetcher;

use commands::{
    check_directory_exists, init_blog, open_in_explorer, read_directory_tree, select_directory,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            select_directory,
            check_directory_exists,
            read_directory_tree,
            init_blog,
            open_in_explorer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
