use std::sync::Mutex;
use s_blog_engine::serve::ServeHandle;

pub struct AppState {
    pub serve_handle: Mutex<Option<ServeHandle>>,
    pub build_running: Mutex<bool>,
    pub sync_running: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            serve_handle: Mutex::new(None),
            build_running: Mutex::new(false),
            sync_running: Mutex::new(false),
        }
    }
}
