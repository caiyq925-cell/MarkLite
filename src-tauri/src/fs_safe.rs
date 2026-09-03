use std::path::{Path, PathBuf};

const MARKDOWN_EXTS: &[&str] = &["md", "markdown", "mdown"];
const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg"];

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum PathError {
    #[error("路径非法")]
    Invalid,
    #[error("扩展名不受支持")]
    UnsupportedExtension,
    #[error("路径越界")]
    Escape,
}

pub fn extension_lower(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
}

pub fn is_markdown_path(path: &Path) -> bool {
    extension_lower(path)
        .map(|ext| MARKDOWN_EXTS.contains(&ext.as_str()))
        .unwrap_or(false)
}

pub fn is_image_path(path: &Path) -> bool {
    extension_lower(path)
        .map(|ext| IMAGE_EXTS.contains(&ext.as_str()))
        .unwrap_or(false)
}

pub fn require_markdown(path: &Path) -> Result<(), PathError> {
    if is_markdown_path(path) {
        Ok(())
    } else {
        Err(PathError::UnsupportedExtension)
    }
}

pub fn canonicalize_existing(path: &Path) -> Result<PathBuf, PathError> {
    dunce::canonicalize(path).map_err(|_| PathError::Invalid)
}

pub fn canonicalize_for_write(path: &Path) -> Result<PathBuf, PathError> {
    if let Ok(p) = dunce::canonicalize(path) {
        return Ok(p);
    }
    let parent = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or_else(|| Path::new("."));
    let parent = dunce::canonicalize(parent).map_err(|_| PathError::Invalid)?;
    let name = path.file_name().ok_or(PathError::Invalid)?;
    Ok(parent.join(name))
}

pub fn is_within(root: &Path, target: &Path) -> bool {
    let Ok(root) = dunce::canonicalize(root) else {
        return false;
    };
    let Ok(target) = dunce::canonicalize(target) else {
        return false;
    };
    target.starts_with(&root)
}

pub fn ensure_within(root: &Path, target: &Path) -> Result<PathBuf, PathError> {
    if !is_within(root, target) {
        return Err(PathError::Escape);
    }
    canonicalize_existing(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("marklite-fs-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn markdown_extensions() {
        assert!(is_markdown_path(Path::new("a.md")));
        assert!(is_markdown_path(Path::new("A.MD")));
        assert!(is_markdown_path(Path::new("a.markdown")));
        assert!(is_markdown_path(Path::new("a.mdown")));
        assert!(!is_markdown_path(Path::new("a.txt")));
        assert!(!is_markdown_path(Path::new("a")));
    }

    #[test]
    fn image_extensions() {
        assert!(is_image_path(Path::new("x.PNG")));
        assert!(is_image_path(Path::new("x.webp")));
        assert!(!is_image_path(Path::new("x.md")));
    }

    #[test]
    fn traversal_is_rejected() {
        let root = temp_dir();
        let nested = root.join("docs");
        fs::create_dir_all(&nested).unwrap();
        let outside = root.join("secret.txt");
        let mut f = fs::File::create(&outside).unwrap();
        f.write_all(b"no").unwrap();
        let attack = nested.join("..").join("secret.txt");
        assert_eq!(ensure_within(&nested, &attack), Err(PathError::Escape));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn child_file_is_allowed() {
        let root = temp_dir();
        let child = root.join("pic.png");
        fs::write(&child, b"x").unwrap();
        let got = ensure_within(&root, &child).unwrap();
        assert_eq!(got, dunce::canonicalize(&child).unwrap());
        fs::remove_dir_all(&root).ok();
    }
}
