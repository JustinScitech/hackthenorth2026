# Astra Engineering 7 digital twin

The homepage uses a photo-informed architectural interpretation of the University of Waterloo's Engineering 7 and its E5 atrium/context. The ivory, ink, and indigo interface is scoped to the homepage; natural architectural materials remain independent of the UI palette.

## References and fidelity

The user's reference folder supplied facade photographs, an aerial view, the level-one plan, the site plan, the building section, an atrium photo, and pedestrian-bridge photos. These inform the building proportions and recognizable features: the flat triangular fritted-glass pattern, clear window slots, rooftop plant, sawtooth atrium clerestories, enclosed bridges, red feature stairs, and colored study areas.

Additional primary sources:

- [Perkins&Will: Engineering 5 and 7](https://perkinswill.com/project/engineering-5-and-7/) — facade treatment, atrium, and teaching/research program.
- [University of Waterloo: E7 opening](https://uwaterloo.ca/news/engineering-alumni/e7-opens-bang-reveal-and-special-delivery) — seven-storey, 242,000-square-foot building and atrium connections.
- [MTE: Engineering 7](https://mte85.com/case-studies/university-of-waterloo-engineering-7/) — site and connected-building context.

This is an architectural visualization, not an as-built/BIM model. The site is compressed into a small campus slice; bridge lengths, rail/road spacing, structure, furniture, room layouts, lab equipment, and protection-system locations are interpreted. The red stairs, multi-level atrium bridges, study pods, teaching tables, and simple robotics equipment make the interior explorable. The courtyard reference also informs the long glazed cycle shelter, parked bicycles, charcoal-clad service block, limestone paving joints, curved curbs, seat walls, tactile pads, drain grates, and planting beds. Street trees use tapered branches and small leaf surfaces instead of rounded foliage clusters. Source photographs are not shipped to the browser.

All underwriting results, loss records, protection paths, and water scenarios are demonstration data. Public architectural information does not establish roof condition, construction classification, sprinkler coverage, loss history, or actual flood exposure.

## Source and interactions

- `src/app/(site)/home/astra-home.tsx`: 7.6-second demo, evidence views, water scenario, roof/cutaway controls, expanded viewer, and workflow preview.
- `demo-data.ts`: typed E7 property and illustrative underwriting adapter.
- `inspection-data.ts`: camera targets, sources, investigation steps, and uncertainty.
- `property-scene.tsx`: projected accessible markers and static fallback.
- `scene-engine.ts`: Three.js renderer, OrbitControls, camera flights, semantic cutaways, hit targets, performance controls, and disposal.
- `investigation-layers.ts`: geometry aligned with E7 for roof, water, protection, structure, campus links, academic circulation, and sample records.

Drag to orbit, Shift/right-drag to pan, and scroll to zoom. Keyboard arrows pan, +/- zoom, and Home resets. Site, Roof, Street, and Plan cameras frame the campus. Street frames the arrival courtyard and cycle shelter. Atrium opens the expanded viewer and moves closer to the interior. Roof inspection lifts the envelope; Structure, Operations, and Fire expose the occupied volume. Cutaways are reversible. Expanded viewing supports touch orbit and pinch/pan, focus trapping, Escape, and focus restoration; the embedded phone scene preserves page scrolling.

## Assets and regeneration

- `public/models/engineering-7.glb`: approximately 495 KB of Draco-compressed procedural geometry, grouped by semantic part/material.
- `public/models/engineering-7-poster.webp`: approximately 125 KB local fallback, also shown during loading.
- `assets/astra/engineering-7.blend`: editable Blender source.
- `scripts/create-astra-scene.py`: reproducible authoring script.

Run `blender --background --python scripts/create-astra-scene.py`. The exporter enables Draco compression with 16-bit positions to retain small exterior details. Convert the generated poster PNG to WebP at quality 88 using Pillow, then remove the intermediate PNG. Blender is Z-up; the GLB and runtime are Y-up.

Semantic groups `roof`, `atriumroof`, `shell`, `atriumshell`, `atriumwall`, `upper`, `frame`, `interior`, `atrium`, `bridge`, `context`, `canopyglass`, `landscape`, `foliage`, and `site` use a double-underscore material suffix. The runtime animates these groups without rebuilding the model. Upper floors are grouped together to limit draw calls. No external textures or model/decoder CDN requests are needed. `public/models/draco` contains the unchanged glTF WebAssembly decoder and wrapper from the installed Three.js distribution with the upstream Apache license. The two decoder files total approximately 251 KB uncompressed, use at most two workers, and release those workers when loading completes. A decoder download failure uses the existing poster/evidence fallback.

Rendering is capped at 60 updates per second with adaptive pixel ratio, cached shadows, and reusable/instanced overlays. Transparent double-sided materials use a single pass. The default overview renders about 75,000 triangles in 74 draw calls; the measured fire inspection uses about 81,000 triangles in 91 draw calls. Stable overview rendering is demand-driven and offscreen/hidden scenes suspend rendering. Canvas data attributes expose diagnostics for local profiling. Reduced motion applies final camera/assembly positions directly; failed WebGL keeps the poster and evidence accessible.

The existing application links and backend remain unchanged. The demo does not submit cases or contact underwriting services.
