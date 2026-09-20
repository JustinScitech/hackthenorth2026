# Astra Engineering 7 digital twin

The homepage uses a photo-informed architectural interpretation of the University of Waterloo's Engineering 7 and its E5 atrium/context. The homepage theme is independent of the model's natural architectural materials.

## References and fidelity

The user's reference folder supplied facade photographs, an aerial view, the level-one plan, the site plan, the building section, an atrium photo, and pedestrian-bridge photos. These inform the building proportions and recognizable features: the flat triangular fritted-glass pattern, clear window slots, rooftop plant, sawtooth atrium clerestories, one left-side enclosed bridge, red feature stairs, and colored study areas.

Additional primary sources:

- [Perkins&Will: Engineering 5 and 7](https://perkinswill.com/project/engineering-5-and-7/) — facade treatment, atrium, and teaching/research program.
- [University of Waterloo: E7 opening](https://uwaterloo.ca/news/engineering-alumni/e7-opens-bang-reveal-and-special-delivery) — seven-storey, 242,000-square-foot building and atrium connections.
- [University of Waterloo: E5 entrance](https://bulletin.uwaterloo.ca/2010/oct/19tu.html) — elevated entrance reached by steps and an adjacent ramp; used with the supplied exterior photo. The small model interprets the stairs and landing, not the full accessibility route.
- [MTE: Engineering 7](https://mte85.com/case-studies/university-of-waterloo-engineering-7/) — site and connected-building context.

This is an architectural visualization, not an as-built/BIM model. The site is compressed into a small campus slice; bridge lengths, site grading, structure, furniture, room layouts, lab equipment, and protection-system locations are interpreted. The red stairs, multi-level atrium bridges, study pods, teaching tables, and simple robotics equipment make the interior explorable. The latest courtyard photos govern the site composition: continuous asphalt below the pedestrian bridge, a wide flat cycle canopy terminating at the attached charcoal wing, a clear route through the bike racks, full-height glazing along the attached wing, a mirrored WATERLOO ENGINEERING sign with raised letters and a planted trough, recessed Pearl Sullivan entrance signage and doors, larger horizontal frit patterns, deep facade slots, limestone paving, low curbs and drain grates. There is no railway or extra overhead link across the courtyard. The supplied `e5_exterior_neighbour_context_2010.jpg` informs the connected campus entry: two flights of steps, an intermediate landing, metal handrails, raised vestibule and planted banks. The plan check places this stair on the long outer E5 elevation, not the short end. Its glazing extends along the lower facade, with a tall recessed portal above the entrance. Site grading and stair dimensions remain compressed to fit the campus slice. The red atrium landings have deep sides, pale luminous undersides, metal handrails and glazed galleries. Street trees use tapered branches and small leaf surfaces instead of rounded foliage clusters. Source photographs are not shipped to the browser.

The bridge now passes through a real envelope recess: glazing stops at the opening, the walkway floor meets the interior level, and dark returns, inset framing, structural posts and slim roof flashing carry the transition into the building. Recessed facade slots include matching notches in floor slabs so exposed interior geometry does not close the recess. The right-side entrance has a two-storey deep-set gallery with posts, cross-members and guardrails above its lower curtain wall; its doorway is recessed behind the raised landing. Rear clear-window bands also have physical reveals.

The side-entry bank is a smoothly graded, vertex-coloured terrain mesh, with low grass tufts following the same height function. Its outer ends taper to the pavement and its toe eases into the sidewalk. Solid stair retaining cheeks replace the thin triangular grass strips. A dropped kerb connects the stair approach to the asphalt. These remain modeled interpretations rather than surveyed levels. All additions are batched with existing materials; no per-frame geometry generation or textures are needed.

### Exterior reference audit

| Modeled face | Evidence and corrections |
| --- | --- |
| Arrival courtyard | User's front/courtyard photos: triangular frit, glazed atrium, canopy terminating at the attached wing, full-height courtyard glazing and the mirrored raised-letter sign. |
| E7 bridge-facing elevation | Supplied Doublespace photo and the user's side view: tall recessed glazing slots, ground-floor curtain wall and an enclosed link over the modeled road. |
| Opposite end | Supplied aerial and opposite-side view: patterned panels with stacked horizontal clear window bands instead of an identical blank copy of the arrival face. |
| E5 outer elevation and stairs | `e5_exterior_neighbour_context_2010.jpg`, repeated user image, site plan and level-one plan: broad glass band, deep upper portal, two stair flights, landing, planted banks and visible concrete posts within the two-storey recess. The steps sit on the right-side long elevation, following the user's clarified orientation. |

The model is checked visually from the Site, Street, Bridge, Steps, Rear and Plan cameras. The user's final layout takes precedence over interpreting disconnected reference angles: one enclosed bridge on the left, the stepped entrance on the right, and doors in the rear atrium wall. The second exterior bridge has been removed; no bridge crosses the cycle patio. This is not a surveyed exterior: exact dimensions, bridge lengths, concealed/service faces, roof equipment, accessibility-route grading and interior layouts remain approximate. The old E5 photo informs that elevation; it does not establish its current condition. Source photographs are used for modeling and are not included in the public assets.

All underwriting results, loss records, protection paths, and water scenarios are demonstration data. Public architectural information does not establish roof condition, construction classification, sprinkler coverage, loss history, or actual flood exposure.

## Source and interactions

- `src/app/(site)/home/astra-home.tsx`: 7.6-second demo, evidence views, water scenario, roof/cutaway controls, expanded viewer, and workflow preview.
- `demo-data.ts`: typed E7 property and illustrative underwriting adapter.
- `inspection-data.ts`: camera targets, sources, investigation steps, and uncertainty.
- `property-scene.tsx`: projected accessible markers and static fallback.
- `scene-engine.ts`: Three.js renderer, OrbitControls, camera flights, semantic cutaways, hit targets, performance controls, and disposal.
- `investigation-layers.ts`: geometry aligned with E7 for roof, water, protection, structure, campus links, academic circulation, and sample records.

Drag to orbit, Shift/right-drag to pan, and scroll to zoom. Keyboard arrows pan, +/- zoom, and Home resets. Site, Roof, Street, Bridge, Steps, Rear, Atrium and Plan cameras frame the campus. Street frames the arrival courtyard and cycle shelter. Bridge opens a close view of the recessed walkway junction. Steps opens a close view of the right-side stepped entrance. Rear frames the glass entrance doors opposite the arrival courtyard. Atrium opens the expanded viewer, peels back the envelope and looks upward through the red stairs and gallery bridges; its cutaway stays open while zooming. Switching to an exterior preset restores the envelope. Roof inspection lifts the envelope; Structure, Operations, and Fire expose the occupied volume. Cutaways are reversible. Expanded viewing supports touch orbit and pinch/pan, focus trapping, Escape, and focus restoration; the embedded phone scene preserves page scrolling.

## Assets and regeneration

- `public/models/engineering-7.glb`: approximately 668 KB of Draco-compressed procedural geometry, grouped by semantic part/material.
- `public/models/engineering-7-poster.webp`: approximately 114 KB local fallback, also shown during loading.
- `assets/astra/engineering-7.blend`: editable Blender source.
- `scripts/create-astra-scene.py`: reproducible authoring script.

Run `blender --background --python scripts/create-astra-scene.py`. The exporter enables Draco compression with 16-bit positions to retain small exterior details. The same command renders the WebP loading/fallback image at quality 88 and writes content-hashed URLs to `src/app/(site)/home/scene-assets.json`. Both loading components and the GLB loader import this manifest, so regenerating the model invalidates stale browser caches. No manual poster conversion is required. Blender is Z-up; the GLB and runtime are Y-up.

Semantic groups `roof`, `atriumroof`, `shell`, `atriumshell`, `atriumwall`, `upper`, `frame`, `interior`, `atrium`, `atriumglass`, `entrance`, `annex`, `annexglass`, `sign`, `signback`, `bridge`, `context`, `canopyglass`, `landscape`, `terrain`, `foliage`, and `site` use a double-underscore material suffix. The runtime animates these groups without rebuilding the model. Upper floors are grouped together to limit draw calls. No external textures or model/decoder CDN requests are needed. `public/models/draco` contains the unchanged glTF WebAssembly decoder and wrapper from the installed Three.js distribution with the upstream Apache license. The two decoder files total approximately 251 KB uncompressed, use at most two workers, and release those workers when loading completes. A decoder download failure uses the existing poster/evidence fallback.

Rendering is capped at 60 updates per second with adaptive pixel ratio, cached shadows, and reusable/instanced overlays. Transparent double-sided materials use a single pass. The default overview renders about 92,500 triangles in 96 draw calls; the fire inspection renders about 98,200 triangles in 113 draw calls. The local browser profile measured approximately 16.8 ms between active frames at 1.5 device pixel ratio; performance varies by hardware. The mirrored sign and wing glazing use one local 256-pixel cube capture, filtered once when the model loads; orbiting and animations do not update that reflection. The temporary cube target is released immediately and the filtered reflection is disposed on unmount. Stable overview rendering is demand-driven and offscreen/hidden scenes suspend rendering. Canvas data attributes expose diagnostics for local profiling. Reduced motion applies final camera/assembly positions directly; failed WebGL keeps the poster and evidence accessible.

The existing application links and backend remain unchanged. The demo does not submit cases or contact underwriting services.
