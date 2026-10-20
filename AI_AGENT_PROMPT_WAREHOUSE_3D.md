# MASTER PROMPT — Interactive 3D Warehouse Digital Twin

## Role

You are a senior 3D environment artist, industrial architect, BIM coordinator, lighting artist, and front-end/WebGL engineer. Create a polished, browser-based interactive 3D warehouse digital twin from the supplied 2D layout, installation-method document, and flowcharts.

The result must be a functional interactive application—not a static render, concept image, slideshow, or video. It must provide a detailed interior, exterior, accurate spatial navigation, selectable technical assets, and an explanatory UI panel.

---

## Project Information

- **Project:** Electrical network installation and supporting warehouse facilities
- **Site:** Blok O, GTL, Jalan Kosambi, Tangerang, Indonesia
- **Document revision:** REV-00 / 2026
- **Main warehouse footprint:** **140 m × 88 m**
- **Total footprint:** **12,320 m²**
- **Warehouse grid:** **Zones A–J**
- **Temporary work area:** Zones **D, E, F, and G**
- **North side:** Dock / northern apron
- **South side:** Outbound / southern dock
- **Source status:** The drawing is schematic. Dimensions marked with ellipses and the locations of wiremesh, HVLS fans, and conveyor platforms must be treated as tentative until field verification.

### Zone areas from the source drawing

- Zone A: 30 × 34 m = 1,020 m²
- Zone B: 30 × 34 m = 1,020 m²
- Zone C: 30 × 34 m = 1,020 m²
- Zone D: 30 × 34 m = 1,020 m²
- Zone E: 20 × 34 m = 680 m²
- Zone F: 20 × 34 m = 680 m²
- Zone G: 30 × 34 m = 1,020 m²
- Zone H: 30 × 34 m = 1,020 m²
- Zone I: 30 × 34 m = 1,020 m²
- Zone J: 30 × 34 m = 1,020 m²

Do not claim survey-grade or construction-grade accuracy where the source lacks dimensions. Display “Tentative—verify on site” in the UI for unconfirmed positions.

---

## Primary Goal

Build a complete, realistic, optimized 3D warehouse environment containing:

1. Full warehouse exterior and surrounding site.
2. Complete warehouse interior and operational equipment.
3. Eight required installation systems from the source document.
4. Accurate 360-degree orbit inspection.
5. First-person walkthrough and eye-level POV.
6. Top/plan, exterior, interior, and focused asset views.
7. Selectable assets with an explanation/specification panel.
8. Layer visibility controls for architectural, structural, MEP, safety, and operational systems.
9. Responsive desktop and tablet UI.
10. A clearly visible disclaimer distinguishing confirmed source facts from inferred visualization details.

---

# 1. 3D SCENE REQUIREMENTS

## 1.1 Scale, coordinates, and organization

- Use real-world metric units: **1 scene unit = 1 meter**.
- Establish a consistent north direction and display a compass.
- Center the model near world origin.
- Name objects and scene groups semantically.
- Use a hierarchy such as:
  - `SITE`
  - `WAREHOUSE_ARCHITECTURE`
  - `WAREHOUSE_STRUCTURE`
  - `ROOF_SYSTEM`
  - `INTERIOR_STORAGE`
  - `CONVEYORS`
  - `ELECTRICAL`
  - `MECHANICAL_HVAC`
  - `FIRE_SAFETY`
  - `FACILITIES`
  - `GENERATOR_HOUSE`
  - `LANDSCAPE`
  - `VEHICLES`
  - `HOTSPOTS`
- Give every selectable installation asset a stable unique ID.
- Keep all transforms clean and avoid duplicated coplanar geometry or z-fighting.

## 1.2 Main building exterior

Model the complete warehouse shell with:

