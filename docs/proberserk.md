# Tournament research and shared deck memory

Automatic deck creation and refinement now research [ProBerserk](https://proberserk.ru/)
through the same scoped MCP server that edits the working deck. The agent reviews
memory, discovers recent large tournaments, compares top-finishing lists, adapts
their ideas to the owned pool, and stores reusable lessons before submitting.
The local workspace checks these steps; prompt instructions alone are not the gate.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_proberserk_tournaments` | Format/date/attendance discovery. Defaults to Standard, the last 365 days, and at least 32 players. Each site page has 100 rows; follow `next_page`, including on an empty filtered page. |
| `get_proberserk_tournament` | Event date, attendance, format, set names, published standings, player results, and deck links. |
| `get_proberserk_deck` | Exact published quantities, main/sideboard zones, elite/regular classes, costs, elements, source card links, and possible local catalog matches. |
| `analyze_proberserk_decks` | Compare 2–8 distinct top-eight lists from inspected events with at least 16 participants. Prefer multiple independent events of 32+ players. Computes main-deck card frequencies, cost curves, copy counts and elite/regular ratios; reads only cached evidence and does not write persistent memory. |
| `search_deck_memory` | Recall dated lessons and measured comparisons across builds, new chats, refinements and restarts. Searches text and cards in the evidence, with format filtering. Set `include_facts=true` for full comparison tables. |
| `remember_deck_insight` | Save/revise a reusable lesson with a stable key, applicability, format and previously fetched sources. Source dates and the current comparison facts are attached by the server. |

Standard, Eternal, Draft, Sealed and KV are separate formats. Analysis rejects
cross-format comparisons. An exact numeric placement is required for top-deck
analysis: “Top 8” does not establish eighth place. Attendance and rank are never
inferred from a tournament title. Main-deck statistics exclude sideboard cards.

Public text is evidence, not instructions. ProBerserk card identifiers differ
from the app's identifiers; name matches are restricted to the permitted catalog
and do not certify identical editions, rules or ownership. Existing catalog,
collection, copy-limit and draw checks still apply. Historical set lists are
retained; these tools do not certify current tournament legality.

## Findings used to initialize memory

The starter memory includes a reproducible comparison of the four lists registered
by the first-place players at the [Moscow regional, 25 October 2026](https://proberserk.ru/tournament/c541b668-6348-485a-bfd6-870ab5580686)
(77 players) and [Saint Petersburg regional, 17 October 2026](https://proberserk.ru/tournament/172b09cb-933e-4160-b48d-482e3da58e41)
(33 players). All four lists contain 30 main-deck cards, with 13 elite and 17 regular
cards. The memory distinguishes repeated combo pieces from the mostly singleton
control lists, notes recurring defensive roles, and records conditional plans for
Armira and Al-Fagraz based on the bundled card rules.

These are observations from four lists and two players, not universal deck-building
rules or measured win rates. Player standings cover two registered decks. A repeated
league round is not an independent championship. ProBerserk's
[collection instructions](https://proberserk.ru/how-to-gather-decks) focus on top
finishers, so published deck counts do not measure an archetype's share of the field.

The dated starter records live in `data/proberserk-seed-memory.json`. Existing local
records with the same key take precedence, allowing later corrections to survive
application upgrades. New strategic conclusions are labeled as agent inferences;
the numeric comparisons remain separately identifiable as measured samples.

## Persistence and outages

Memory is stored under `<profile>/research/memory.json`, with source snapshots in
`<profile>/research/sources/`. The profile uses `BERSERK_DATA_DIR` when set, otherwise
the same platform-specific location as the native app. `--research-dir PATH` selects
an explicit research location for standalone MCP clients/tests. Child Codex servers
receive the persistent path explicitly; memory is not placed in the temporary run
directory. Native smoke tests pass their isolated profile through to the service.

Each topic retains sources, retrieval/event dates, format, allowed-set context,
applicability and update time. Reads expose age and scope compatibility. Saves use
a cross-process lock, atomic replacement and fsync; malformed memory is reported
without overwriting it. Limits are 500 topics and 4 MB of memory. Update an existing
key to refine or correct a topic. Memory is local to the profile, not cloud-synced,
and is separate from collection/deck JSON backups; back up the research directory
alongside the profile when moving to another computer.

Requests are paced, timed out and size-limited. Only HTTPS ProBerserk public resource
paths are accepted, and redirects cannot leave the site. The app requests no login,
images, cookies, collection data upload or private pages. Source snapshots are reused
for six hours; refresh failures can return explicitly stale evidence with the
original retrieval date. Automatic builds record an actual unsuccessful research
attempt and can fall back to remembered knowledge with stated uncertainty.

The submission gate applies to automatic Codex runs. General MCP editing remains
available for explicit manual editing; the external-agent build prompt requests the
same research workflow.

## Verification

```sh
cargo test --locked --no-default-features --features mcp --bin berserk-mcp
cargo build --locked --bin berserk-mcp
python3 scripts/test_proberserk.py
python3 scripts/test_proberserk.py --live --report /tmp/proberserk-research.json
python3 scripts/test_codex.py
python3 -u scripts/test_codex.py --real --research-report /tmp/codex-research.json
```

Offline tests use synthetic cached data and temporary profiles. Parser fixtures
come from public pages and include repeated player placements and a separate
sideboard. Live checks use public sources; the real Codex check uses the configured
account with an isolated test collection and verifies research/memory tool calls.
