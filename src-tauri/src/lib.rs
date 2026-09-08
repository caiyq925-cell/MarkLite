mod commands;
mod encoding;
mod file_watch;
mod fs_safe;

use commands::AppState;
use file_watch::WatchState;
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths: Vec<String> = argv.into_iter().skip(1).collect();
            let _ = app.emit("open-files", paths);
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