- Approximate 140 × 88 m footprint.
- Steel portal-frame or truss structure.
- Structural columns, rafters, beams, bracing, purlins, and roof edge details.
- Corrugated or standing-seam metal roof.
- Metal wall cladding with realistic panel seams.
- Concrete plinth and slab edges.
- Gutters, downpipes, roof vents, and ridge ventilation.
- North and south loading dock façades.
- Roller shutter/loading doors.
- Personnel doors and emergency exits.
- Dock canopies, dock levellers, bumpers, bollards, stairs, and guardrails.
- External service areas and clear circulation routes.
- Exterior safety and directional signage.
- Plausible weathering: subtle dust, concrete wear, tire marks, panel roughness, and edge variation. Keep the facility maintained and professional, not abandoned.

## 1.3 Surrounding site

Include:

- North dock/apron and south outbound dock.
- Truck circulation lanes.
- Road arrows and lane markings.
- Car and motorcycle parking where appropriate.
- Several parked trucks or trailers at loading bays.
- Perimeter fence, posts, access gates, and guardhouse.
- Stormwater channels or trench drains.
- Concrete paving and asphalt variation.
- Landscaped islands with restrained tropical planting suitable for Tangerang.
- Site lights and security lighting.
- Clearly maintained fire and emergency access.

## 1.4 Warehouse interior

The interior must feel complete and operational. Include:

- Polished industrial concrete floor with expansion joints.
- Zone markings A–J painted or signed clearly.
- Vehicle lanes, pedestrian lanes, crossings, keep-clear zones, and hazard striping.
- Structural steel columns and roof trusses.
- High-bay LED lights.
- Cable trays, conduits, distribution panels, and junction boxes.
- Red fire-water main where appropriate.
- Fire extinguishers and safety signs.
- Pallet racks with realistic beams, uprights, guards, pallets, cartons, and mixed occupancy.
- Selected clear operational staging areas.
- Pallets, cages, bins, wrapped loads, and warehouse accessories.
- Conveyor lines and their access platforms.
- Safety bollards around vulnerable equipment.
- Emergency exit signs, aisle labels, and zone identifiers.
- Offices, meeting rooms, admin, training, and server-room block.
- Office furniture, tables, chairs, glass/solid partitions, doors, cabinets, lighting, and electrical outlets.
- Avoid excessive clutter that blocks circulation or makes the installation systems unreadable.

---

# 2. REQUIRED INSTALLATION SYSTEMS

Create all eight systems below as distinct selectable layers and hotspot groups.

## System 01 — Meeting-room electrical outlets

Model:

- Meeting, office, admin, training, and server-room block.
- Ten representative outlet points labeled SK-1 through SK-10 where supported by the schematic.
- Surface-mounted PVC conduit, nominal Ø ¾ inch.
- Tee/junction boxes.
- NYM 3 × 2.5 mm² power-cable route represented inside the conduit or in an optional technical-overlay mode.
- Outlets mounted approximately **250 mm above finished floor level**.
- Distribution panel and labeled circuit path.
- Grounding connection.

UI specification:

- Category: Electrical
- Quantity: 10 representative outlets
- Cable: NYM 3 × 2.5 mm²
- Conduit: PVC Ø ¾ inch
- Mounting: ±250 mm AFFL
- QA/QC: continuity, insulation resistance/megger, polarity, voltage, grounding, termination, commissioning

## System 02 — Wiremesh barriers

Model:

- Wiremesh at several tentative warehouse/outbound points.
- One outbound barrier approximately **1 m high**, as noted in the source.
- Galvanized mesh, posts, frames, anchors/baseplates, edge protection, gate where needed, and touch-up finish.
- Three representative locations while clearly marking placement as tentative.

UI specification:

- Category: Safety barrier
- Height: 1 m for outbound area
- Material: galvanized steel mesh
- Locations: tentative; field verification required
- QA/QC: anchor tightness, alignment, sharp-edge removal, coating repair

## System 03 — HVLS fans

Model:

