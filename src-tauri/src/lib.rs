mod commands;
mod encoding;
mod file_watch;
mod fs_safe;

use commands::AppState;
use file_watch::WatchState;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths: Vec<String> = argv.into_iter().skip(1).collect();
            let _ = app.emit("open-files", paths);
            // 二次启动（如资源管理器双击 .md）：文档已通过 open-files 事件打开，
            // 这里把已有窗口还原并带到前台，否则用户看不到 MarkLite 弹出
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .manage(AppState::default())
        .manage(WatchState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_argv,
            commands::read_file,
            commands::write_file,
            commands::pick_open,
            commands::pick_save,
            commands::set_asset_root,
            commands::get_config,
            commands::set_config,
            commands::exit_app,
            file_watch::watch_file,
            file_watch::unwatch_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MarkLite");
}
