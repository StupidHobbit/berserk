//! Cache only a sanitized CLI status, never credentials or raw command output.
use super::bridge;
use eframe::egui;
use std::{
    io::{Read, Seek, SeekFrom},
    process::{Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

const CACHE_TTL: Duration = Duration::from_secs(300);
const ERROR_TTL: Duration = Duration::from_secs(30);
const CHECK_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) enum Status {
    #[default]
    Unknown,
    SignedIn,
    SignedOut,
    Missing,
    Failed,
    TimedOut,
}
impl Status {
    pub(super) fn label(self) -> &'static str {
        match self {
            Self::Unknown => "Проверяем вход в Codex…",
            Self::SignedIn => "Вход в Codex выполнен",
            Self::SignedOut => "Вход в Codex не выполнен",
            Self::Missing => "Codex CLI не найден",
            Self::Failed => "Не удалось проверить вход в Codex",
            Self::TimedOut => "Codex не ответил на проверку входа",
        }
    }
    fn ttl(self) -> Duration {
        match self {
            Self::SignedIn | Self::SignedOut => CACHE_TTL,
            _ => ERROR_TTL,
        }
    }
}

#[derive(Default)]
pub(super) struct Auth {
    pub(super) status: Status,
    checked: Option<Instant>,
    pending: Option<(u64, mpsc::Receiver<Status>)>,
    generation: u64,
}
impl Auth {
    #[cfg(test)]
    pub(super) fn cached_for_test(status: Status) -> Self {
        Self {
            status,
            checked: Some(Instant::now()),
            ..Default::default()
        }
    }
    pub(super) fn checking(&self) -> bool {
        self.pending.is_some()
    }
    pub(super) fn age(&self) -> Option<Duration> {
        self.checked.map(|t| t.elapsed())
    }
    fn fresh(&self, now: Instant) -> bool {
        self.checked
            .is_some_and(|time| now.saturating_duration_since(time) < self.status.ttl())
    }
    pub(super) fn invalidate(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.checked = None;
        self.status = Status::Unknown;
    }
    pub(super) fn ensure(&mut self, ctx: &egui::Context) {
        self.request(ctx, bridge::codex_command, |command| {
            check(command, CHECK_TIMEOUT)
        });
        if !self.checking()
            && let Some(age) = self.age()
        {
            ctx.request_repaint_after(self.status.ttl().saturating_sub(age));
        }
    }
    fn request(
        &mut self,
        ctx: &egui::Context,
        command: impl FnOnce() -> Command + Send + 'static,
        check: impl FnOnce(Command) -> Status + Send + 'static,
    ) {
        if self.pending.is_some() || self.fresh(Instant::now()) {
            return;
        }
        let (tx, rx) = mpsc::channel();
        self.pending = Some((self.generation, rx));
        let ctx = ctx.clone();
        std::thread::spawn(move || {
            let _ = tx.send(check(command()));
            ctx.request_repaint();
        });
    }
    pub(super) fn poll(&mut self) {
        let result = self
            .pending
            .as_ref()
            .and_then(|(generation, rx)| match rx.try_recv() {
                Ok(status) => Some((*generation, status)),
                Err(mpsc::TryRecvError::Disconnected) => Some((*generation, Status::Failed)),
                Err(mpsc::TryRecvError::Empty) => None,
            });
        if let Some((generation, status)) = result {
            self.pending = None;
            if generation == self.generation {
                self.status = status;
                self.checked = Some(Instant::now());
            }
        }
    }
}

fn classify(success: bool, output: &str) -> Status {
    if success {
        return Status::SignedIn;
    }
    let output = output.to_ascii_lowercase();
    if output
        .lines()
        .any(|line| matches!(line.trim(), "not logged in" | "not signed in"))
    {
        Status::SignedOut
    } else {
        Status::Failed
    }
}