- Two representative HVLS fans where indicated by the layout.
- Fan diameter: **7.5 m**.
- Hub, motor, six or manufacturer-appropriate blades, suspension frame, safety cable, structural bracket, and cable conduit.
- VFD/control panel.
- Visible no-obstruction safety radius.
- Optional slow blade animation.

UI specification:

- Category: Mechanical/HVAC
- Quantity: 2 units
- Diameter: 7.5 m
- Control: VFD
- Status: support structure and final positions require engineer/field confirmation
- QA/QC: structural-capacity check, balance, vibration, staged run test, electrical insulation test

## System 04 — Site facilities

Model:

- Four representative APAR/fire-extinguisher points with brackets/posts and signage.
- Two portable toilets.
- Elevated water tank/torent with support base.
- Clean-water pipe route to toilets.
- Service clearances and stable level bases.

UI specification:

- Category: Welfare and fire safety
- Assets: 4 APAR, 2 portable toilets, 1 water tank
- QA/QC: access clearance, signs/labels, stability, water filling and leak test

## System 05 — Generator house

Model:

- Reinforced concrete slab or foundation.
- Enclosed generator house with frame, walls, roof, access door, intake louver, ventilation, and acoustic intent.
- Generator unit on anti-vibration mounts.
- Exhaust route and weather cap.
- Daily fuel tank and protected fuel line.
- ATS panel, power cable route to the main panel/load, and grounding system.
- Safe maintenance clearance.

UI specification:

- Category: Emergency power
- Components: generator, ATS, daily tank, exhaust, grounding
- QA/QC: foundation curing, anti-vibration installation, megger test, termination, grounding, test run, load test

## System 06 — Consumable wiremesh cage

Model:

- Secure wiremesh enclosure.
- Anchored posts or baseplates.
- Lockable gate.
- Rack A and Rack B.
- Clearly marked consumable storage zone.
- Safe post spacing and access aisle; unknown exact dimensions must be marked TBC.

UI specification:

- Category: Secure storage
- Components: wiremesh, posts, gate, lock, two racks
- Status: final dimensions and post spacing TBC
- QA/QC: anchors, mesh fixing, gate operation, lock, labels

## System 07 — Conveyor platforms

Model:

- Existing conveyor lines with visible flow direction.
- Seven representative platform locations, identified as tentative pending confirmation.
- Steel columns, baseplates, anchors, beams, grating deck, kickplates, handrails, stairs, and access landings.
- Safe clearance around the conveyor.

UI specification:

- Category: Operations/access
- Quantity: 7 tentative locations
- Material: structural steel and galvanized/painted grating
- Safety: handrail, kickplate, stair, clearances
- QA/QC: bolt torque, weld checks, coating, anchor checks, as-built conveyor verification

## System 08 — Outdoor AC platform

Model:

- External service platform adjacent to the air-conditioned rooms.
- Three outdoor AC units.
- Steel brackets/frame, anchors, grating deck, and handrail where required.
- Spring vibration mounts.
- Refrigerant pipework, drain, cable route, and organized supports.
- Technician service clearances and access door.

UI specification:

- Category: Building services/HVAC
- Quantity: 3 outdoor units
- Mounting: spring vibration isolators
- Requirements: maintenance access, pipe/cable organization, structural verification
- QA/QC: anchors, platform alignment, vibration isolation, drainage and access

---

# 3. MATERIALS AND TEXTURES

Use physically based materials where supported.

Required material types:

- Industrial concrete with subtle aggregate, joints, tire marks, and roughness variation.
- Painted structural steel with realistic roughness and small edge wear.
- Galvanized wiremesh and grating.
- Corrugated metal roof and wall cladding.
- Rubber dock bumpers.
- Powder-coated equipment panels.
- Cardboard, timber pallets, shrink-wrap, painted safety lines, glass, asphalt, and landscaping.
- Avoid stretched UVs, visibly repeated textures, excessive gloss, and unrealistic neon saturation.
- Use texture atlases, instancing, and reusable materials to control performance.
- If texture files are unavailable, generate subtle procedural materials instead of leaving objects flat and untextured.

