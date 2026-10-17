# Foil rendering

`src/shaders/foil.frag` samples the original card scan and adds animated rainbow
diffraction, sparse soft-edged sparkles, and a reflection that sweeps with time.
An overlay blend preserves black ink and white highlights. A vertical mask reduces
the finish over the name and rules, and an ink mask suppresses additive glare on
dark pixels. The illustration mask is approximate because scans have different
layouts, especially full-art editions.

`u_time` supplies time in seconds. Light position and shimmer intensity follow
smooth, staggered cycles in the shader; neither cursor position nor hover affects
the finish. The cursor still controls the card's CSS 3D tilt. `u_resolution`
controls sparkle antialiasing; `u_seed` staggers individual cards. Sparkle centers
are jittered, with a pixel-footprint fade at small sizes. Fine periodic stripes
are deliberately omitted to avoid diagonal aliasing when cards are scaled. The vertex shader
draws two triangles. Tune `strength`, `coverage`, and `shine` in the fragment shader
to adjust the finish without changing the Rust renderer.

`src/foil.rs` compiles the vertex and fragment shaders through `web-sys`. One hidden WebGL 1 canvas
renders every visible animated card, resizing and clearing the source buffer to the card's
render resolution. Each draw is captured with `readPixels`, its rows are flipped
to top-down order, and `putImageData` replaces the card's 2D canvas pixels. Each
card thus owns a completed snapshot before the GPU buffer is reused. There is no
`drawImage` copy from a mutable WebGL canvas in the display path.
This preserves CSS perspective, rounded clipping,
dialog stacking, and the original accessible image. It avoids allocating a WebGL
context per card. GPU readback synchronizes rendering and costs more than an
accelerated canvas copy; buffers are reused per card and only visible cards are
updated. This trades some throughput for reliable independent card frames.

Listing cards use a regular `.card-open` block as the shared image/canvas
containing block, just like the detail view. A transparent `.card-hit-area` button
is a sibling of the image and canvas inside that block. Native button content
layout therefore cannot size or clip the shader overlay. Pointer tilt belongs to
the block; keyboard activation and focus indication belong to the button.

Listing foils retain full pointer-driven 3D tilt in Firefox, matching ordinary
cards and detail views. A temporary 2D fallback was removed at the user's request.
In the affected Firefox 158 profile, captured shader pixels were clean and
disabling 3D removed a vertical stripe. That compositing issue remains unresolved;
restoring perspective does not fix it. Reduced-motion mode disables tilt.

Rendering is capped at 30 frames per second, device pixel ratio 2, the source
image resolution, and 768 × 1088 pixels. Offscreen cards and cards behind a dialog
skip drawing. Hidden documents skip work. Reduced-motion mode draws a static
finish and redraws only when necessary. Unmounting a card releases its
texture; removing the last card cancels the animation loop. App cleanup releases
the renderer and context event listeners.

The original CSS layers remain active until a shader frame succeeds. Missing
WebGL, shader initialization failure, or texture upload failure leaves the CSS
fallback visible. Context loss restores the CSS layers; context restoration
rebuilds the program and textures. Print styling displays the original image.

## Bespoke card finishes

`src/card_effects.rs` registers one art-specific fragment shader per card identity.
The requested scope is 26 ultra-rares present in the supplied collection export
and all 24 ultra-rares plus all 49 rares in «Сердце роя». The scope fixture stores only card IDs,
not collection quantities or prices. See [unique-effects.md](unique-effects.md).

`Finish::for_card` selects `Unique(index)` by set, number, and rare/ultra-rare rarity.
Ordinary and foil editions share the same art animation; `FoilCanvas` supplies
`Card::is_foil()` as the explicit `u_is_foil` uniform on every draw. Each bespoke
shader adds its own metallic/iridescent finish when the flag is true. Labels,
filters, and collection data retain the original edition. Actual alternate or
full-art scans use their existing finish until separately authored spatial masks
exist; variants missing an alternate scan safely reuse the base effect.

All effects use time rather than pointer position. Art-specific spatial/color
masks keep names, icons, stats, and rules unchanged. Reduced motion freezes time
at zero. Pointer input only controls CSS 3D tilt.