fn check(mut command: Command, timeout: Duration) -> Status {
    // Anonymous temporary output avoids pipe deadlocks and is deleted on close.
    // Nothing from it is logged, displayed or added to the status cache.
    let Ok(mut output) = tempfile::tempfile() else {
        return Status::Failed;
    };
    let (Ok(stdout), Ok(stderr)) = (output.try_clone(), output.try_clone()) else {
        return Status::Failed;
    };
    command
        .args(["login", "status"])
        .stdin(Stdio::null())
        .stdout(stdout)
        .stderr(stderr);
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Status::Missing,
        Err(_) => return Status::Failed,
    };
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(40)),
            other => {
                let _ = child.kill();
                let _ = child.wait();
                return if other.is_err() {
                    Status::Failed
                } else {
                    Status::TimedOut
                };
            }
        }
    };
    if status.success() {
        return Status::SignedIn;
    }
    if output.seek(SeekFrom::Start(0)).is_err() {
        return Status::Failed;
    }
    let mut text = String::new();
    if output.take(16 * 1024).read_to_string(&mut text).is_err() {
        return Status::Failed;
    }
    classify(false, &text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    #[test]
    fn login_failures_are_not_confused_with_signed_out_or_exposed_in_ui() {
        assert_eq!(
            classify(true, "Logged in using an API key - secret"),
            Status::SignedIn
        );
        assert_eq!(
            classify(false, "warning\nNot logged in\n"),
            Status::SignedOut
        );
        assert_eq!(
            classify(false, "Error loading configuration"),
            Status::Failed
        );
        assert_eq!(classify(false, ""), Status::Failed);
        assert_eq!(
            check(
                Command::new("berserk-test-nonexistent-codex"),
                Duration::from_secs(1)
            ),
            Status::Missing
        );
    }

    #[test]
    fn cache_single_flight_expiry_and_invalidation() {
        let ctx = egui::Context::default();
        let count = Arc::new(AtomicUsize::new(0));
        let mut auth = Auth::default();
        let request = |auth: &mut Auth| {
            let count = count.clone();
            auth.request(
                &ctx,
                || Command::new("unused"),
                move |_| {
                    count.fetch_add(1, Ordering::SeqCst);
                    Status::SignedIn
                },
            );
        };
        let settle = |auth: &mut Auth| {
            let deadline = Instant::now() + Duration::from_secs(2);
            while auth.checking() {
                assert!(Instant::now() < deadline);
                auth.poll();
                std::thread::sleep(Duration::from_millis(1));
            }
        };
        for _ in 0..100 {
            request(&mut auth);
        }
        settle(&mut auth);
        assert_eq!(count.load(Ordering::SeqCst), 1);
        assert_eq!(auth.status, Status::SignedIn);
        request(&mut auth);
        assert!(!auth.checking());
        let checked = auth.checked.unwrap();
        assert!(auth.fresh(checked + CACHE_TTL - Duration::from_millis(1)));
        assert!(!auth.fresh(checked + CACHE_TTL));
        auth.invalidate();
        request(&mut auth);
        auth.invalidate(); // login happened while an older check was running
        settle(&mut auth);
        assert_eq!(auth.status, Status::Unknown);
        request(&mut auth);
        settle(&mut auth);
        assert_eq!(auth.status, Status::SignedIn);
        assert_eq!(count.load(Ordering::SeqCst), 3);
    }

    #[cfg(unix)]
    #[test]
    fn subprocess_uses_exit_status_handles_stderr_and_times_out() {
        let command = |script: &str| {
            let mut command = Command::new("/bin/sh");
            command.args(["-c", script]);
            command
        };
        assert_eq!(
            check(command("exit 0"), Duration::from_secs(1)),
            Status::SignedIn
        );
        assert_eq!(
            check(
                command("echo 'Not logged in' >&2; exit 1"),
                Duration::from_secs(1)
            ),
            Status::SignedOut
        );
        assert_eq!(
            check(
                command("echo 'bad config' >&2; exit 1"),
                Duration::from_secs(1)
            ),
            Status::Failed
        );
        assert_eq!(
            check(command("exec sleep 10"), Duration::from_millis(80)),
            Status::TimedOut
        );
    }
}
