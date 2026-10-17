# Berserk · Rust + Leptos

A desktop and browser rewrite of [SkAZi/berserk-nxt](https://github.com/SkAZi/berserk-nxt).
The interface and application logic are Rust, compiled to WebAssembly with
Leptos 0.8 and Trunk. The macOS app bundles the interface and local service, and uses your installed Codex.
The encyclopedia and collection work offline; AI deck creation uses your Codex account and an internet connection.

## Download and run

Download the latest build from **[GitHub Releases](https://github.com/StupidHobbit/berserk/releases/latest)**.
Extract the entire archive before launching. All builds include the interface and
card images; Rust, Python and Node are not needed to browse your collection.

| System | Download suffix | Launch |
| --- | --- | --- |
| macOS 13+, Apple Silicon | `macos-arm64.zip` | Open `Berserk.app` |
| macOS 13+, Intel | `macos-x86_64.zip` | Open `Berserk.app` |
| Ubuntu 22.04+, x64 desktop | `ubuntu-x86_64.deb` or `.tar.gz` | Install the `.deb`, or run `./berserk` |
| Windows 10/11, x64 | `windows-x86_64.zip` | Open `berserk.exe` |

All platforms open a standalone desktop window and manage their local service
and persistent app storage automatically. No browser or terminal window is needed.
On Ubuntu, install the `.deb` with `sudo apt install ./Berserk-*-ubuntu-x86_64.deb`
and launch **Berserk** from Applications. For the portable archive, install
`libwebkit2gtk-4.1-0` and run `./berserk`. Windows uses Microsoft Edge WebView2
Runtime, included with Windows 11 and most Windows 10 installations; install it
from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/) if missing.

AI features require your own Codex CLI installation. **Войти в Codex** opens the
sign-in page; browsing cards and editing collections work offline without Codex.
`BERSERK_CODEX_BIN` selects a custom executable; on Windows use native `codex.exe`.

The macOS app is ad-hoc signed and not Apple-notarized. If macOS blocks it, verify
the download and use **System Settings → Privacy & Security → Open Anyway**.
Windows builds are unsigned and may show a SmartScreen warning. Release checksums
are published in `SHA256SUMS`. See [release builds](docs/releases.md).

## Using the macOS app

Double-click **Berserk.app** from the download. You can move the app to
Applications. Codex is assumed to be installed already. Berserk finds it automatically;
no terminal, browser server or MCP configuration is needed for normal use.

1. Add cards, or transfer an existing collection: export a JSON backup from
   **Мои данные** in the old browser app, then import it through **Перенести данные**
   or **Мои данные** in Berserk. `.brsc` collection imports also work.
2. Open **Мои колоды → Создать колоду с Codex AI**.
3. If needed, click **Войти в Codex** and finish signing in in your browser.
   An existing Codex login is reused. Return to Berserk and click **Создать колоду**.

Cards, decks and notes are saved in the desktop app's own persistent storage.
The old browser storage stays intact. Backups use the native macOS save/open dialogs.
The local service starts and stops with the app, and connects automatically.
See [desktop packaging and checks](docs/desktop.md) for development details.

## Run in a browser (development)

Tested with Rust 1.95.0 and Trunk 0.21.14.

```sh
rustup target add wasm32-unknown-unknown
cargo install trunk --locked --version 0.21.14
make dev
```

Open **http://127.0.0.1:8080**. Trunk rebuilds and reloads when source files change.
The Makefile sets `NO_COLOR=true` because Trunk expects a boolean rather than `1`.

```sh
make test       # domain, format, catalog and artwork checks
make check      # formatting and Clippy, warnings denied
make build      # production static files in dist-release/
```

Serve the entire `dist-release/` directory with any static HTTP server. Do not open
`index.html` as a `file://` URL: browsers need HTTP to load WebAssembly. Hash
navigation requires no server-side route fallback. For a subdirectory deployment,
use `trunk build --release --dist dist-release --public-url /your-path/` and retain that path's files.
Trunk may download its matching wasm-bindgen CLI on the first build.

## Included

- **Encyclopedia:** all 1,750 base cards, 2,630 records including variants, ten
  sets, bundled card images, Russian text, card details and artist credits.
- **Search and filters:** names, text, abilities and classes; sets, elements,
  rarity, cost range, health, type, class, elite status, ownership, favorites,
  alternate editions and rotated sets. Cyrillic case and е/ё normalization,
  multiple search terms, sorting, grid/list display and pagination.
- **Collection:** per-card quantities, favorites, browser persistence, original
  `.brsc` collection import/export, merge or replacement, and CSV export. Original
  printing counts and purchase costs are preserved in imports, exports and backup,
  and displayed in card details. Imports preview total and foil quantities.
- **Editions:** all editions are visible by default, including 580 foil records.
  A shared WebGL shader renders Balatro-inspired rainbow reflections and glitter;
  pointer-driven tilt and the finish respect reduced-motion preferences. A CSS
  fallback keeps the effect available without WebGL. See [foil rendering](docs/foil.md).
  Explicit ordinary/foil/alternative/full-art filters, finish labels and animated foil
  sheen; card details let you switch editions and edit their quantities separately.
- **Bespoke card animations:** 99 art-specific shaders cover the requested
  collection cards and every rare and ultra-rare from «Сердце роя». Flames, frost, spell
  paths, wings, weapons, and other effects follow each card's illustration and
  rules. Ordinary and foil editions share the animation; `is_foil` adds a distinct
  metallic finish. All effects use time, preserve printed text, and respect reduced
  motion. Programs compile lazily in one shared context. See the
  [card-by-card effect list](docs/unique-effects.md).
- **Codex deck creation:** collection-only generation from My decks using the local
  Codex CLI, with progress, cancellation, strategy preferences and validated saving.
  Open **Обсудить колоду с Codex** in the deck editor to send feedback and continue
  the same conversation. The agent checks five sample hands and recruitment budgets
  before saving; deck notes contain player-facing advice and clickable card links.
  Run `make ai` and pair the browser; see [setup and workflow](docs/mcp.md).
- **Deck builder:** allowed sets enforced for main deck, sideboard and AI research; descriptions, how-to-play guides and optional upgrades using
  cards outside the collection, creation, renaming, duplication, deletion, main deck and
  sideboard, quantity controls, moving between sections, undo, cost/element
  statistics, a printable list, text/ID/compact-code import/export and Tabletop
  Simulator JSON import/export.
- **Rich deck notes:** Markdown headings, lists and emphasis, plus `[card:ID]`
  references that display database card names and open the existing card popup.
  See [deck text syntax](docs/deck-text.md).
- **Hand/squad simulator:** shuffle and draw up to 15 cards, select individual
  copies for a squad, mulligans, first/second player budgets, element penalties,
  elite and non-elite costs, uniqueness/horde limits, flying and terrain limits,
  and edition-specific bans from the bundled data.
- **Data portability:** JSON backup/restore of collection, favorites and decks.
  Invalid imports report errors before changing stored data.
- Responsive desktop/mobile interface with collapsible mobile filters and
  keyboard-accessible controls; Escape closes dialogs.

## Data and compatibility

Data and artwork are bundled from upstream commit
`bf754902127c84baf1a403b0b0bc02e1b1bf417d`; the revision also lives in
`data/UPSTREAM_REVISION`. Images are local and lazy-loaded. There are no runtime
calls to the upstream site while browsing cards. Tabletop Simulator exports retain
upstream atlas URLs, which TTS itself fetches when loading the deck.

State lives under **`berserk-leptos-v1`** in localStorage, scoped to the site's
origin. It does not migrate automatically from the Electron app or another host.
Export original collection/deck files and import them using the corresponding
screen. Use **Мои данные** for a full backup. Download a backup before clearing
browser data or switching hosts. A storage/validation failure shows an error and
prevents overwriting the existing saved data.

Named and compact deck formats use base-card identities, as in the original app;
use ID-based `.brsd` or full JSON backup to retain exact alternate printings. Named
imports choose the latest matching printing when a name occurs in multiple sets.
TTS uses base artwork atlases; this rewrite additionally writes card IDs in GMNotes
so its own TTS imports retain variant identity.

Collection edition counts and costs are retained, but this first browser version
edits each edition’s total quantity rather than providing the original detailed price and
printing editor. This is a functional browser rewrite, **not complete parity with
all desktop integrations**. Native auto-updates, filesystem watching, ONNX draft
inference, QR/JPEG deck screenshots, signed tournament pools, custom bot models,
full tabletop positioning/counters, and the original preferences/tour system are
not ported. There is no service worker or offline-installable PWA yet. Multiplayer
is not included. Desktop downloads are available as described above.

Draft and sealed are currently removed. Older saves and backups still load;
legacy draft data is retained in backups without exposing a draft interface.
Decks previously created from draft or sealed pools remain ordinary saved decks.

## Layout

```text
src/model.rs       Card catalog, filters, collection, decks, statistics, squad rules
src/formats.rs     Original text/compact/collection/CSV and TTS formats
src/shuffle.rs     Seeded shuffle for the hand simulator
src/app.rs         Leptos shell, catalog, filters, card details, storage and transfers
src/decks.rs       Deck library, builder, print layout and hand simulator
src/foil.rs        Shared WebGL renderer and Leptos canvas lifecycle
src/card_effects.rs Stable identity registry of bespoke card effects
src/shaders/       Foil vertex and fragment shaders (GLSL ES 1.00)
style.css          Responsive theme and print stylesheet
data/              Original card data, constants and card rankings
public/cards/      Original card images (approximately 160 MB)
tests/core.rs      Catalog integrity, format compatibility and game-logic tests
```

Refresh assets from a locally reviewed upstream checkout:

```sh
python3 scripts/sync_upstream.py /path/to/berserk-nxt
cargo test --locked
```

The importer validates card artwork before writing and records the new source
revision. Locally gathered sets in `data/sets/` are validated and reapplied after
upstream synchronization, so the older upstream snapshot cannot erase set 80.
Install the Python dependencies below before running either data tool.

## Gathering new sets

Set 80, **Сердце роя**, was collected using the tools in this repository:
220 base cards with rules, stats, artists and local JPEG scans, plus 134 editions
from the collection checklist. Sources and hashes for each page and image live
in `data/sets/80/manifest.json`; compressed HTML snapshots support offline review.
The 61 editions without their own scans explicitly display a base-artwork notice.
Ordinary foil editions share the base illustration. Noir editions count as foils.
Card names Алирра and Менгир Каррефура were checked against the printed scans
to resolve discrepancies in the checklist. No ratings or TTS atlas URLs were
invented; TTS export for this set reports the missing atlas and offers `.brsd`.

```sh
python3 -m pip install -r scripts/requirements.txt
python3 scripts/gather_set.py scripts/sets/80.json --output gathered/80
python3 scripts/import_set.py gathered/80          # validate and preview
python3 scripts/import_set.py gathered/80 --apply  # install
make test
make build
```

The collector uses Python 3.10+, Beautiful Soup and curl. It limits concurrency
to three workers by default (maximum four), uses timeouts/retries, caches every
response with SHA-256 and retrieval timestamps, and fails on incomplete sets,
unrecognized editions, source-schema changes or invalid images. It writes only
to the cache and output bundle; the separate importer validates all hashes before
updating the app. Other sets and browser user data are preserved.

Use `--offline` to rebuild from the cache without network access; use a different
`--cache` directory to take a fresh source snapshot. `import_set.py
data/sets/80 --installed` verifies already installed data. Source configuration
is in `scripts/sets/80.json`; reuse the collector with another reviewed config
for sets published with the same source schemas.

Sources: [card database](https://pro.berserk-nxt.ru/edition/ab008),
[edition checklist](https://www.laststicker.ru/cards/berserk_serdce_roya/), and
[publisher set reference](https://berserk.ru/?route=card%2Fset&set_id=94150).
The publisher page could not be fetched by the collector; card data and edition
records come from the two public databases above.

## License and credits

The original LGPL-3.0 license is retained in `LICENSE`; see `NOTICE` for source and
asset attribution. Card text, illustrations and Berserk branding retain their
original rights. Individual artist credits appear in card details.

## Agent deck building (MCP)

`make mcp-build` builds a native stdio MCP server. Agents can search cards, inspect
owned editions, validate proposals and save decks directly into a paired browser
tab with undo and revision conflict checks. See [setup and tool documentation](docs/mcp.md)
and the ready-to-edit [client configuration](mcp.example.json). No client settings
are modified automatically.
