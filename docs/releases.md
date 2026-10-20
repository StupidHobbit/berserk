# Release builds

GitHub Actions tests and builds each push to `main`, pull request, and `v*` tag.
The workflow can also be run manually to produce downloadable Actions artifacts.

The independent browser job builds the optional Wasm client. Native jobs build,
test and package Rust executables and offline card images for macOS ARM64,
macOS Intel, Ubuntu 22.04 x64 and Windows x64. No web assets or webview runtimes
are included in desktop packages. Linux uses Wayland/X11 and desktop-portal file
dialogs. All platforms require OpenGL 3.3 or OpenGL ES 3.0.

Native jobs run domain and storage tests, Clippy, package/service checks and a
real-window smoke test in an isolated profile. The smoke test compiles all card
shaders on the available driver and captures the window. Linux CI uses Xvfb and
Mesa software rendering; it does not establish performance on physical hardware.
SHA-256 checksums are generated for archives. Publishing requires all checks and
platform builds to succeed.

## Publishing another version

1. Update the package version in `Cargo.toml`, regenerate `Cargo.lock` with
   `cargo check --features mcp`, and update `docs/release-notes.md`.
2. Commit and push to `main`, and wait for CI to pass.
3. Tag that commit with the exact package version and push the tag:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

The tag must equal `v` followed by the Cargo package version. Tags are immutable
release identifiers: fix a published version by issuing a new version and tag.
Failed runs can be rerun before a release is published.

If all builds passed but the publishing step failed, run **Publish tested release**
from Actions on `main`, supplying the version tag and the original run ID. This
verifies that the tag points to the tested commit and all six build/check jobs
passed, downloads those exact artifacts, checks their hashes, and publishes them
without rebuilding or moving the tag.

## Local packaging

Run on the target operating system, with Python 3.11+, Rust installed.
On Ubuntu, install the OpenGL/EGL, X11, Wayland and xkbcommon development
packages listed in `.github/workflows/check.yml`. Windows uses the MSVC toolchain:

```sh
cargo build --release --locked --no-default-features --features desktop --bin berserk-mcp --bin berserk
python scripts/package_release.py --platform ubuntu --arch x86_64
python scripts/test_release.py release/Berserk-0.2.0-ubuntu-x86_64
python scripts/test_native.py release/Berserk-0.2.0-ubuntu-x86_64/berserk
```

Use `--platform windows --arch x86_64` on Windows, or `--platform macos` and the
build host's `--arch arm64` / `--arch x86_64` on macOS. macOS additionally needs
Xcode command-line tools; test its package at `desktop/build/Berserk.app`.
Archives and checksums are written to the ignored `release/` directory.

macOS archives are ad-hoc signed, without Developer ID signing or notarization.
Windows executables are unsigned. Public users may need to approve the download
in their operating system. Code signing would require the owner's certificates.

The bundle does not include Codex, credentials, saved collections or build caches.
AI features use the user's existing Codex installation and login. Native state
is stored independently of the random local AI-service port. See
[storage and migration](desktop.md#state-and-migration) for profile locations and
transferring existing webview data. Smoke tests never read the user's collection.
