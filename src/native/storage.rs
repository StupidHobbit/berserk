//! Durable, version-compatible storage. A bad save is never replaced with defaults.
use crate::model::{Catalog, UserData};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::mpsc,
};

pub const MAX_IMPORT_BYTES: u64 = 10_000_000;

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

pub fn read_import(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut text = String::new();
    file.take(MAX_IMPORT_BYTES + 1)
        .read_to_string(&mut text)
        .map_err(|e| e.to_string())?;
    if text.len() as u64 > MAX_IMPORT_BYTES {
        return Err("Файл превышает 10 МБ".into());
    }
    Ok(text)
}

pub fn load(path: &Path, catalog: &Catalog) -> Result<UserData, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(UserData::default()),
        Err(e) => return Err(e.to_string()),
    };
    let user: UserData = serde_json::from_reader(file)
        .map_err(|e| format!("Сохранение повреждено; исходный файл не изменён: {e}"))?;
    user.validate(catalog)?;
    Ok(user)
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing parent directory")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    tmp.write_all(bytes)
        .and_then(|_| tmp.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    File::open(parent)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub struct Store {
    pub path: PathBuf,
    // Held for the lifetime of the app, released by the OS on crashes.
    _lock: File,
    sender: mpsc::Sender<(UserData, mpsc::Sender<Result<(), String>>)>,
}
impl Store {
    pub fn open(root: &Path, ctx: eframe::egui::Context) -> Result<Self, String> {
        fs::create_dir_all(root).map_err(|e| e.to_string())?;
        let lock = File::options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join("native.lock"))
            .map_err(|e| e.to_string())?;
        lock.try_lock()
            .map_err(|_| "Другая копия Berserk уже использует это хранилище.".to_string())?;
        let path = root.join("berserk-leptos-v1.json");
        let target = path.clone();
        let (sender, receiver) = mpsc::channel::<(UserData, mpsc::Sender<Result<(), String>>)>();
        std::thread::Builder::new()
            .name("berserk-storage".into())
            .spawn(move || {
                while let Ok((user, reply)) = receiver.recv() {
                    let result = serde_json::to_vec(&user)
                        .map_err(|e| e.to_string())
                        .and_then(|bytes| atomic_write(&target, &bytes));
                    let _ = reply.send(result);
                    ctx.request_repaint();
                }
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            path,
            _lock: lock,
            sender,
        })
    }
    pub fn save(&self, user: UserData) -> mpsc::Receiver<Result<(), String>> {
        let (tx, rx) = mpsc::channel();
        let _ = self.sender.send((user, tx));
        rx
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_and_corruption_never_reset_data() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("state.json");
        let cat = Catalog::load().unwrap();
        let mut user = UserData::default();
        user.set_count(&cat.cards[0].id, 7);
        user.legacy_draft = Some(serde_json::json!({"opaque": [1,2,3]}));
        atomic_write(&path, &serde_json::to_vec(&user).unwrap()).unwrap();
        assert_eq!(load(&path, &cat).unwrap(), user);
        atomic_write(&path, b"broken").unwrap();
        assert!(load(&path, &cat).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"broken");
    }
    #[test]
    fn exclusive_profile_lock() {
        let root = tempfile::tempdir().unwrap();
        let first = Store::open(root.path(), Default::default()).unwrap();
        assert!(Store::open(root.path(), Default::default()).is_err());
        drop(first);
        assert!(Store::open(root.path(), Default::default()).is_ok());
    }
}
