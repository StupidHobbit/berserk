# MCP deck builder

Deck note fields support Markdown and `[card:ID]` references. Use exact IDs from
the catalog; the UI renders their names as links to the existing card popup.
See [deck text syntax](deck-text.md).

For normal desktop use, open **Berserk.app**; it uses your installed Codex and connects
automatically. No MCP setup is required. See [desktop usage](desktop.md).
The instructions below are the optional browser/MCP development workflow.

The native Rust `berserk-mcp` server lets an MCP agent search the bundled catalog,
read the user's collection, build decks and save them directly into the Leptos app.
It uses the [official Rust MCP SDK](https://github.com/modelcontextprotocol/rust-sdk)
over **stdio**. The browser bridge is a separate authenticated WebSocket on an
OS-assigned loopback port; it is not an HTTP MCP endpoint.

## Setup

1. Run `make mcp-build` to produce `target/release/berserk-mcp`.
2. Copy the `berserk` entry from [`mcp.example.json`](../mcp.example.json) into your
   MCP client's server configuration. Adjust the absolute executable path if the
   checkout moves. There are no command arguments or credentials to configure.
3. Run the browser app with `make dev` and open `http://127.0.0.1:8080`.
4. Ask the agent to call `connection_info` and open the returned `connect_url` in
   the browser that holds your collection. The app displays a connection banner.
5. Ask the agent to build a deck. Saved decks appear in **Мои колоды** immediately;
   **Отменить** in the deck editor restores the previous state.

Configuration is supplied as a file in this repository; no MCP client settings
are changed automatically. A server restart requires a new pairing URL. Reloading
or closing the paired tab disconnects it; open a fresh `connection_info` URL to
reconnect. Use **Отключить агента** to end the session at any time.

`localhost` and `127.0.0.1` have separate browser storage. Set
`BERSERK_APP_ORIGIN=http://localhost:8080` only if that is where the desired
collection lives. Other loopback HTTP ports are supported. Public origins and
HTTPS-hosted deployments are not supported by this local bridge.

## Build from the app with local Codex

1. Install the Codex CLI and run `codex login` once.
2. Run `make dev` for the app, then `make ai` in another terminal. The latter
   starts the local bridge without requiring an MCP host. Open its printed pairing
   URL in the browser holding your collection. Alternatively, use `connection_info`
   from an already configured Berserk MCP server.
3. Open **Мои колоды → Создать колоду с Codex AI**, choose allowed sets and 30–50 cards, then enter
   your preferred elements, strategy, key cards or experience level.
4. Click **Создать колоду**. Progress appears in the panel. **Отменить создание**
   stops generation until saving begins. On success the editor opens the new deck.

The service runs `codex exec` with a structured JSON output schema in a private
temporary directory and a read-only sandbox. It uses the existing Codex login;
model requests use that account's limits. It sends the owned card pool, quantities, bundled rules, your preferences and
access to the full card database through MCP, never collection purchase prices.
Each CLI run automatically starts this same executable in `--catalog-only` mode
as `berserk_catalog`. Its read-only `catalog_info`, `search_cards`, `get_card` and `deal_deck`
tools cover all editions in the selected allowed sets, including cards outside the collection.
The process receives `--allowed-sets '[80,70]'` (for example) and scopes the
database before exposing tools: disabled sets disappear from metadata, searches
and exact-ID lookups. With no setting, the full catalog remains available.
The agent searches and verifies upgrade recommendations using MCP; no temporary
catalog file or preselected shortlist is used. This stdio-only mode opens no
listener and exposes no collection/deck mutation tools. Ownership still comes
from the prompt, and the app validates the final deck against the collection.
The MCP configuration is passed only to this child CLI run; your saved Codex
settings are not modified. A required-server setting makes startup fail if the
catalog cannot be connected instead of silently creating unverified advice.
It does not run shell-interpolated commands. User CLI configuration is ignored to
avoid inheriting unrelated MCP servers and hooks. The CLI's default model is used;
set `BERSERK_CODEX_MODEL` to override, and `BERSERK_CODEX_BIN` for a nonstandard CLI
path. A current CLI supporting `--ignore-user-config`, structured output and `exec resume` is required.

The prompt incorporates the user-provided text of
[Основы колодостроения](https://vk.ru/@berserk_tcg-osnovy-kolodostroeniya): start with
an idea and ideal squad, prefer 30 cards for consistency, balance front-line and
support roles (10–14 / 16–20 for 30 cards), elite/ordinary cards (10–13 / 17–20),
plan for going second, use redundant roles and add metagame counters sparingly.
These ratios are guidance, not legality rules. Historical metagame and card
examples are not treated as current facts; generated advice must use bundled rules.

The server validates size, card IDs, name copy limits, bans and owned quantities
before saving. The browser checks ownership again at save time. A disconnected
browser, insufficient collection, failed CLI, invalid proposal or ten-minute
timeout produces an error. Disconnecting aborts an active generation. Once a save
is underway, wait for its outcome and use editor Undo if needed. A timeout may mean
a save succeeded: inspect My decks before retrying. Only one generation can run
per paired server. Creation makes a new deck; feedback updates the selected deck.

Open a deck and expand **Обсудить колоду с Codex** to send feedback. The app
persists the CLI session ID with the deck and uses `codex exec resume <id>` for
follow-ups. It sends the current deck and collection every time, since manual
changes take priority over conversation history. Updates require the original
revision, checked again by the browser when saving, and retain the deck ID,
allowed sets, tags and sideboard. Sideboard copies are reserved from the owned
pool. The main-deck size is preserved within 30–50 cards; drafts outside that
range are brought to the nearest endpoint. Cancellation or failed validation
leaves the saved deck untouched. Successful feedback appears under **Предыдущие
пожелания**; the current draft remains in the form after failure.

Existing decks without a saved session start a new conversation from their current
state. **Начать новое обсуждение этой колоды** starts fresh if the local CLI
history is unavailable. Session metadata survives JSON backups; local Codex
history itself remains on this computer. Copying a deck starts a separate
conversation. Text/TTS exports omit session metadata.

Both prompts require at least five independent 15-card deals of the final list,
plus squad recruitment checks for each hand. The agent must repeat them after
changing the composition. `deal_deck` uses the same shuffle and basic budget/squad
rules as the app simulator; card-specific abilities and discounts require manual
reasoning. These samples diagnose obvious problems, not prove balance or simulate
played matches. Deck prose must contain only player-facing strategy and card
links, never tool names, file paths, commands or execution reports. The local
save path additionally rejects common technical tool/parameter names in prose.

**Скопировать запрос для Codex** remains available as a manual MCP workflow.
The same prompt is exposed through `get_deck_build_prompt`.

## Tools

| Tool | Purpose | Browser required |
| --- | --- | --- |
| `connection_info` | Session pairing URL and connection state | No |
| `create_deck_with_codex` | Start a local CLI generation; returns request ID immediately | Yes |
| `refine_deck_with_codex` | Continue a deck conversation with `deck_id`, `expected_revision`, `feedback`; optional `restart_session` | Yes |
| `deal_deck` | Draw 15 from proposed `cards` or saved `deck_id`; optional `allowed_sets`, `seed`, `squad_indices` | For `deck_id` |
| `get_deck_build_status` | Progress/error and saved deck ID | No |
| `cancel_deck_build` | Cancel by request ID before save begins | Yes |
| `get_deck_build_prompt` | Shared UI prompt; optional `size`, `preferences`, `allowed_sets` | No |
| `catalog_info` | Set/element/rarity IDs and workflow guidance | No |
| `search_cards` | Text, set, color, rarity and cost search; pagination | For `owned_only` or `deck_id` |
| `get_card` | Rules and exact edition details | For `deck_id` |
| `get_collection` | Positive quantities by exact card edition | Yes |
| `list_decks` | Saved deck IDs, names and revisions | Yes |
| `get_deck` | Full deck, revision, validation, shortages and text export | Yes |
| `validate_deck` | Check a proposal without saving | For `check_collection` or `deck_id` |
| `save_deck` | Create or replace a complete deck with conflict checking | Yes |

Search defaults to base cards. When building from owned cards, use both
`owned_only: true` and `include_editions: true` so foil/alternate copies are included.
Search results contain readable rules and string card IDs; never infer IDs from
names. `catalog_info` supplies the set and element IDs (elements are bitmasks).

## Allowed sets

New manual and AI decks show a **Разрешённые наборы** dropdown, using the last
nonempty selection made in any allowed-sets picker. This preference is saved locally
across app restarts, independently of existing decks and undo history. With no saved
preference, every current set is selected. Clearing the selection does not overwrite
the last valid default. Open the dropdown to select multiple sets or use Select all/Clear selection.
The collapsed control shows the selection summary; Escape or clicking outside closes it. At least one set must remain selected. In the deck editor the setting
can be changed; first remove cards from a set (including sideboard) before disabling
it. Editing never silently removes cards. Catalog filters and reset cannot bypass
this restriction; the encyclopedia still displays the full database.

`allowed_sets` is an array of numeric set IDs. Older decks without this field remain
unrestricted. Invalid/empty lists and out-of-set cards are rejected by imports,
backups, browser saves and MCP validation/saves. Missing/null `allowed_sets` on MCP
updates preserves the saved setting; send an explicit list to change it.

For a new MCP proposal, pass `allowed_sets` to `get_deck_build_prompt`,
`create_deck_with_codex`, `search_cards`, `get_card`, `validate_deck` and `save_deck`.
For an existing deck, pass `deck_id` to `search_cards` and `get_card`: the saved
restriction applies automatically, and explicit search filters may only narrow it.
Disabled-set requests return errors and pagination counts only permitted records.
Both agent prompts restrict upgrade recommendations to allowed sets as well.

The setting survives copies, undo, backups, text/ID exports and TTS metadata.
The legacy compact code format carries only card quantities, not deck settings or
notes; use `.brsd` or a backup to transfer the complete deck.

A proposal uses quantities rather than repeated IDs:

```json
{
  "name": "Степи — Сердце роя",
  "allowed_sets": [80],
  "description": "Идея колоды, ядро, синергии и слабые стороны",
  "how_to_play": "Выбор руки, набор отряда, расстановка и первые ходы",
  "improvements": "Приоритетные карты вне коллекции: что добавить, что заменить и почему",
  "cards": [{"id": "80001", "count": 3}],
  "side": [],
  "tags": ["Констрактед"]
}
```

Call `validate_deck` with that object, optionally adding `check_collection: true`.
Then pass it to `save_deck` to save an incomplete draft or a complete deck. A draft
with fewer than 30 cards is allowed to save, but is reported as failing the basic
constructed checks. Invalid/unknown IDs, empty names and oversized payloads are
rejected. The agent limit is 500 cards across main deck and sideboard.
`description`, `how_to_play` and `improvements` accept up to 16,000, 32,000 and
32,000 UTF-8 bytes respectively. `improvements` is advisory text: suggestions may
reference unowned cards, but they never change `cards`, `side` or collection counts.
Prompts ask for up to five prioritized upgrades with verified names/IDs, additional
copies, specific replacements, benefits and tradeoffs, without invented prices.
They default to empty for new decks; omitted fields are preserved on updates.
Pass an explicit empty string to clear a field. Both participate in revision checks.

Use `check_collection: true` on **save_deck** as well as validation when building
from owned cards. The browser rejects shortages against its current collection
atomically, including main deck plus sideboard and separate foil/alternate IDs.
Without this flag, ordinary draft/wishlist saves retain the existing behavior.

To update, first call `get_deck`, then include its `deck.id` as `deck_id` and its
`revision` as `expected_revision` alongside the entire replacement proposal.
If a user edits, deletes or undoes the deck in the meantime, the save fails with a
conflict rather than overwriting their changes. Read again and reconcile before
retrying. On a timeout, inspect `list_decks`/`get_deck` before retrying a creation:
the browser may have persisted it before the response was lost.

## Validation scope

Basic constructed checks follow the publisher's [deck-building rules](https://berserk.ru/pravila-igri):
30–50 cards in the main deck, normally at most three cards with the same name
across editions and sets. The report also includes bundled ban flags, cost curve,
elements and optional shortages by **exact edition**, including sideboard copies.

This is not tournament certification. Current event legality, rotation, sideboard
restrictions and card-specific exceptions require review. Unique-card and
crystal-budget restrictions apply to a deployed squad, not the full deck, and are
not incorrectly imposed on the deck. Counts are not reserved by other saved decks.

## Local bridge and storage

- One browser tab per server process, bound only to `127.0.0.1`.
- A random session token and an exact browser Origin check protect the socket.
  Pairing URLs are session credentials; don't share them. The app removes the
  token from its current address immediately after reading it.
- The server holds no collection database on disk. Each tool reads the paired
  browser's current state, not a potentially stale cached snapshot.
- Saves change decks only; collection quantities, prices, favorites and legacy
  backup fields remain untouched. Collection tools expose quantities, not prices.
- Success is returned only after browser localStorage writes successfully.
  Existing app undo and backup/export mechanisms continue to work.
- A disconnected or unavailable browser returns a tool error, never a fake success.
- MCP uses stdout exclusively; diagnostics go to stderr.

## Verification

```sh
cargo test --locked --features mcp
cargo clippy --locked --features mcp --all-targets -- -D warnings
cargo build --locked --features mcp --bin berserk-mcp
python3 scripts/test_mcp.py
python3 scripts/test_codex.py
```

The smoke test uses the real stdio initialize/list/call protocol, checks all thirteen
tools, catalog search, validation, error results and rejected bridge handshakes.

For a full browser integration check, run `python3 scripts/test_mcp.py --browser`
and open its printed URL. It deliberately uses **localhost**, separate from the
normal `127.0.0.1` collection. It creates a 30-card test deck, updates it, checks
readback/export, rejects a stale update and confirms collection preservation.
The process remains alive for UI inspection; undo the two test saves in the app,
then stop the script with Ctrl-C. Do not use this test with a valuable localhost
collection without backing it up first.

## Deck notes and portability

Description, how-to-play and improvement notes are editable in the deck editor and included in
printouts, duplication, JSON backups, text/ID decklists and Tabletop Simulator JSON.
Old backups load with empty notes. Text decklists use JSON-escaped `# description:`
`# how_to_play:` and `# improvements:` lines to retain paragraphs. TTS stores readable notes in
Description and structured notes in the deck object's GMNotes. The legacy compact
code represents cards only and cannot carry names or notes.

`test_codex.py` uses a protocol-level browser peer and a fake CLI in temporary
storage, checking UI events through subprocess execution and save, invalid
proposals, concurrent requests, cancellation, CLI failure and insufficient cards.
`python3 scripts/test_codex.py --real` runs a real Codex generation and a resumed feedback turn using a
synthetic collection, without touching browser storage; it uses account limits.
