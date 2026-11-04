//! Standalone MCP entry point; also embedded in the native application.
#[path = "support/service.rs"]
mod service;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    service::run()
}
