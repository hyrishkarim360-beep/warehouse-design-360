# Warehouse Blok O — Interactive Spatial Model

An offline-first, browser-based conceptual 3D coordination viewer derived from the supplied REV-00 brief and SVG design reference. It uses a lightweight custom perspective renderer and procedural geometry; it has no build step, package install, remote model, or CDN requirement.

## Run

Start the included local server from this folder:

```powershell
python serve.py
```

Then open `http://localhost:8000`. No network connection or package install is required. Opening `index.html` directly also works for the viewer and one-off viewport capture; the local server is needed for the batch review-shot export. The application was authored for desktop and tablet layouts and adapts to narrow screens.

## Controls

- **Orbit:** drag to orbit through 360°; wheel to zoom; Shift-drag or middle-drag to pan.
- **Plan:** north-up orthographic view with footprint dimensions, zones and system markers.
- **POV:** click the model to engage mouse look, then use WASD or arrow keys to walk. Shift increases walking speed. Esc or the **Exit POV** button returns to the interior view.
- **Interior / Exterior:** jump to operational interior or south-east exterior views.
- **Camera shot:** choose any of the 17 named `CAM_*` presets, including elevations and system-focused views.
- **Roof:** toggle the roof layer; plan and interior presets hide it to expose the interior.
- **Measure:** click two locations to measure a ground-plane distance in metres.
- **Present:** open a JavaScript-driven five-stop client walkthrough with a project summary and curated site, interior, plan, services and facilities views. Use the chapter buttons or ← / → to navigate; press Esc or select **Exit presentation** to return. Selecting a system marker exits the walkthrough and opens its technical inspector.
- **Capture:** save the current viewport as a PNG.
- **17 shots:** save a PNG for every named camera preset into `screenshots/` (requires `python serve.py`).
- **System rows / markers:** select a system to focus it and read its specification, installation sequence and QA/QC checklist. Use its eye icon to hide or show it.
- **Model layers:** toggle disciplines, isolate a selected system, show all, or hide nonessential context.
- **Lighting:** change between day exterior, day interior and night operations.

## Project files

- `index.html` — semantic application shell and controls.
- `styles.css` — responsive dark industrial interface.
- `app.js` — procedural scene, renderer, navigation, selection and UI behavior.
- `systems.js` — structured source-derived records for systems 01–08.
- `serve.py` — local preview server and PNG receiver for the camera-shot set.
- `AI_AGENT_PROMPT_WAREHOUSE_3D.md` — supplied master brief.
- `WAREHOUSE_3D_MOCKUP_REFERENCE.svg` — supplied four-view UI / composition reference.
- `ASSUMPTIONS.md` — interpretation limits and TBC items.
- `VALIDATION.md` — implementation coverage and review status.
- `screenshots/` — generated viewport PNGs for the named camera presets.

## Accuracy

The documented warehouse footprint is 140 × 88 m (12,320 m²). The brief's ten listed zone areas sum to 9,520 m² and their stated dimensions do not reconcile with the footprint. The model therefore shows the ten zone labels and temporary D–G area as schematic bands, without claiming individual zone dimensions. Other unprovided heights, layouts, equipment ratings, support sizes and exact asset positions are conceptual or TBC. See `ASSUMPTIONS.md`.

> This interactive model is a coordinated visualization derived from schematic source drawings. It is not a fabrication, structural-certification, or as-built model. Verify dimensions, equipment specifications, clearances, and tentative locations through field survey and discipline-engineer approval before construction.
