# Berserk v0.2.1 — deck editor and living atlas

## Decks

- Switch between the card catalog and a detailed deck overview with main-deck
  and reserve galleries, total health and attack, and opening-hand probabilities.
- Compact deck rows show printed set icons, card numbers, gold/silver costs and
  copy counts, with controls for moving cards between the deck and reserve.
- Cards are ordered by set and card number. A cost histogram shows the deck's
  distribution, including zero-cost cards and a combined 12+ cost bin.
- Deck-library cards provide direct deletion controls. Deletion names the
  selected deck and remains undoable; navigation saves pending name edits.
- The editor keeps the draw-hand action at the bottom and improves narrow-window
  layout. Export and print controls have been removed from the native deck UI.

## Background

- A procedurally generated atlas reveals coastlines, mountain ranges, forests,
  rivers, settlements and compass roses as the camera travels.
- Each app session has its own stable geography. Gentle movement respects
  reduced-motion settings and pauses without jumping when resumed.

## Downloads

Packages include offline card images for macOS Apple Silicon, macOS Intel,
Windows x64 and Ubuntu x64. AI features require your own Codex CLI installation
and login. Rendering requires OpenGL 3.3 or OpenGL ES 3.0.

Existing v0.2.0 native profiles continue to work. When updating from v0.1.x,
export a JSON backup in the old app and restore it through **Мои данные**.

macOS downloads are ad-hoc signed without Apple notarization; Windows binaries
are unsigned. SHA-256 checksums accompany the downloads.
