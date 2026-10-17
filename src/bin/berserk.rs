//! Native window and private webview profile. The bundled service belongs to this process.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use serde::Deserialize;
use std::{
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    window::WindowBuilder,
};
use wry::{WebContext, WebViewBuilder};

#[derive(Deserialize)]
struct Bootstrap {
    origin: String,
    port: u16,
    token: String,
}

#[derive(Debug, Deserialize)]
struct Action {
    action: String,
    #[serde(default)]
    payload: String,
    key: String,
}

struct Service(Child);
impl Service {
    fn stop(&mut self) {
        // Closing the only writer also cleans up the service after a GUI crash.
        drop(self.0.stdin.take());
        for _ in 0..40 {
            if self.0.try_wait().ok().flatten().is_some() {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
impl Drop for Service {
    fn drop(&mut self) {
        self.stop();
    }
}

fn hidden(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    command
}

fn codex_environment(command: &mut Command) {
    let mut paths: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        let home = PathBuf::from(home);
        for relative in [".local/bin", ".cargo/bin", ".npm-global/bin", ".volta/bin"] {
            paths.push(home.join(relative));
        }
    }
    if let Ok(path) = std::env::join_paths(paths) {
        command.env("PATH", path);
    }
}

fn start_service(
    directory: &Path,
    smoke: bool,
) -> Result<(Service, Bootstrap), Box<dyn std::error::Error>> {
    let mut command = Command::new(directory.join(if cfg!(windows) {
        "berserk-mcp.exe"
    } else {
        "berserk-mcp"
    }));
    command
        .arg("--app")
        .env("BERSERK_WEB_ROOT", directory.join("web"))
        .env("BERSERK_DESKTOP_PORT", if smoke { "0" } else { "47381" })
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    codex_environment(&mut command);
    let mut service = Service(hidden(&mut command).spawn()?);
    let stdout = service
        .0
        .stdout
        .take()
        .ok_or("Missing service output pipe")?;
    let (send, receive) = mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let result = BufReader::new(stdout.take(4096)).read_line(&mut line);
        let _ = send.send(result.map(|_| line));
    });
    let line = receive.recv_timeout(Duration::from_secs(20))??;
    if line.is_empty() {
        return Err("The local service could not start. Close another copy of Berserk and check that port 47381 is free.".into());
    }
    let info: Bootstrap = serde_json::from_str(&line)?;
    if info.origin != format!("http://127.0.0.1:{}", info.port)
        || info.port == 0
        || info.token.len() != 32
        || !info.token.bytes().all(|c| c.is_ascii_hexdigit())
    {
        return Err("Invalid startup response from bundled service".into());
    }
    Ok((service, info))
}

fn profile_path(smoke: bool) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if smoke {
        return Ok(std::env::temp_dir().join(format!("berserk-gui-test-{}", uuid::Uuid::new_v4())));
    }
    #[cfg(windows)]
    let root = PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA is missing")?);
    #[cfg(not(windows))]
    let root = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
        .ok_or("Home directory is missing")?;
    Ok(root.join("berserk/webview"))
}

fn external(url: &str) {
    // Only ordinary web links can leave the application; never execute a URI scheme.
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return;
    }
    #[cfg(windows)]
    let mut command = {
        let mut c = Command::new("rundll32.exe");
        c.arg("url.dll,FileProtocolHandler");
        c
    };
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(not(any(windows, target_os = "macos")))]
    let mut command = Command::new("xdg-open");
    let _ = hidden(command.arg(url)).spawn();
}

fn trusted(url: &str, origin: &str) -> bool {
    url == origin
        || url
            .strip_prefix(origin)
            .is_some_and(|tail| tail.starts_with('/') || tail.starts_with('#'))
}

fn inform(message: &str) {
    rfd::MessageDialog::new()
        .set_title("Berserk")
        .set_description(message)
        .show();
}

fn smoke_result(path: &Option<PathBuf>, ok: bool, message: &str) {
    let result = format!("{}: {message}\n", if ok { "PASS" } else { "FAIL" });
    if let Some(path) = path {
        let _ = std::fs::write(path, &result);
    }
    eprintln!("{result}");
}

