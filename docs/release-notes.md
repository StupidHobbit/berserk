Berserk card encyclopedia, collection manager and deck builder. All downloads include the interface and card images for offline use. AI deck creation requires your own installed and signed-in Codex CLI.

| Download | Platform | Launch |
| --- | --- | --- |
| `macos-arm64.zip` | macOS 13+, Apple Silicon | Extract and open Berserk.app |
| `macos-x86_64.zip` | macOS 13+, Intel | Extract and open Berserk.app |
| `ubuntu-x86_64.deb` | Ubuntu 22.04+, x64 desktop | Install with `sudo apt install ./Berserk-*.deb`, then open Berserk |
| `ubuntu-x86_64.tar.gz` | Ubuntu 22.04+, x64 desktop, portable | Install `libwebkit2gtk-4.1-0`, extract, and run `./berserk` |
| `windows-x86_64.zip` | Windows 10/11, x64 | Extract all files and open `berserk.exe` |

Every platform opens a standalone desktop window with its own persistent collection storage, native save dialogs and automatic local-service startup/shutdown. No browser or terminal is required for normal use. Run only one copy at a time. Windows uses Microsoft Edge WebView2 Runtime, included with Windows 11 and most Windows 10 installations; if missing, install it from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/). The Ubuntu `.deb` installs its WebKitGTK dependencies automatically through apt.

The macOS app is ad-hoc signed, not Apple-notarized. If macOS blocks the downloaded app, use System Settings → Privacy & Security → Open Anyway after verifying the download. Windows binaries are unsigned and may show a SmartScreen warning.

Use My data to back up or transfer your collection and decks. No personal collection or Codex credentials are included in these downloads. Checksums are in `SHA256SUMS`; source for each release is available from its tag.
