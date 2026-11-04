//! GPU-rendered native desktop application for Linux, macOS and Windows.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
#[path = "support/service.rs"]
mod service;

fn main() {
    let args: Vec<_> = std::env::args_os().collect();
    // Relaunch the same executable for the bridge and catalog: `cargo run
    // --bin berserk` must never depend on a separately built helper binary.
    if args
        .iter()
        .any(|arg| arg == "--native-app" || arg == "--catalog-only" || arg == "--mcp")
    {
        if let Err(error) = service::run() {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
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
