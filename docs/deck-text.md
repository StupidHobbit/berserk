# Deck text and card references

Description, how-to-play and improvements support Markdown. Use **Редактировать
текст** to edit the source; changes autosave and the rendered preview updates
below each field. **Готово** returns to the reading view.

```markdown
## План на игру

- Защитите **[card:80001]** в начале партии.
- Рассмотрите [card:80001f] как конкретное фойловое издание.
```

`[card:ID]` renders as a blue, keyboard-accessible card-name button. The name,
edition and popup come from the bundled database, using the same detail dialog
as the card listing. The reference can point to any known card, including upgrade
suggestions outside the collection. Clicking it does not add the card to a deck
or change owned quantities. Exact edition suffixes are supported.

Unknown IDs remain visible as plain text. References inside inline/fenced code
or with an escaped opening bracket stay literal. Standard `[label](card:ID)`
links also work; the displayed label always comes from the database.

Headings, paragraphs, lists, bold, italics, strikethrough, blockquotes and code
are supported. Existing plain-text line breaks are preserved. HTTP(S) links open
externally; embedded images display alt text, and raw HTML is displayed as text.

Printing resolves references to readable card names. Backups, deck text exports
and MCP retain the original Markdown so it remains editable after import. Existing
plain notes remain unchanged. The local Codex and manual MCP prompts instruct the
agent to use verified `[card:ID]` references in all three note fields.
