# Berserk v0.2.0 — native desktop

Berserk now runs in a GPU-rendered Rust interface on Linux, macOS and Windows.
Linux supports Wayland and X11; desktop packages no longer require WebKitGTK or
WebView2.

## Performance and rendering

- Direct GPU rendering removes animated-card GPU-to-CPU readback while retaining
  all 99 bespoke card effects and foil finishes.
- Virtualized card rows, a 64 MiB artwork texture cache and background image
  decoding keep browsing responsive. Previews adapt to display resolution.
- Frameless cards have depth, pointer-driven tilt, shadows and varnish; rounded
  artwork corners no longer leave white patches.
- Procedural parchment, wood, leather and bronze accompany a subtle animated
  fantasy map inspired by Laar. Reduced-motion settings and background pausing
  limit unnecessary animation.
- Saves run on background workers with atomic writes, profile locking,
  validation, failed-save rollback and undo.

## Collection and decks

- Collection import shows totals by rarity and the number of represented sets,
  without raw-text editing or card previews.
- **Мои данные** offers two actions: save a backup or restore from a file.
  Restore accepts files without extension restrictions and detects backups and
  collection exports by their contents.
- Deck import accepts multiple files, names each deck after its filename, and
  previews card counts by element before saving the batch.
- A dedicated **Создать с Codex** page checks CLI login in the background, caches
  the result for five minutes, and supports manual refresh and sign-in.
- Clearing or changing allowed sets keeps the selector open.
- Shared catalog rules, collection metadata, deck formats, notes, the simulator
  and revision-checked Codex generation/refinement remain available.

## Updating from v0.1.x

Before switching, export a JSON backup through **Мои данные** in the old app.
In this version, use **Мои данные → Восстановить из файла…** to import it. The old
browser profile remains intact; migration is not automatic. Collection-only
`.brsc` exports can also be imported.

Downloads include offline card images. AI features require your own Codex CLI
installation and login. Rendering requires OpenGL 3.3 or OpenGL ES 3.0. Printing
opens the deck list in the system browser.

macOS downloads are ad-hoc signed, without Apple notarization; Windows binaries
are unsigned. SHA-256 checksums accompany the downloads. Linux CI uses Mesa
software rendering, so performance on physical Linux GPUs still depends on the
driver and hardware.
