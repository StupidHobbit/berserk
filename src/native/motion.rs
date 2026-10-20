//! Query accessibility preferences off-thread, on launch and when returning to the app.
use eframe::egui;
use std::sync::mpsc;

pub struct Motion {
    pub reduced: bool,
    focused: bool,
    receiver: Option<mpsc::Receiver<bool>>,
}
impl Motion {
    pub fn new(ctx: &egui::Context) -> Self {
        let mut motion = Self {
            reduced: false,
            focused: true,
            receiver: None,
        };
        motion.refresh(ctx);
        motion
    }
    fn refresh(&mut self, ctx: &egui::Context) {
        let (tx, rx) = mpsc::channel();
        self.receiver = Some(rx);
        let ctx = ctx.clone();
        std::thread::spawn(move || {
            let _ = tx.send(detect());
            ctx.request_repaint();
        });
    }
    pub fn poll(&mut self, ctx: &egui::Context) {
        if let Some(value) = self.receiver.as_ref().and_then(|rx| rx.try_recv().ok()) {
            self.reduced = value;
            self.receiver = None;
        }
        let focused = ctx.input(|i| i.viewport().focused.unwrap_or(true));
        if focused && !self.focused && self.receiver.is_none() {
            self.refresh(ctx);
        }
        self.focused = focused;
    }
}
#[cfg(not(windows))]
fn query(program: &str, args: &[&str]) -> Option<String> {
    let output = std::process::Command::new(program)
        .args(args)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}
#[cfg(target_os = "macos")]
fn detect() -> bool {
    query(
        "defaults",
        &["read", "com.apple.universalaccess", "reduceMotion"],
    )
    .is_some_and(|s| s == "1" || s == "true")
}
#[cfg(target_os = "linux")]
fn detect() -> bool {
    if query(
        "gsettings",
        &["get", "org.gnome.desktop.interface", "enable-animations"],
    )
    .is_some_and(|s| s == "false")
    {
        return true;
    }
    for command in ["kreadconfig6", "kreadconfig5"] {
        if query(
            command,
            &[
                "--file",
                "kdeglobals",
                "--group",
                "KDE",
                "--key",
                "AnimationDurationFactor",
            ],
        )
        .is_some_and(|s| s.parse::<f32>() == Ok(0.0))
        {
            return true;
        }
    }
    false
}
#[cfg(windows)]
fn detect() -> bool {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn SystemParametersInfoW(
            action: u32,
            parameter: u32,
            value: *mut std::ffi::c_void,
            flags: u32,
        ) -> i32;
    }
    let mut enabled = 1i32;
    // SAFETY: SPI_GETCLIENTAREAANIMATION writes one BOOL to this valid, aligned buffer.
    let ok = unsafe { SystemParametersInfoW(0x1042, 0, (&mut enabled as *mut i32).cast(), 0) };
    ok != 0 && enabled == 0
}