---

# 4. LIGHTING AND ATMOSPHERE

Provide at least three lighting states:

1. **Day exterior** — bright overcast/tropical daylight with soft shadows.
2. **Day interior** — skylight/daylight plus high-bay LEDs.
3. **Night/operations** — exterior security lights and interior work lights.

Requirements:

- Use realistic exposure and neutral industrial color grading.
- Enable soft contact shadows or baked ambient occlusion.
- Avoid fully black shadows and blown-out highlights.
- Reflections should be restrained and physically plausible.
- Interior equipment must remain legible when viewed from the outside or when the roof is hidden.

---

# 5. CAMERA AND NAVIGATION

Implement:

## Orbit mode

- Full 360° horizontal orbit.
- Controlled vertical orbit limits to prevent accidental inversion.
- Smooth damping.
- Mouse/touch drag to rotate.
- Wheel/pinch to zoom.
- Shift-drag or middle-drag to pan.

## Plan mode

- Orthographic or near-orthographic top view.
- North indicator.
- Fit the 140 × 88 m warehouse in view.
- Display zones A–J and installation markers.

## Interior mode

- Camera preset inside the warehouse showing racks, conveyors, fans, and operational circulation.
- Roof and obstructing façade may fade or hide automatically.

## Exterior mode

- Camera preset showing the complete façade, docks, trucks, roads, fencing, guardhouse, and landscape.

## First-person/POV mode

- Eye height around 1.65–1.75 m.
- WASD or arrow-key movement.
- Mouse/touch look.
- Collision with walls and major equipment.
- Adjustable walking speed; no uncontrolled flying.
- Provide an obvious “Exit POV” control.

## Focus mode

- Clicking a hotspot smoothly moves the camera toward the selected system.
- Preserve a safe view distance.
- Highlight the selected object without hiding its material.
- Include a “Return to overview” command.

## Optional section controls

- Roof on/off or transparent.
- Exterior walls on/off or transparent.
- Exploded or sectional view only if it remains intuitive and performant.

---

# 6. EXPLANATION PANEL UI

Create a premium dark industrial interface. It must resemble a professional digital-twin/BIM coordination tool rather than a game HUD.

## 6.1 Visual direction

- Background: charcoal/near-black with subtle transparency and blur.
- Primary text: off-white.
- Secondary text: cool gray.
- Accent: warm amber/copper.
- Status green only for verified/active conditions.
- Warning orange for tentative locations.
- Error red only for conflicts or safety warnings.
- Typography: clean sans-serif UI plus an optional restrained serif display face.
- Thin borders, compact spacing, and readable contrast.
- Do not cover the central model unnecessarily.

## 6.2 Top header

Display:

- Project name: “Warehouse Blok O”
- Subtitle: “Interactive Spatial Model”
- Site: “GTL · Kosambi, Tangerang”
- Revision: “REV-00 / 2026”
- Coordination/model status indicator
- Optional FPS/loading indicator in a debug menu only

## 6.3 Left installation-layer panel

Provide a numbered list:

1. Meeting-room electrical
2. Outbound wiremesh
3. HVLS fans
4. Site facilities
5. Generator house
6. Consumable cage
7. Conveyor platforms
8. AC platform

Each row should include:

- Two-digit number
- Asset/system name
- Discipline/category
- Visibility eye icon
- Selection state
- Tentative warning icon where applicable

Clicking a row must:

- Select the layer.
- Highlight its objects and hotspot.
- Move/focus the camera.
- Populate the right explanation panel.
- Keep other layers visible unless the user explicitly isolates the selection.

Add these layer groups:

- Architecture
- Structure
- Roof
- Storage/racking
- Conveyors
- Electrical
- Mechanical/HVAC
- Fire and safety
- Site facilities
- Vehicles and landscape

