# Release builds

GitHub Actions tests and builds each push to `main`, pull request, and `v*` tag.
The workflow can also be run manually to produce downloadable Actions artifacts.

The web interface is built once with Rust 1.95.0 and Trunk 0.21.14. Native jobs
then test and package the service on macOS ARM64, macOS Intel, Ubuntu 22.04 x64,
and Windows x64. Every package contains the offline web interface and card images.
macOS uses the AppKit/WebKit wrapper; Ubuntu and Windows use a Rust window with
Wry/Tao and the operating system webview (WebKitGTK / WebView2). The interface
runs inside the app, with native save dialogs and a dedicated persistent profile.
The app owns the bundled service and stops it on exit. Ubuntu also gets a `.deb`
with an Applications-menu entry and automatic WebKitGTK dependency installation.

Each package is smoke-tested for startup, web/Wasm assets, Host validation and
service lifetime. Ubuntu (under Xvfb) and Windows additionally launch the actual
native window, load the bundled Wasm, exercise localStorage, verify automatic
pairing, and exit through an isolated GUI smoke test. SHA-256 checksums are generated for all archives. The publish
job runs only for a version tag and only after every check and platform succeeds.
It creates one GitHub Release with all platform downloads and `SHA256SUMS` using the
workflow's repository-scoped token; no personal release token is needed.

## Publishing another version

1. Update the package version in `Cargo.toml`, regenerate `Cargo.lock` with
   `cargo check --features mcp`, and update `docs/release-notes.md`.
2. Commit and push to `main`, and wait for CI to pass.
3. Tag that commit with the exact package version and push the tag:

   ```sh
   git tag v0.1.1
   git push origin v0.1.1
   ```

The tag must equal `v` followed by the Cargo package version. Tags are immutable
release identifiers: fix a published version by issuing a new version and tag.
Failed runs can be rerun before a release is published.

## Local packaging

Run on the target operating system, with Python 3.11+, Rust and Trunk installed.
On Ubuntu, first install `libwebkit2gtk-4.1-dev` and `libgtk-3-dev`.
Windows development uses the MSVC Rust toolchain and WebView2 Runtime:

```sh
trunk build --release --locked --dist dist-release
cargo build --release --locked --features desktop --bin berserk-mcp --bin berserk
python scripts/package_release.py --platform ubuntu --arch x86_64
python scripts/test_release.py release/Berserk-0.1.0-ubuntu-x86_64
python scripts/test_native.py release/Berserk-0.1.0-ubuntu-x86_64/berserk
```

Use `--platform windows --arch x86_64` on Windows, or `--platform macos` and the
build host's `--arch arm64` / `--arch x86_64` on macOS. macOS additionally needs
Xcode command-line tools; test its package at `desktop/build/Berserk.app`.
Archives and checksums are written to the ignored `release/` directory.

macOS archives are ad-hoc signed, without Developer ID signing or notarization.
Windows executables are unsigned. Public users may need to approve the download
in their operating system. Code signing would require the owner's certificates.

The bundle does not include Codex, credentials, saved collections or build caches.
AI features use the user's existing Codex installation and login. Keep the fixed
local port (47381) and app profile across upgrades to retain local storage.
Ubuntu stores its webview profile under `$XDG_DATA_HOME/berserk/webview` (default
`~/.local/share/berserk/webview`); Windows uses `%LOCALAPPDATA%\berserk\webview`.
Use My data to back up and transfer collections from an existing browser.
GUI smoke tests use a fresh temporary profile and a random port, never your collection.
