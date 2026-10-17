# Berserk for macOS

The generated `desktop/build/Berserk.app` is the complete application. Double-click
it, or move it to Applications. Opening the AI panel and signing in is all the
runtime setup required when Codex is already installed. The Codex sign-in opens the system browser; the collection
and deck editor remain in the app. Existing Codex authentication is reused.

## Build

Build requirements: macOS 13+, Xcode command-line tools (Swift), Rust with the
`wasm32-unknown-unknown` target, and Trunk. Codex is not needed to build the app.

```sh
make desktop
```

The builder compiles the release Wasm interface and Rust service, compiles an
AppKit/WebKit window, packages the UI and service, then ad-hoc signs the app.
Codex binaries, helpers and resources are never copied into the bundle. `--skip-build` reuses the previously
built web assets and Rust binary; it still recompiles the native wrapper.
Packaging targets the build machine's architecture. It does not copy Codex auth
or the user's collection into the bundle. Update Codex through its existing installation.
Builds are ad-hoc signed and are not Apple-notarized. Public downloads and CI are
documented in [release builds](releases.md).

## Installed Codex

Sign-in and deck creation use the same executable resolver. It respects
`BERSERK_CODEX_BIN`, then searches the inherited PATH and common installation
locations (`~/.local/bin`, Homebrew, `~/.cargo/bin`, `~/.npm-global/bin`, and
`~/.volta/bin`). These locations are also added to the child PATH so npm wrappers
can find Node when the app is opened from Finder. An explicit override takes
precedence; an invalid override is not silently replaced with a different install.
For custom locations, set `BERSERK_CODEX_BIN` to the installed executable before
launching the app. No login shell startup scripts are executed during discovery.

## Storage and transfer

The wrapper uses WebKit's persistent default website data store and bundle ID
`ru.berserk.collection`. The origin is always `http://127.0.0.1:47381` so storage
survives launches and moving the app. A busy port causes a visible startup error;
the app never silently switches to another empty storage origin. Quit another
running copy and retry. Export backups regularly with **Мои данные**.

Browser storage cannot be shared directly with WebKit. Export a JSON backup from
**Мои данные** in the old browser app, then import it in the desktop app. This
transfers collection, decks, favorites, descriptions, play guides and improvements.
The first empty desktop collection includes a transfer shortcut. `.brsc` imports
remain available when only collection transfer is needed.

## Runtime

- The Swift wrapper launches bundled `berserk-service --app`, which serves static
  assets and the authenticated bridge from one loopback listener.
- A fresh bridge secret travels through the child stdout pipe into a main-frame
  WebKit user script. Static HTTP responses never expose it. Host, WebSocket
  origin and token checks reject unrelated browser access to collection actions.
- The UI automatically pairs on launch/reload; manual browser pairing still works
  in the browser version. Desktop-native sign-in, save and print actions check the
  originating main frame. External links open in the system browser.
- Codex runs from the existing installation with the same read-only sandbox, structured output
  and collection validation as the browser-driven service. The actual deck uses
  owned cards; the improvements notes may suggest cards outside the collection.
- Each generation automatically connects Codex to the service's `--catalog-only`
  stdio MCP mode. It can search all bundled cards and verify exact rules/IDs using
  `catalog_info`, `search_cards` and `get_card`; no temporary upgrade file or
  manual MCP setup is needed. This mode cannot modify collections or decks.
- Closing the app stops the service. Parent-pipe EOF also stops it after a parent
  crash; SIGTERM is handled gracefully so active Codex children are dropped/killed.
- Existing stdio MCP remains available via `berserk-mcp`; it is optional for the
  browser/developer workflow, not a requirement for desktop deck creation.

## Verification

```sh
swiftc desktop/CodexInstallation.swift tests/codex_installation.swift -o /tmp/berserk-codex-discovery-test
/tmp/berserk-codex-discovery-test
cargo build --locked --features mcp --bin berserk-mcp
python3 scripts/test_desktop.py
python3 scripts/test_catalog_mcp.py
python3 scripts/test_codex.py
desktop/build/Berserk.app/Contents/MacOS/Berserk --smoke-test
```

The executable-discovery test checks Finder's minimal PATH, explicit overrides,
wrapper runtime lookup and installed symlinks without launching Codex or a GUI.
The desktop protocol test uses temporary assets and checks static MIME types,
pairing, Host/origin/token rejection, stable-port restart, port conflicts, parent
EOF and SIGTERM shutdown. The native smoke test opens the actual bundled Wasm
UI in an isolated, nonpersistent WebKit store on a random port, verifies startup,
storage and automatic pairing, then exits. It does not read or modify the user's
desktop collection or run a model request. GUI tests require a macOS desktop session.