Controls:

- Show all
- Hide all nonessential layers
- Isolate selected
- Reset layers

## 6.4 Right explanation panel

When nothing is selected, show the project overview:

- Footprint: 140 × 88 m
- Area: 12,320 m²
- Grid: A–J
- Navigation: 360° orbit / POV
- Source status: schematic
- Warning: final dimensions and tentative positions require field verification

When an asset is selected, show:

1. Two-digit system number and category.
2. System title.
3. Plain-language description.
4. Technical specification grid.
5. Installation method.
6. QA/QC checklist.
7. Source status: confirmed, inferred, tentative, or TBC.
8. Relevant dimensions and quantity.
9. A “Focus asset” button.
10. An “Isolate layer” toggle.
11. A “Show installation sequence” control.

Example specification-grid fields:

- Quantity
- Dimensions
- Material
- Electrical rating/cable
- Mounting elevation
- Location
- Verification status

## 6.5 Bottom toolbar

Include:

- Orbit
- Plan
- POV
- Interior
- Exterior
- Roof toggle
- Measure
- Screenshot
- Reset

Clearly indicate the active tool.

## 6.6 Compass, scale, and help

- Animated compass linked to camera heading.
- Metric scale bar in plan mode.
- Minimal help text: drag to orbit, wheel to zoom, shift-drag to pan, click markers.
- Optional keyboard-shortcut dialog.

## 6.7 Hotspots and labels

- Use numbered markers 01–08.
- Keep marker size approximately constant in screen space.
- Prevent excessive overlap.
- Mark selected assets with an amber ring or soft outline.
- On hover, show name and discipline.
- Labels should hide or cluster at long distances.
- Use occlusion-aware labels if practical.

## 6.8 Responsive behavior

- Desktop: left layer panel and right explanation panel visible.
- Tablet: collapsible panels.
- Mobile: bottom-sheet explanation panel and compact layer selector.
- Maintain usable touch targets of at least 40–44 px.
- Never make 3D navigation dependent on hover.

---

# 7. INSTALLATION-SEQUENCE CONTENT

For each system, optionally display a concise workflow:

1. Survey and verify drawings/site conditions.
2. Prepare materials, tools, workforce, JSA, permits, and PPE.
3. Mark installation points.
4. Install supports, frames, conduits, anchors, or foundations.
5. Install the main equipment/system.
6. Complete electrical/mechanical connections.
7. Test and inspect.
8. Rework if inspection fails.
9. Finish, clean, label, document, and hand over.

Use the source-specific workflow for each asset where available. Present it as a vertical stepper or animated sequence. Do not imply that an animation replaces an approved method statement.

---

# 8. MEASUREMENT AND INFORMATION ACCURACY

- All known dimensions must come from the supplied source.
- Clearly distinguish:
  - **Documented** information
  - **Reasonable visualization assumptions**
  - **Tentative location**
  - **TBC by survey/engineer**
- Do not invent structural member sizes, electrical ratings, equipment brands, fire classifications, or load capacities and present them as facts.
- Any inferred value must be labeled “Conceptual,” “Typical,” or “TBC.”
- Add a persistent disclaimer:

> “This interactive model is a coordinated visualization derived from schematic source drawings. It is not a fabrication, structural-certification, or as-built model. Verify dimensions, equipment specifications, clearances, and tentative locations through field survey and discipline-engineer approval before construction.”

---

# 9. TECHNICAL IMPLEMENTATION

Preferred implementation:

- Three.js, React Three Fiber, Babylon.js, or another production-quality WebGL/WebGPU stack.
- Use GLTF/GLB for optimized model delivery.
- Draco and/or Meshopt compression where supported.
- KTX2/Basis texture compression where supported.
- Instancing for racks, columns, pallets, lights, fence posts, and repeated equipment.
- Level of detail for high-density assets.
- Frustum culling and conservative shadow-caster selection.
- Lazy-load secondary assets.
- Provide a visible loading screen with progress.
- Keep the main UI accessible with semantic HTML and keyboard navigation.
- Do not depend on network-only assets without a graceful local fallback.

