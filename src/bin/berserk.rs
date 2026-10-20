//! GPU-rendered native desktop application for Linux, macOS and Windows.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
fn main() {
    let args: Vec<_> = std::env::args_os().collect();
    let smoke = args.iter().any(|a| a == "--smoke-test");
    let report = args
        .iter()
        .position(|a| a == "--smoke-result")
        .and_then(|i| args.get(i + 1))
        .map(std::path::PathBuf::from);
    if let Err(error) = berserk_leptos::native::run(smoke, report.clone()) {
        if smoke {
            if let Some(path) = report {
                let _ = std::fs::write(path, format!("FAIL: {error}"));
            }
        } else {
            rfd::MessageDialog::new()
                .set_title("Berserk")
                .set_description(error.to_string())
                .show();
        }
        eprintln!("{error}");
        std::process::exit(1);
    }
}
