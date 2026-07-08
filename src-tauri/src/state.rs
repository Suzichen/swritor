use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use spage_engine::serve::ServeHandle;

use crate::auth::AuthState;

pub struct AppState {
    pub serve_handle: Mutex<Option<ServeHandle>>,
    pub build_running: Mutex<bool>,
    pub sync_running: Mutex<bool>,
    pub deploy_running: Mutex<bool>,
    pub build_cancel: Arc<AtomicBool>,
    pub sync_cancel: Arc<AtomicBool>,
    pub deploy_cancel: Arc<AtomicBool>,
    pub auth: Mutex<Option<AuthState>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            serve_handle: Mutex::new(None),
            build_running: Mutex::new(false),
            sync_running: Mutex::new(false),
            deploy_running: Mutex::new(false),
            build_cancel: Arc::new(AtomicBool::new(false)),
            sync_cancel: Arc::new(AtomicBool::new(false)),
            deploy_cancel: Arc::new(AtomicBool::new(false)),
            auth: Mutex::new(None),
        }
    }
}
