// Swritor - Tauri 应用程序入口
// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Windows: 注册 Console Ctrl Handler 强制退出（防止后台 runtime 阻止终止）
    #[cfg(windows)]
    unsafe {
        unsafe extern "system" fn handler(_: u32) -> i32 {
            std::process::exit(0);
        }
        windows_sys::Win32::System::Console::SetConsoleCtrlHandler(Some(handler), 1);
    }

    s_writor_lib::run()
}
