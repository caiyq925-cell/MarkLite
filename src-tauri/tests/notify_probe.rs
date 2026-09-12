use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::fs;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

#[test]
fn notify_catches_atomic_rename_save() {
    let dir = std::env::temp_dir().join(format!("marklite-watch-probe-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let target = dir.join("note.md");
    fs::write(&target, "# hello").unwrap();

    let (tx, rx) = mpsc::channel();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(e) = res {
                let _ = tx.send(e);
            }
        },
        Config::default(),
    )
    .unwrap();
    watcher.watch(&dir, RecursiveMode::NonRecursive).unwrap();

    // 模拟原子保存：写临时文件 + rename 覆盖
    std::thread::sleep(Duration::from_millis(300));
    let tmp = dir.join("note.md.tmp123");
    fs::write(&tmp, "# modified").unwrap();
    fs::rename(&tmp, &target).unwrap();

    let deadline = Instant::now() + Duration::from_secs(5);
    let mut saw_target = false;
    let mut saw_tmp = false;
    while Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(ev) => {
                for p in &ev.paths {
                    let s = p.to_string_lossy();
                    if s.contains("note.md") && !s.contains("probe-") {
                        println!("EVENT kind={:?} path={}", ev.kind, s);
                    }
                    if s.ends_with("note.md") { saw_target = true; }
                    if s.contains("note.md.tmp") { saw_tmp = true; }
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(_) => break,
        }
    }
    fs::remove_dir_all(&dir).ok();
    println!("SAW_TARGET={} SAW_TMP={}", saw_target, saw_tmp);
    assert!(saw_target || saw_tmp, "notify received nothing for note.md");
}
