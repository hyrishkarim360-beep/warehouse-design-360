# Implementation and validation report

## Implemented

- Single-folder, offline-first web viewer with no external JavaScript libraries, model downloads or build dependencies.
- Procedural perspective scene at metre scale: 140 × 88 m warehouse footprint, shell, roof, frames, north and south docks, apron, service yard, circulation, trucks, fence, gatehouse, landscaping, office block, racks, conveyors, MEP routes, safety elements and the eight installation systems.
- Structured system records for 01–08 with quantities, source status, locations, specifications, installation steps and QA/QC checks; UI panels are generated from these records.
- 17 named camera presets: plan north; four exterior corners; south / north / east / west elevations; main / office / conveyor / services interior; generator, facilities, consumables and AC platform focus.
- 360° orbit, zoom, pan, plan view, interior/exterior presets, first-person WASD / arrow walkthrough with obstacle bounds, roof visibility, system selection, focus, per-system visibility, discipline visibility, isolation, measurement and viewport PNG capture.
- Day exterior, day interior and night operations lighting states; responsive panel layout and touch-oriented controls.
- Client presentation mode expands the model view and hides both side panels. A JavaScript-driven five-stop walkthrough changes the camera and updates its project summary; chapter buttons and arrow keys navigate, and Esc exits.
- Pointer hover uses the lightweight system markers while full polygon hit-testing runs only on selection, reducing repeated work during camera movement. Camera frames also cull distant/off-screen faces and omit hidden interior detail from the roof-on exterior view.
- Increased contrast across the concrete, steel, roof, racking and safety-marking palette; lightly tinted schematic floor bands highlight temporary work area D–G.
- Persistent schematic / field-verification disclaimer and source-area discrepancy documented in `ASSUMPTIONS.md`.

## Review limitations

- The renderer is a dependency-free Canvas 2D polygon painter with perspective projection and depth sorting, not a WebGL depth-buffer renderer. It is intended for preliminary coordination and review at moderate scene detail; intersecting geometry can show painter-order artifacts at some camera angles. It is not a survey-grade BIM deliverable.
- Walkthrough collision bounds cover the warehouse edges, office block, major rack rows, generator house, consumables cage, facilities and vehicles; they are simplified navigation constraints, not a detailed physical collision mesh.
- Marker and system models are representative. Structural member sizing, engineering calculations, ratings, foundations, fire classifications and exact service routes are intentionally not provided.
- The supplied zone schedule conflicts with the stated footprint. Rendered zone boundaries are schematic equal bands and should not be used for area take-off.
- This workspace contained no PDF or dimensioned source drawing beyond the supplied prompt and SVG reference.

## Validation performed

- `node --check app.js`, `node --check systems.js`, and a Python AST parse of `serve.py` completed without errors.
- Headless harness (`node test/smoke.js`): the full scene is built with a mocked DOM and a software Canvas 2D rasterizer (`test/swcanvas.js`). 63 automated checks pass, covering:
  - geometry: face count, no NaN vertices, 140 × 88 m footprint, all eight systems present with selectable volumes, all discipline groups and the roof layer;
  - navigation: all 17 named presets render, three lighting states render, selection of every system, isolation, roof toggle;
  - POV: forward movement at the expected speed and wall-collision stop;
  - plan ray casting, presentation stops and preset references, HVLS blade animation.
- Ran the **17 shots** workflow headlessly. All 17 named preset PNGs plus day/night/interior lighting variants were exported under `screenshots/` and pixel-verified (`node test/analyze.js`): content variance, footprint layout, and night-vs-day luminance separation all pass. The preview viewport exports at 1280 × 720 pixels.
- In a browser, the application is opened at `http://localhost:8000` via `python serve.py`; the same render path produces the interactive viewport, the 17-shot batch export (POST to the local capture endpoint), and viewport PNG capture.
- Verified roof visibility toggles, POV mode with an explicit Exit POV control, and that the eight system rows and ten layer toggles load from the structured records.
- The local server is `serve.py`; it listens on `127.0.0.1:8000` and accepts only validated `CAM_*.png` payloads at its local capture endpoint.

The PNGs show the model viewport for geometry review. The app itself remains interactive at the local preview URL while `serve.py` is running. This report does not certify survey accuracy, structural adequacy, or construction readiness.