One shared WebGL context renders all finishes. Only the generic program is
compiled at startup; unique programs compile on their first visible card and
are reused across editions. A failed unique shader logs its error and leaves that
card's original image visible, without breaking other shaders. Context restoration
clears the program cache and recompiles visible effects on demand.

To add a card, author a standalone WebGL 1 fragment shader with active `u_card`,
`u_resolution`, `u_time`, `u_seed`, and `u_is_foil` uniforms, register its stable
identity and source in `UNIQUE_EFFECTS`, and review its masks against the scan.
No renderer enum or program-dispatch changes are needed.

## Verification

- `cargo clippy --locked --features mcp --all-targets -- -D warnings`
- `cargo test --locked --features mcp`
- `env NO_COLOR=true trunk build --release --locked --dist dist-release`
- Browser: inspect grid, compact list, and detail dialog; switch foil → ordinary
  → foil to exercise canvas mounting and cleanup. Check the card remains upright,
  text readable, controls uncovered, and no white corners return.
- With browser developer tools, emulate reduced motion: the finish should remain
  static. Disable WebGL and reload to inspect CSS fallback. The hidden
  `canvas[data-foil-engine]` identifies the single shared context; successful card
  surfaces have `data-foil-renderer="webgl"`. Browser GPU context-loss simulation
  should remove those attributes, and restoration should put them back.

The Rust checks cover compilation and existing application regressions. Actual
GLSL compilation and visual behavior require a WebGL-capable browser; native
Rust tests cannot validate GPU output.

For GPU-to-2D pixel-copy checks, serve the repository root locally and open
`tests/foil-render.html`. It compares copied pixels with WebGL readback at grid,
detail, and compact sizes, including reused outputs over 32 animation frames.
The page also compares the former cropped-buffer path with whole-frame copies,
and verifies that independent snapshots retain every pixel after the GPU buffer
is reused and overwritten. It reports the snapshot transfer time on that browser.
It uses a bundled card image and does not read or change application data.

For browser-specific reports, open `/public/foil-diagnostics.html` in the affected
browser. Scroll its embedded app to the affected foil and click **Capture visible
foil**. The report includes the renderer build marker, browser, buffer sizes and
CSS bounds; it shows the captured canvas pixels separately from the transformed
listing. **Disable 3D for comparison** affects only the embedded page. A downloaded
JSON report includes the captured PNG but no collection/deck state or storage.

On macOS, `python3 scripts/test_foil_firefox.py 2300 headed` runs an isolated
Firefox capture with a temporary profile and Retina scale. It uses the installed
Firefox and its Marionette protocol, leaving the normal profile untouched. Add
`diagnostic` to exercise the report page. Add `regression` to verify that grid and
compact foils retain 3D transforms at rest and after pointer movement while ordinary cards
retain perspective and the shader keeps animating. Add `reduced` to verify that
reduced-motion mode disables tilt and freezes the shader. A 1905px window width
and DPR 2 produces a 255.767px card with a 496×700 buffer, matching the reported
card geometry. The original artifact did not reproduce in
the clean profile; confirmation in the affected profile remains a visual check.

`python3 scripts/test_foil_firefox.py 1600 headed higart` checks both Хигарт
editions, grid/compact/detail rendering, and pixel changes confined to the art.
Adding `reduced` verifies a static finish. In Firefox 158, the animated frame
comparison changed artwork pixels and left the name/rules pixels identical;
reduced motion left all pixels identical. Captures are saved as
`/tmp/higart-frame-*.png` and `/tmp/higart-detail.png`.
The same probe renders `u_is_foil` false → true → false at identical time and
seed, checking that only artwork changes and the ordinary result is restored
exactly. It also verifies the edition flags in the listing and foil detail view,
and saves the foil detail canvas to `/tmp/higart-foil.png`.

`python3 scripts/test_unique_shaders.py` compiles all registered shader files in
an isolated Firefox profile. It compares ordinary/foil output at identical time,
checks time animation, verifies exact ordinary-state restoration after foil,
and ensures the name/rules bands remain unchanged. Optional card IDs select a
batch. `/tmp/ultra-shader-captures/` contains per-edition captures and results.
`python3 scripts/test_foil_firefox.py 1600 unique` visits every target in the
running app, checks both editions use the expected shader, and tests context
loss/restoration after the lazy program cache has been populated.
