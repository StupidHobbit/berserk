//! Shared persistent profile location for the desktop app and MCP processes.
use std::path::PathBuf;

pub fn data_dir() -> Result<PathBuf, String> {
    if let Some(root) = std::env::var_os("BERSERK_DATA_DIR") {
        return Ok(root.into());
    }
    #[cfg(target_os = "windows")]
    let root = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    #[cfg(target_os = "macos")]
    let root =
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"));
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let root = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")));
    root.map(|r| r.join("berserk"))
        .ok_or_else(|| "Cannot locate application data directory".into())
}