fn run(smoke: bool, report: Option<PathBuf>) -> Result<(), Box<dyn std::error::Error>> {
    let directory = std::env::current_exe()?
        .parent()
        .ok_or("Missing application directory")?
        .to_owned();
    let event_loop = EventLoopBuilder::<Action>::with_user_event().build();
    let window = WindowBuilder::new()
        .with_title("Berserk")
        .with_inner_size(LogicalSize::new(1280.0, 860.0))
        .with_min_inner_size(LogicalSize::new(850.0, 600.0))
        .build(&event_loop)?;
    let (mut service, info) = start_service(&directory, smoke)?;
    let profile = profile_path(smoke)?;
    std::fs::create_dir_all(&profile)?;
    let mut context = WebContext::new(Some(profile));
    let key = uuid::Uuid::new_v4().to_string();
    let script = format!(
        r#"(() => {{
        if (window !== window.top || location.origin !== {origin}) return;
        const key = {key};
        window.__BERSERK_DESKTOP = {pair};
        window.__BERSERK_NATIVE_ACTION = (action, payload = '') => window.ipc.postMessage(JSON.stringify({{action, payload, key}}));
        window.print = () => window.__BERSERK_NATIVE_ACTION('print');
        if ({smoke}) {{
            const poll = setInterval(() => {{
                if (!document.body?.innerText.includes('Мои колоды') || !document.body.innerText.includes('Перенести данные')) return;
                if (document.querySelector('.agent-connection [role=status]')) return;
                if (localStorage.getItem('berserk-leptos-v1') === null) return;
                localStorage.setItem('berserk-native-smoke', 'ok');
                if (localStorage.getItem('berserk-native-smoke') !== 'ok') return;
                clearInterval(poll);
                window.__BERSERK_NATIVE_ACTION('_smoke', 'Native window, bundled Wasm, persistent storage and automatic pairing loaded');
            }}, 250);
        }}
    }})();"#,
        origin = serde_json::to_string(&info.origin)?,
        key = serde_json::to_string(&key)?,
        pair = serde_json::to_string(&format!("{}:{}", info.port, info.token))?,
        smoke = smoke
    );
    let proxy = event_loop.create_proxy();
    let ipc_origin = info.origin.clone();
    let navigation_origin = info.origin.clone();
    let builder = WebViewBuilder::new_with_web_context(&mut context)
        .with_url(&info.origin)
        .with_initialization_script(script)
        .with_ipc_handler(move |request| {
            if !trusted(&request.uri().to_string(), &ipc_origin)
                || request.body().len() > 4 * 1024 * 1024
            {
                return;
            }
            if let Ok(action) = serde_json::from_str::<Action>(request.body())
                && action.key == key
            {
                let _ = proxy.send_event(action);
            }
        })
        .with_navigation_handler(move |url| {
            if trusted(&url, &navigation_origin) {
                true
            } else {
                external(&url);
                false
            }
        })
        .with_new_window_req_handler(move |url, _| {
            external(&url);
            wry::NewWindowResponse::Deny
        });
    #[cfg(target_os = "linux")]
    let web = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        builder.build_gtk(
            window
                .default_vbox()
                .ok_or("Missing GTK content container")?,
        )?
    };
    #[cfg(not(target_os = "linux"))]
    let web = builder.build(&window)?;
    let mut login: Option<Child> = None;
    let deadline = Instant::now() + Duration::from_secs(90);
    event_loop.run(move |event, _, control| {
        *control = ControlFlow::WaitUntil(Instant::now() + Duration::from_millis(200));
        match event {
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => *control = ControlFlow::Exit,
            Event::UserEvent(action) => match action.action.as_str() {
                "_smoke" if smoke => {
                    smoke_result(&report, true, &action.payload);
                    *control = ControlFlow::Exit;
                }
                "save" => {
                    #[derive(Deserialize)]
                    struct Save { name: String, text: String }
                    if let Ok(save) = serde_json::from_str::<Save>(&action.payload) {
                        let name = Path::new(&save.name).file_name().unwrap_or_default().to_string_lossy();
                        if let Some(path) = rfd::FileDialog::new().set_parent(&window).set_file_name(name).save_file()
                            && let Err(error) = std::fs::write(path, save.text) {
                            inform(&format!("Could not save file: {error}"));
                        }
                    }
                }
                "print" => { if let Err(error) = web.print() { inform(&format!("Could not print: {error}")); } }
                "login" if login.is_none() => {
                    let mut command = Command::new(std::env::var_os("BERSERK_CODEX_BIN").unwrap_or_else(|| if cfg!(windows) { "codex.exe".into() } else { "codex".into() }));
                    command.arg("login").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
                    codex_environment(&mut command);
                    match hidden(&mut command).spawn() {
                        Ok(child) => { login = Some(child); inform("Complete Codex sign-in in the browser that opens, then return to Berserk."); }
                        Err(error) => inform(&format!("Codex could not start. Install the Codex CLI, or set BERSERK_CODEX_BIN to its native executable.\n{error}")),
                    }
                }
                _ => {}
            },
            Event::MainEventsCleared => {
                if smoke && Instant::now() >= deadline {
                    smoke_result(&report, false, "Desktop interface did not become ready within 90 seconds");
                    *control = ControlFlow::ExitWithCode(1);
                } else if service.0.try_wait().ok().flatten().is_some() {
                    if smoke { smoke_result(&report, false, "Bundled service stopped unexpectedly"); }
                    else { inform("The local service stopped. Please restart Berserk."); }
                    *control = ControlFlow::ExitWithCode(1);
                }
                if let Some(child) = login.as_mut()
                    && let Ok(Some(status)) = child.try_wait() {
                    login = None;
                    inform(if status.success() { "Signed in to Codex. You can now create decks." } else { "Codex sign-in was not completed. Please try again." });
                }
            }
            Event::LoopDestroyed => {
                if let Some(mut child) = login.take() { let _ = child.kill(); let _ = child.wait(); }
                service.stop();
            }
            _ => {}
        }
    });
}

fn main() {
    // WebKitGTK's DMA-BUF path corrupts animated card canvases on affected Linux
    // drivers (confirmed on AMD/Bazzite). Keep an explicit user override intact.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // SAFETY: this is the first startup operation, before GTK/WebKit or any
        // application threads are started.
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }
    let arguments: Vec<_> = std::env::args_os().collect();
    let smoke = arguments.iter().any(|a| a == "--smoke-test");
    let report = if smoke {
        arguments
            .iter()
            .position(|a| a == "--smoke-result")
            .and_then(|i| arguments.get(i + 1))
            .map(PathBuf::from)
    } else {
        None
    };
    if let Err(error) = run(smoke, report.clone()) {
        if smoke {
            smoke_result(&report, false, &error.to_string());
        } else {
            inform(&format!(
                "Berserk could not start: {error}\nOn Windows, make sure Microsoft Edge WebView2 Runtime is installed."
            ));
        }
        std::process::exit(1);
    }
}
