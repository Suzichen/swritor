pub mod commands;
pub mod error;
pub mod models;
pub mod shell_fetcher;
pub mod state;
pub mod template_fetcher;

use tauri::{Manager, RunEvent};

use commands::*;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            select_directory,
            check_directory_exists,
            read_directory_tree,
            init_blog,
            open_in_explorer,
            list_posts,
            get_post,
            save_post,
            delete_post,
            create_post,
            list_albums,
            read_config,
            write_config,
            select_image,
            copy_to_public,
            start_serve,
            stop_serve,
            get_serve_status,
            build_blog,
            sync_media,
            check_sync_available,
            get_task_status,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<AppState>() {
                if let Some(mut handle) = state.serve_handle.lock().unwrap().take() {
                    handle.shutdown();
                }
            }
            std::process::exit(0);
        }
    });
}
