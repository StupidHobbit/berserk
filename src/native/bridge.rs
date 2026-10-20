//! Keep the existing authenticated service protocol, validation and Codex sandbox.
use crate::agent::{BrowserReply, BrowserRequest, BuildEvent};
use eframe::egui;
use std::{
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::Duration,
};
use tungstenite::{Message, client::IntoClientRequest};

pub enum Event {
    Connected,
    Request(Box<BrowserRequest>),
    Error(String),
}
pub enum Outgoing {
    Build(BuildEvent),
    Reply(BrowserReply),
}
pub struct Bridge {
    pub incoming: mpsc::Receiver<Event>,
    pub outgoing: mpsc::Sender<Outgoing>,
    stop: Arc<AtomicBool>,
}
struct Service(Child);
impl Drop for Service {
    fn drop(&mut self) {
        drop(self.0.stdin.take());
        for _ in 0..40 {
            if self.0.try_wait().ok().flatten().is_some() {
                return;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
pub fn configure(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut paths: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|v| std::env::split_paths(&v).collect())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        for relative in [".local/bin", ".cargo/bin", ".npm-global/bin", ".volta/bin"] {
            paths.push(PathBuf::from(&home).join(relative));
        }
    }
    #[cfg(target_os = "macos")]
    paths.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    if let Ok(path) = std::env::join_paths(paths) {
        command.env("PATH", path);
    }
}
pub fn codex_command() -> Command {
    let binary = std::env::var_os("BERSERK_CODEX_BIN").unwrap_or_else(|| {
        if cfg!(windows) {
            "codex.exe".into()
        } else {
            "codex".into()
        }
    });
    let mut command = Command::new(binary);
    configure(&mut command);
    command
}
impl Bridge {
    #[cfg(test)]
    pub(super) fn for_test(
        incoming: mpsc::Receiver<Event>,
        outgoing: mpsc::Sender<Outgoing>,
    ) -> Self {
        Self {
            incoming,
            outgoing,
            stop: Arc::new(AtomicBool::new(false)),
        }
    }
    pub fn start(directory: &Path, ctx: egui::Context, pair_url: Option<String>) -> Self {
        let (incoming_tx, incoming) = mpsc::channel();
        let (outgoing, receiver) = mpsc::channel();
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let directory = directory.to_owned();
        std::thread::spawn(move || {
            let send = |event| {
                let _ = incoming_tx.send(event);
                ctx.request_repaint();
            };
            let result = (|| -> Result<(), String> {
                let (_service, origin, port, token) = if let Some(url) = pair_url {
                    let (origin, pair) = url
                        .trim()
                        .split_once("/#agent=")
                        .ok_or("Expected connection_info connect_url")?;
                    let (port, token) = pair.split_once(':').ok_or("Invalid pair")?;
                    let parsed: tungstenite::http::Uri =
                        origin.parse().map_err(|_| "Invalid origin")?;
                    if parsed.scheme_str() != Some("http")
                        || !matches!(parsed.host(), Some("localhost" | "127.0.0.1"))
                        || parsed.path() != "/"
                    {
                        return Err("Only loopback HTTP origins can pair".into());
                    }
                    (
                        None,
                        origin.to_string(),
                        port.parse::<u16>().map_err(|_| "Invalid port")?,
                        token.to_string(),
                    )
                } else {
                    let mut command = Command::new(directory.join(if cfg!(windows) {
                        "berserk-mcp.exe"
                    } else {
                        "berserk-mcp"
                    }));
                    configure(&mut command);
                    command
                        .arg("--native-app")
                        .env("BERSERK_DESKTOP_PORT", "0")
                        .stdin(Stdio::piped())
                        .stdout(Stdio::piped())
                        .stderr(Stdio::null());
                    let mut service = Service(
                        command
                            .spawn()
                            .map_err(|e| format!("Не удалось запустить berserk-mcp: {e}"))?,
                    );
                    let stdout = service.0.stdout.take().ok_or("Missing service output")?;
                    let (tx, rx) = mpsc::channel();
                    std::thread::spawn(move || {
                        let mut line = String::new();
                        let result = BufReader::new(stdout.take(4096))
                            .read_line(&mut line)
                            .map(|_| line);
                        let _ = tx.send(result);
                    });
                    let line = rx
                        .recv_timeout(Duration::from_secs(20))
                        .map_err(|e| e.to_string())?
                        .map_err(|e| e.to_string())?;
                    #[derive(serde::Deserialize)]
                    struct Bootstrap {
                        origin: String,
                        port: u16,
                        token: String,
                    }
                    let info: Bootstrap = serde_json::from_str(&line).map_err(|e| e.to_string())?;
                    if info.origin != format!("http://127.0.0.1:{}", info.port) {
                        return Err("Invalid service origin".into());
                    }
                    (Some(service), info.origin, info.port, info.token)
                };
                if port == 0 || token.len() != 32 || !token.bytes().all(|c| c.is_ascii_hexdigit()) {
                    return Err("Invalid bridge credentials".into());
                }
                let mut request = format!("ws://127.0.0.1:{port}/bridge?token={token}")
                    .into_client_request()
                    .map_err(|e| e.to_string())?;
                request
                    .headers_mut()
                    .insert("Origin", origin.parse().map_err(|_| "Invalid origin")?);
                let stream = std::net::TcpStream::connect_timeout(
                    &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
                    Duration::from_secs(5),
                )
                .map_err(|e| e.to_string())?;
                stream
                    .set_read_timeout(Some(Duration::from_millis(100)))
                    .map_err(|e| e.to_string())?;
                stream
                    .set_write_timeout(Some(Duration::from_secs(5)))
                    .map_err(|e| e.to_string())?;
                let (mut socket, _) =
                    tungstenite::client(request, stream).map_err(|e| e.to_string())?;
                send(Event::Connected);
                while !stopping.load(Ordering::Relaxed) {
                    while let Ok(message) = receiver.try_recv() {
                        let text = match message {
                            Outgoing::Build(e) => serde_json::to_string(&e),
                            Outgoing::Reply(r) => serde_json::to_string(&r),
                        }
                        .map_err(|e| e.to_string())?;
                        socket
                            .send(Message::Text(text.into()))
                            .map_err(|e| e.to_string())?;
                    }
                    match socket.read() {
                        Ok(Message::Text(text)) if text.len() <= 2 * 1024 * 1024 => send(
                            Event::Request(serde_json::from_str(&text).map_err(|e| e.to_string())?),
                        ),
                        Ok(Message::Close(_)) => return Err("Соединение с агентом закрыто".into()),
                        Ok(Message::Text(_)) => return Err("Bridge message too large".into()),
                        Ok(_) => {}
                        Err(tungstenite::Error::Io(e))
                            if matches!(
                                e.kind(),
                                std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                            ) => {}
                        Err(e) => return Err(e.to_string()),
                    }
                }
                let _ = socket.close(None);
                Ok(())
            })();
            if let Err(error) = result {
                send(Event::Error(error));
            }
        });
        Self {
            incoming,
            outgoing,
            stop,
        }
    }
}
impl Drop for Bridge {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}
