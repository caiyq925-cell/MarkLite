use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Manager, State, Emitter};

pub struct WatchState {
    watcher: Mutex<Option<RecommendedWatcher>>,
    watched: Mutex<HashMap<String, PathBuf>>,
}

impl Default for WatchState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
            watched: Mutex::new(HashMap::new()),
        }
    }
}

fn start_watcher(app: AppHandle) -> Result<RecommendedWatcher, notify::Error> {
    let app = app.clone();
    RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                // 只关注写入/创建/重命名（内容变更），忽略删除（删除单独处理）
                if event.kind.is_modify() || event.kind.is_create() {
                    for path in event.paths {
                        if let Some(p) = path.to_str() {
                            let _ = app.emit("file-changed", p.to_string());
                        }
                    }
                }
            }
        },
        Config::default().with_poll_interval(std::time::Duration::from_secs(2)),
    )
}

#[tauri::command]
pub fn watch_file(
    app: AppHandle,
    path: String,
    state: State<'_, WatchState>,
) -> Result<(), String> {
    // 初始化 watcher（首次调用时）
    let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;
    if watcher_guard.is_none() {
        *watcher_guard = Some(
            start_watcher(app.clone()).map_err(|e| format!("启动文件监听失败: {}", e))?,
        );
    }
    let watcher = watcher_guard.take();

    // 记录正在监听的文件
    let mut watched = state.watched.lock().map_err(|e| e.to_string())?;
    let path_buf = PathBuf::from(&path);
    watched.insert(path.clone(), path_buf.clone());
    let path_for_watch = path_buf.clone();
    drop(watched);
    drop(watcher_guard);

    // 启动监听
    if let Some(mut w) = watcher {
        w.watch(&path_for_watch, RecursiveMode::NonRecursive)
            .map_err(|e| format!("监听文件失败: {}", e))?;
        *state.watcher.lock().map_err(|e| e.to_string())? = Some(w);
    }

    Ok(())
}

#[tauri::command]
pub fn unwatch_file(
    app: AppHandle,
    path: String,
    state: State<'_, WatchState>,
) -> Result<(), String> {
    let mut watched = state.watched.lock().map_err(|e| e.to_string())?;
    watched.remove(&path);
    // watcher 本身保持运行，只是不再记录该路径；下次 file-changed 事件会过滤
    let _ = app;
    Ok(())
}
