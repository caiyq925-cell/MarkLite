use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, State, Emitter};

#[derive(Default)]
pub struct WatchState {
    watcher: Mutex<Option<RecommendedWatcher>>,
    /// 已 watch 的父目录（去重，避免同一目录多次 watch 报 AlreadyWatching）
    watched_dirs: Mutex<HashSet<PathBuf>>,
    /// 关注的文件绝对路径（回调与命令共享同一份，保证新增文件实时可见）
    watched_files: Arc<Mutex<HashSet<PathBuf>>>,
}

/// Windows 路径大小写不敏感，统一小写规范化用于比较（去掉 \\?\ verbatim 前缀）
fn norm(p: &Path) -> String {
    let s = p.to_string_lossy();
    let s = s.strip_prefix("\\\\?\\").unwrap_or(&s);
    s.to_lowercase().replace('\\', "/")
}

/// 取文件名（小写），用于不依赖目录前缀的文件名匹配
fn file_name(p: &Path) -> String {
    p.file_name()
        .map(|f| f.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

fn start_watcher(app: AppHandle, files: Arc<Mutex<HashSet<PathBuf>>>) -> Result<RecommendedWatcher, notify::Error> {
    let app = app.clone();
    RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let tracked = match files.lock() {
                    Ok(g) => g.clone(),
                    Err(_) => return,
                };
                if tracked.is_empty() {
                    return;
                }
                // 事件路径与关注文件做文件名级匹配（Modify/Create/Remove/Rename 都算变化）：
                // - 事件文件名 == 目标文件名（覆盖 rename 目标、原地写入）
                // - 事件文件名以 "目标文件名." 开头（覆盖 "note.md.tmp123" 这类原子保存临时文件）
                // 不比较完整路径，规避 Windows verbatim 前缀 / 短路径 / 大小写差异
                for path in &event.paths {
                    let ev_name = file_name(path);
                    if ev_name.is_empty() {
                        continue;
                    }
                    let hit = tracked.iter().any(|f| {
                        let t = file_name(f);
                        ev_name == t || ev_name.starts_with(&format!("{}.", t))
                    });
                    if hit {
                        if let Some(p) = path.to_str() {
                            let _ = app.emit("file-changed", p.to_string());
                        }
                    }
                }
            }
        },
        Config::default(),
    )
}

#[tauri::command]
pub fn watch_file(
    app: AppHandle,
    path: String,
    state: State<'_, WatchState>,
) -> Result<(), String> {
    let file = dunce::canonicalize(Path::new(&path)).unwrap_or_else(|_| PathBuf::from(&path));
    let dir = file.parent().map(|d| d.to_path_buf());

    // 记录关注文件（watched_files 是 Arc，回调共享同一份，插入即时可见）
    {
        let mut files = state.watched_files.lock().map_err(|e| e.to_string())?;
        files.insert(file.clone());
    }

    let Some(dir) = dir else {
        return Err("无法确定文件所在目录".into());
    };

    // 首次调用时创建 watcher，回调持有 watched_files 的 Arc（与命令共享同一份）
    let mut wguard = state.watcher.lock().map_err(|e| e.to_string())?;
    if wguard.is_none() {
        *wguard = Some(
            start_watcher(app.clone(), Arc::clone(&state.watched_files))
                .map_err(|e| format!("启动文件监听失败: {}", e))?,
        );
    }
    let mut watcher = wguard.take().unwrap();

    // 同一目录只 watch 一次；无论 watch 是否成功都把 watcher 存回，避免后续调用时丢失
    let result = {
        let mut dirs = state.watched_dirs.lock().map_err(|e| e.to_string())?;
        if dirs.contains(&dir) {
            Ok(())
        } else {
            match watcher.watch(&dir, RecursiveMode::NonRecursive) {
                Ok(()) => {
                    dirs.insert(dir);
                    Ok(())
                }
                Err(e) => Err(format!("监听目录失败 {}: {}", dir.display(), e)),
            }
        }
    };
    *state.watcher.lock().map_err(|e| e.to_string())? = Some(watcher);
    result?;

    Ok(())
}

#[tauri::command]
pub fn unwatch_file(
    _app: AppHandle,
    path: String,
    state: State<'_, WatchState>,
) -> Result<(), String> {
    let file = dunce::canonicalize(Path::new(&path)).unwrap_or_else(|_| PathBuf::from(&path));
    let mut files = state.watched_files.lock().map_err(|e| e.to_string())?;
    files.remove(&file);
    Ok(())
}
