//! Portable launcher: resolve resources beside the executable, not the working directory.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let executable = std::env::current_exe()?;
    let directory = executable.parent().ok_or("Missing application directory")?;
    let service = directory.join(if cfg!(windows) {
        "berserk-mcp.exe"
    } else {
        "berserk-mcp"
    });
    let status = std::process::Command::new(service)
        .arg("--browser")
        .args(std::env::args_os().skip(1))
        .env("BERSERK_WEB_ROOT", directory.join("web"))
        .status()?;
    std::process::exit(status.code().unwrap_or(1));
}
