# Native desktop application

The desktop client is Rust + egui/eframe on Linux, macOS and Windows. It renders
into one OpenGL window. No WebKit, WebView2, JavaScript, Wasm or HTTP server is
needed to browse and edit cards. The optional browser client remains available.

## Build and run

```sh
make native
cargo run --release --locked --bin berserk
```

Build both `berserk` and `berserk-mcp` for AI support. `make desktop` creates the
macOS application bundle. On the first local migration it also retains the old
webview bundle as `desktop/build/Berserk-Webview.app` for backup export. See [release builds](releases.md) for Linux/Windows
packaging. An OpenGL 3.3 or OpenGL ES 3.0 driver is required. Linux supports both
Wayland and X11; file dialogs use the desktop portal instead of GTK/WebKit.

## Physical interface

Visual reference: [Hearthstone’s Collection Manager](https://hearthstone.blizzard.com/en-us/news/21790299). The native materials are original; no Blizzard assets are bundled.

The native collection uses a walnut frame, stitched leather filters, recessed
parchment pages and bronze controls. These are original procedural materials in
`src/native/shaders/material.frag`, drawn by one shared GL program. No downloaded
textures, offscreen passes or GPU readbacks are required.

The parchment background is a slowly drifting, faded fantasy map: etched coasts and
sea contours, mountain chains, forest stands, marsh reeds, a river, ruined keeps,
and a crystal-shaped compass. The northern shadow and sparse glass-like scars
refer to Laar's Cataclysm, described in the [official rulebook](https://hobbygames.ru/download/rules/0018Berserk_lords_rulebook-WEB.pdf).
The coastline and placement of symbols are an original decorative interpretation,
not a canonical geographical atlas. The supplied `map_shader.frag` informed its
cartographic style; its moving camera and expensive terrain/settlement sampling
are not used.

The map uses three noise octaves, analytic glyphs and derivative antialiasing in
the existing shared material pass. Terrain remains fixed and aspect-correct;
a CPU-computed offset moves the chart along a two-minute orbit at no more than
1.26 logical points per second. The parchment grain and UI remain still.
Desaturated washes and capped ink opacity fade further beneath the top controls.
Map-only motion uses the existing repaint scheduler at 15 fps; visible card
effects retain their 30 fps cap. There are no additional textures or render passes.
Map motion pauses while unfocused/minimized and for either the system or app's
reduced-motion preference, resuming from the same position without a jump.

Cards have no surrounding frames or backing plates. A shared perspective vertex
shader and surface-lighting shader render ordinary, foil and bespoke editions
with the same 3D pose. Soft contact/cast shadows and a thin cut-cardstock edge
follow the projected silhouette. Hover lifts and tilts the card; pressing lowers
it. Motion eases to rest at up to 30 updates/second, without an idle timer.
Reduced-motion settings retain a static physical surface and freeze animation.
Disabling special card effects still retains the ordinary physical surface.

PT Serif Bold provides Cyrillic book headings and is embedded in the executable;
its SIL Open Font License travels with every package. The sans-serif body font
keeps small controls and card rules readable. Existing card scans remain intact.

Search is above the catalog; **Ctrl+F / ⌘F** focuses it. **Фильтры** hides or
shows the filter rail, and advanced attributes/editions expand independently.
Card size adapts to available height, navigation condenses on small windows, and
count controls have at least 32-point targets. Favorites, owned-copy counts and
adding to a deck remain separate actions. Saved decks show artwork previews in
case-style tiles, with copy/delete under **Ещё**. All import formats and editing
operations retain their previous data semantics.

## Performance architecture

- Search results are cached until filters, selected deck or stored data change.
- Fixed-height virtual rows construct only the cards intersecting the viewport.
  Grid/list view and 60-card pages remain available.
- Two workers decode local JPEG, PNG and WebP artwork. Texture sizes follow the
  card's physical screen size and display scale, in buckets up to 2048 pixels
  with headroom for perspective tilt. Lanczos downsampling preserves detail;
  smaller source scans retain their original pixels. Request/result queues are
  bounded (24/8); at most two textures upload per UI pass.
- A 64 MiB LRU bounds resident card textures, including filtered mipmaps for
  smooth minification. Shared artwork is keyed by path and size, so foil/base
  cards reuse the same texture. Cached art stays visible during resolution
  upgrades; smaller views can reuse larger textures. Eviction drops GPU handles.
- All 99 bespoke effects and the foil shader share the window GL context. They
  sample the existing textures and draw directly into the window at display
  resolution. There is no per-card framebuffer readback or CPU canvas copying.
- Effects compile on first use, at most one new program per paint pass. A failing
  shader falls back to the original card image and is reported under Settings. Cards remain usable.
- Visible animation requests at most 30 redraws/second. Hidden/minimized windows
  stop requesting animation. Map-only drift requests 15 fps while focused;
  reduced motion also freezes the map so the event loop can sleep when idle.
  Settings can disable effects or freeze motion, including pointer tilt. System
  reduced-motion settings are read off-thread at launch and on refocus (macOS,
  Windows, GNOME and KDE).
- Serialization, fsync and atomic replacement run on a storage worker. The UI
  displays a pending save and commits the edit only after a durable acknowledgement.
- Native release builds optimize for throughput (`opt-level=3`, LTO). The optional
  `web-release` Cargo profile retains size optimization for browser builds.

Settings shows UI construction time, most recent search time, texture memory and
shader errors. UI time excludes GPU execution and display latency. A smaller UI
cost is not proof of an end-to-end frame-rate improvement on another computer.

## State and migration

The exact `UserData` version-1 JSON format is retained, including favorites,
printing quantities, prices, edition IDs, deck notes, allowed sets, Codex session
IDs and opaque legacy draft state. Existing `.brsc`, `.brsd`, named/compact deck
formats, CSV and TTS conversions use the same domain functions as the web client.

Collection import uses a compact file-only dialog. It shows total copies, copies
by rarity, and the number of distinct sets with positive card counts. Statistics
are computed once when a file loads. Add/replace controls and the import action
remain visible; raw text editing, card previews and export controls are omitted
from this dialog.

Deck import accepts multiple files at once, with no extension restrictions. Each
file creates one deck named after its filename without the final extension,
including when a deck name is embedded in the file. Text/ID decklists, compact
codes and TTS JSON retain their existing parsers, notes, reserve and allowed sets.
The preview shows copy counts for all six elements, separately for the main deck
and reserve. File reads, parsing and statistics run on a worker; raw source text
is discarded and only visible summary rows are drawn. Files can be added or
removed; reselecting the same path refreshes it. Invalid files show individual
errors and block import until removed or corrected. The entire selection is
saved atomically as one undoable addition, without replacing existing decks.
Deck exports remain available from the deck's **Экспорт** menu; compact codes
are copied directly to the clipboard.

Native data lives in `berserk-leptos-v1.json` under:

- Linux: `$XDG_DATA_HOME/berserk` or `~/.local/share/berserk`.
- macOS: `~/Library/Application Support/berserk`.
- Windows: `%LOCALAPPDATA%\berserk`.

`BERSERK_DATA_DIR` selects a separate profile. A process-lifetime OS file lock
prevents two application instances from writing the same profile. Files are
replaced atomically; Unix directory metadata is synced too. A corrupt or
unsupported save blocks editing and is never overwritten with an empty collection.
An explicit valid backup restore retains the unreadable original in a separate file.
Thirty committed changes can be undone. Closing waits for an in-flight save.

**Мои данные** contains two actions: **Сохранить резервную копию** and
**Восстановить из файла…**. The picker has no extension restrictions. Contents are
validated to distinguish full JSON backups from `.brsc` collection exports,
including files saved with a different extension. Collections open the import
statistics and add/replace controls without changing saved data. Full backups
show a native confirmation dialog before replacing data, then use the same
atomic storage and undo history as other edits.

**Before moving from the webview version**, export a JSON backup through **Мои
данные** in that version, then import it through **Перенос данных** in the
native client. The previous browser/webview storage is left intact. Native
storage does not depend on a browser origin or a fixed local service port.

The interface is native and its layout differs from the browser UI. Printing
opens a generated, escaped HTML deck list in the system browser, where Print/PDF
is available. Browsing and deck editing do not open a browser.

## Codex and MCP

Opening the AI panel starts bundled `berserk-mcp --native-app` in a background
worker. The service binds a random loopback port and sends its secret only
through the parent's stdout pipe. Token, Origin and Host checks are retained.
The desktop client implements the existing snapshot/progress/save protocol;
revision conflicts and exact-edition collection validation are unchanged.
It acknowledges an AI save only after the atomic file write succeeds.

**Мои колоды → Создать с Codex** opens a dedicated creation screen with a
login/status panel, collection count, deck size, strategy text and allowed sets.
The primary create action stays outside the scrolling form. Generation progress
and cancellation remain visible, and discussion of existing decks uses the same
status panel and cached login result.

Login status uses the documented [`codex login status`](https://developers.openai.com/codex/cli/reference#codex-login)
command on a background worker, with an eight-second timeout and one in-flight
check. Signed-in/out results are cached in memory for five minutes across page
changes; failed/missing-CLI checks back off for 30 seconds. The visible page
refreshes expired results, **Проверить вход** bypasses the cache, and finishing
or cancelling browser sign-in invalidates it. Older in-flight results cannot
overwrite status after invalidation. Only a sanitized status enum is retained;
CLI output and credentials are never shown or cached. A successful status check
means credentials are present, not a check of model access or account limits.
External MCP services are not blocked by the local CLI login state.

Sign-in uses the installed Codex CLI. `BERSERK_CODEX_BIN` overrides it. Discovery
extends PATH with common user bin directories and Homebrew on macOS. Codex itself
is not bundled. Generation, continuation, restart, cancellation and the five-hand
validation instructions use the existing service implementation and sandbox.
Closing the client drops the connection and the parent pipe, stopping the service
and its generation child. Offline browsing never starts this service.

External MCP remains available: start the stdio server as before, then paste its
`connection_info.connect_url` under **Настройки → Подключить внешний MCP**.
This switches to that service, exposing the same collection/deck tools.

## Verification

```sh
make native-test
python3 scripts/test_mcp.py
python3 scripts/test_catalog_mcp.py
python3 scripts/test_codex.py
python3 scripts/test_desktop.py  # retained web bridge contract
python3 scripts/test_native.py target/release/berserk
cargo test --release native::tests::native_views_virtualize_and_cache_search -- --nocapture
```

The native smoke test uses a temporary profile, compiles every original card
shader and the native material shader on the real GL driver, waits for visible bundled artwork, verifies private AI-service
pairing, captures the window next to
its result report, and exits. Set `BERSERK_SMOKE_VIEW` to `compact`, `list`,
`detail`, `decks`, `deck`, `compact-deck`, `deck-import`, `compact-deck-import`,
`compact-list`, `hover`, `hover-plain` or `reduced` to exercise those layouts with isolated test data. It never touches a real collection or invokes a
model. The native unit tests cover durable edits and undo, failed-save rollback,
exclusive profiles, corrupt-save preservation, transfer compatibility and
virtualization/cached filtering. Release CI runs native build/lint/tests and GUI
smoke checks on Linux, macOS and Windows. Physical Linux GPU performance still
needs measurement on the affected machine; software-rendered CI is not a hardware
performance benchmark.

## Local verification record

On the macOS ARM64 development host, the release-mode headless 1280×860 test
measured 0.201 ms per UI frame over 100 passes and 0.531 ms for the initial
2,630-record search, with 8 visible tiles constructed. This test excludes image
decoding, GPU rendering, presentation and OS event latency. It is a regression
baseline for UI work, not a Linux performance claim.

Windows CI installs [MSYS2 Mesa](https://packages.msys2.org/packages/mingw-w64-x86_64-mesa)
only for its GPU-less smoke-test runner, after creating the release archive.
The test driver is not bundled with the application.
