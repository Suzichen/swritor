use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use s_blog_engine::serve::ServeHandle;

pub struct AppState {
    pub serve_handle: Mutex<Option<ServeHandle>>,
    pub build_running: Mutex<bool>,
    pub sync_running: Mutex<bool>,
    pub build_cancel: Arc<AtomicBool>,
    pub sync_cancel: Arc<AtomicBool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            serve_handle: Mutex::new(None),
            build_running: Mutex::new(false),
            sync_running: Mutex::new(false),
            build_cancel: Arc::new(AtomicBool::new(false)),
            sync_cancel: Arc::new(AtomicBool::new(false)),
        }
    }
}