Performance target:

- Aim for 50–60 FPS on a modern desktop.
- Remain navigable on an average tablet.
- Avoid unnecessarily dense geometry.
- Keep texture memory controlled.
- Use baked AO/lightmaps where appropriate.

If the deliverable must be a single standalone HTML file:

- Embed required shaders, styles, icons, and procedural textures.
- Avoid external CDN dependencies unless explicitly permitted.
- Use a lightweight custom renderer only if it can maintain correct depth, interaction, and performance.

---

# 10. INTERACTION AND STATE

Required behavior:

- Object selection by click/tap and from the layer list.
- Hover feedback on desktop.
- Camera focus animation.
- URL or local-state support for selected system if practical.
- Remember layer visibility during camera changes.
- Reset restores the default camera and visible layers.
- Roof toggle must update both the 3D scene and toolbar state.
- Selected-object information must always match the highlighted geometry.
- Clicking empty space may deselect the current asset.
- Prevent the UI from triggering camera movement when panels are used.

Optional advanced features:

- Distance and area measurement.
- Clipping plane/section box.
- Before/after or installation-stage slider.
- Screenshot export.
- Annotation pins.
- Search by asset ID.
- Asset data export to JSON/CSV.

---

# 11. REQUIRED DATA MODEL

Use a structured asset definition similar to:

```json
{
  "id": "SYS-03-HVLS-01",
  "systemNumber": 3,
  "name": "HVLS Fan 01",
  "category": "Mechanical/HVAC",
  "zone": "TBC",
  "quantity": 1,
  "dimensions": { "diameter_m": 7.5 },
  "status": "Tentative—verify on site",
  "source": "Blok O schematic layout, REV-00/2026",
  "description": "Large-volume low-speed warehouse fan with VFD control.",
  "installationSteps": [],
  "qualityChecks": [],
  "modelObjectIds": ["hvls_01_hub", "hvls_01_blades", "hvls_01_support"],
  "cameraTarget": [0, 8, 0]
}
```

Maintain equivalent structured records for all eight systems. UI content should be generated from data rather than duplicated manually in unrelated components.

---

# 12. VALIDATION CHECKLIST

Before delivery, verify:

## Geometry

- Warehouse footprint reads as 140 × 88 m.
- Zones A–J are legible.
- North and south docks are correctly identified.
- All eight systems exist in the scene.
- Two Ø7.5 m HVLS fans are represented.
- Generator, facilities, consumable cage, conveyor platforms, and AC platform are present.
- Interior and exterior are both complete enough for close inspection.

## Interaction

- Orbit works through 360°.
- Zoom and pan work with mouse and touch.
- Plan, interior, exterior, and POV presets work.
- Roof visibility works.
- Every hotspot selects the correct object.
- The explanation panel updates correctly.
- Layer show/hide/isolate works.
- Reset works.

## UI

- No panel overlaps or clipped text at common resolutions.
- Selected and tentative states are visually distinct.
- Text contrast is accessible.
- Mobile/touch controls are usable.
- Compass and active camera mode remain correct.

## Performance

- No major frame-rate collapse when all layers are visible.
- Repeated objects are instanced where possible.
- Textures are compressed/optimized.
- There are no unnecessary network failures or console errors.

## Accuracy and safety

- Unknown values are labeled TBC.
- Tentative items are clearly marked.
- No invented engineering values are presented as approved facts.
- Disclaimer is visible.

---

# 13. DELIVERABLES

Produce:

1. A complete runnable interactive web application.
2. Source code with a clear project structure.
3. Optimized 3D assets and textures.
4. Asset metadata for systems 01–08.
5. A README with installation, development, build, and deployment instructions.
6. A control guide for orbit, plan, POV, interior, exterior, layers, and selection.
7. A list of assumptions and TBC items.
8. A validation report stating which source requirements are implemented.

