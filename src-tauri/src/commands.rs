use crate::encoding::{decode_bytes, encode_text, EncodingKind, Newline};
use crate::fs_safe::{canonicalize_existing, canonicalize_for_write, require_markdown};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

const MAX_PREVIEW_SIZE: u64 = 10 * 1024 * 1024;

#[derive(Debug, Default)]
pub struct AppState {
    pub asset_root: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileResult {
    pub text: String,
    pub encoding: EncodingKind,
    pub bom: bool,
    pub newline: Newline,
    pub size: u64,
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileRequest {
    pub path: String,
    pub text: String,
    pub bom: bool,
    pub newline: Newline,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeom {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    pub maximized: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub window: Option<WindowGeom>,
    pub split_ratio: f32,
    pub block_remote_images: bool,
    #[serde(default = "default_entity_intensity")]
    pub entity_intensity: String,
    #[serde(default)]
    pub entity_blacklist: Vec<String>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_follow_system")]
    pub follow_system: bool,
    pub accent: Option<String>,
}

fn default_entity_intensity() -> String {
    "aggressive".into()
}

fn default_theme() -> String {
    "light".into()
}

fn default_follow_system() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            window: None,
            split_ratio: 0.5,
            block_remote_images: false,
            entity_intensity: default_entity_intensity(),
            entity_blacklist: Vec::new(),
            theme: default_theme(),
            follow_system: default_follow_system(),
            accent: None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("{0}")]
    Message(String),
    #[error("文件过大")]
    FileTooLarge,
}

impl Serialize for CommandError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for CommandError {
    fn from(e: std::io::Error) -> Self {
        CommandError::Message(e.to_string())
    }
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("文件")
        .to_string()
}

pub fn read_file_at(path: &Path, force: bool) -> Result<ReadFileResult, CommandError> {
    require_markdown(path)
        .map_err(|e| CommandError::Message(format!("{}：{}", display_name(path), e)))?;
    let canon = canonicalize_existing(path).map_err(|_| {
        CommandError::Message(format!(
            "无法打开 {}：路径不存在或无权读取",
            display_name(path)
        ))
    })?;
    let meta = fs::metadata(&canon)?;
    let size = meta.len();
    if size > MAX_PREVIEW_SIZE && !force {
        return Err(CommandError::FileTooLarge);
    }
    let bytes = fs::read(&canon)?;
    let decoded = decode_bytes(&bytes)
        .map_err(|_| CommandError::Message(format!("无法识别 {} 为文本", display_name(&canon))))?;
    Ok(ReadFileResult {
        text: decoded.text,
        encoding: decoded.encoding,
        bom: decoded.bom,
        newline: decoded.newline,
        size,
        path: canon.to_string_lossy().into_owned(),
    })
}

pub fn write_file_at(req: &WriteFileRequest) -> Result<(), CommandError> {
    let path = Path::new(&req.path);
    require_markdown(path)
        .map_err(|e| CommandError::Message(format!("{}：{}", display_name(path), e)))?;
    let canon = canonicalize_for_write(path).map_err(|_| {
        CommandError::Message(format!("无法写入 {}：路径非法", display_name(path)))
    })?;
    let bytes = encode_text(&req.text, req.bom, req.newline);
    let tmp = canon.with_extension(format!(
        "{}.marklite.tmp",
        canon.extension().and_then(|s| s.to_str()).unwrap_or("md")
    ));
    fs::write(&tmp, &bytes).map_err(|e| {
        CommandError::Message(format!("无法保存 {}：{}", display_name(&canon), e))
    })?;
    fs::rename(&tmp, &canon).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        CommandError::Message(format!("无法保存 {}：{}", display_name(&canon), e))
    })?;
    Ok(())
}

fn config_path(app: &AppHandle) -> Result<PathBuf, CommandError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| CommandError::Message(e.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("config.json"))
}

#[tauri::command]
pub fn get_argv() -> Vec<String> {
    std::env::args().skip(1).collect()
}

#[tauri::command]
pub fn read_file(path: String, force: Option<bool>) -> Result<ReadFileResult, CommandError> {
    read_file_at(Path::new(&path), force.unwrap_or(false))
}

#[tauri::command]
pub fn write_file(
    path: String,
    text: String,
    bom: bool,
    newline: Newline,
) -> Result<(), CommandError> {
    write_file_at(&WriteFileRequest {
        path,
        text,
        bom,
        newline,
    })
}

#[tauri::command]
pub fn pick_open(app: AppHandle) -> Result<Vec<String>, CommandError> {
    let files = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "mdown"])
        .blocking_pick_files();
    Ok(files
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p| match p {
            FilePath::Path(path) => Some(path.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect())
}

#[tauri::command]
pub fn pick_save(
    app: AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, CommandError> {
    let mut dlg = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "mdown"]);
    if let Some(p) = default_path {
        dlg = dlg.set_file_name(p);
    }
    Ok(dlg.blocking_save_file().and_then(|p| match p {
        FilePath::Path(path) => Some(path.to_string_lossy().into_owned()),
        _ => None,
    }))
}

#[tauri::command]
pub fn set_asset_root(state: State<AppState>, dir: String) -> Result<(), CommandError> {
    let path = PathBuf::from(dir);
    let canon = canonicalize_existing(&path)
        .map_err(|_| CommandError::Message("资源根目录无效".into()))?;
    *state.asset_root.lock().unwrap() = Some(canon);
    Ok(())
}

#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<AppConfig, CommandError> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

#[tauri::command]
pub fn set_config(app: AppHandle, config: AppConfig) -> Result<(), CommandError> {
    let path = config_path(&app)?;
    let raw =
        serde_json::to_string_pretty(&config).map_err(|e| CommandError::Message(e.to_string()))?;
    fs::write(path, raw)?;
    Ok(())
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_md(name: &str, body: &[u8]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("marklite-cmd-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        let mut f = fs::File::create(&path).unwrap();
        f.write_all(body).unwrap();
        path
    }

    #[test]
    fn read_utf8_md() {
        let path = temp_md("a.md", b"# hi\n");
        let r = read_file_at(&path, false).unwrap();
        assert_eq!(r.text, "# hi\n");
        assert_eq!(r.encoding, EncodingKind::Utf8);
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn reject_non_markdown() {
        let path = temp_md("a.txt", b"x");
        let err = read_file_at(&path, false).unwrap_err();
        assert!(err.to_string().contains("扩展名"));
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn missing_file() {
        let err = read_file_at(Path::new("/tmp/marklite-missing-xyz.md"), false).unwrap_err();
        assert!(err.to_string().contains("无法打开"));
    }

    #[test]
    fn write_then_read() {
        let path = temp_md("b.md", b"old");
        write_file_at(&WriteFileRequest {
            path: path.to_string_lossy().into_owned(),
            text: "new\n".into(),
            bom: false,
            newline: Newline::Lf,
        })
        .unwrap();
        let r = read_file_at(&path, false).unwrap();
        assert_eq!(r.text, "new\n");
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn too_large() {
        let dir = std::env::temp_dir().join(format!("marklite-big-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("big.md");
        let f = fs::File::create(&path).unwrap();
        f.set_len(MAX_PREVIEW_SIZE + 1).unwrap();
        let err = read_file_at(&path, false).unwrap_err();
        assert!(matches!(err, CommandError::FileTooLarge));
        let _ = fs::remove_dir_all(&dir);
    }
}