Do not stop after creating a mockup. Run the application, correct rendering and interaction errors, and provide a working preview/build.

---

# 13A. REQUIRED 2D MOCKUP REFERENCE

Use the accompanying visual reference file:

- **`WAREHOUSE_3D_MOCKUP_REFERENCE.svg`**

The sheet contains four coordinated design references:

1. **Top/plan POV** — north-up footprint, zones A–J, temporary zones D–G, office block, racks, conveyors, docks, dimensions, and system markers 01–08.
2. **Exterior south-east POV** — warehouse massing, roof, loading docks, truck apron, vehicles, generator house, landscaping, and site circulation.
3. **Interior operational POV** — structural frame, racking, conveyors, HVLS fan, high-bay lights, circulation lanes, and floor organization.
4. **Panel-UI mockup** — header, layer browser, central viewport, selected-asset explanation panel, status warnings, QA/QC data, and navigation toolbar.

Treat the image as a **composition, hierarchy, camera, and interface reference**, not as a replacement for the dimensions and requirements in this prompt. Where the mockup and documented source differ, the documented source controls. Preserve the mockup’s dark industrial visual language, warm-amber accent, restrained technical typography, thin borders, numbered hotspots, and uncluttered central viewport.

## Mandatory camera shots to reproduce

Create named camera presets and validation screenshots for:

- `CAM_PLAN_NORTH` — orthographic top, north up, full 140 × 88 m building visible.
- `CAM_EXTERIOR_SE` — south-east three-quarter exterior.
- `CAM_EXTERIOR_SW` — south-west three-quarter exterior.
- `CAM_EXTERIOR_NE` — north-east dock and apron.
- `CAM_EXTERIOR_NW` — north-west dock and office side.
- `CAM_FRONT_SOUTH` — straight south/outbound elevation.
- `CAM_REAR_NORTH` — straight north dock elevation.
- `CAM_SIDE_EAST` — east elevation with facilities and generator context.
- `CAM_SIDE_WEST` — west elevation with office and AC platform context.
- `CAM_INTERIOR_MAIN` — main operational aisle showing racks, conveyors, and HVLS.
- `CAM_INTERIOR_OFFICE` — meeting/office block and electrical outlet route.
- `CAM_INTERIOR_CONVEYOR` — conveyor platforms, stairs, handrails, and clearances.
- `CAM_INTERIOR_SERVICES` — cable trays, panels, lighting, fire main, and safety assets.
- `CAM_GENSET` — generator house interior/exterior service view.
- `CAM_FACILITIES` — toilets, torent, APAR, and pipework.
- `CAM_CONSUMABLE` — wiremesh cage, gate, Rack A, and Rack B.
- `CAM_AC_PLATFORM` — three outdoor units, platform, access, piping, and vibration mounts.

For every preset, ensure the target system is readable, avoid geometry clipping, maintain realistic eye height where appropriate, and retain clear spatial context. Generate final screenshots of every preset for review.

---

# FINAL EXECUTION INSTRUCTION

Analyze the supplied PDF/drawings and the accompanying SVG mockup first. Extract documented dimensions, system names, workflows, and tentative-location notes. Then create the data structure, block out the site at real scale, model the exterior and interior, add all eight installation systems, apply optimized materials and lighting, implement 360°/POV navigation, and build the explanation-panel UI.

Prioritize in this order:

1. Spatial correctness and real-world scale.
2. All required installation systems.
3. Clear distinction between documented and assumed information.
4. Reliable navigation and selection.
5. Complete explanatory UI.
6. Realistic materials, lighting, and environmental detail.
7. Performance optimization.

The finished experience should communicate the warehouse layout and installation scope clearly enough for project review, stakeholder presentation, and preliminary coordination while explicitly avoiding any claim that the schematic-derived model is construction-ready.