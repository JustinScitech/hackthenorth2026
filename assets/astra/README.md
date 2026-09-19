# Astra underwriting digital twin

The homepage lives in `src/app/(site)/home`. Its ivory, ink, and indigo theme is scoped to this page. The architectural model retains natural materials. The experience makes no external model, texture, font, or underwriting-service requests.

- `astra-home.tsx`: 7.6-second submission/assessment sequence, seven inspection lenses, scenario controls, evidence excerpts, expanded viewer, and workflow preview.
- `demo-data.ts`: illustrative property, risk signals, and carrier assessment.
- `inspection-data.ts`: camera presets, structured investigation steps, source excerpts, and next actions. Replace these typed adapters with agent output; keep observations, sources, and uncertainty explicit.
- `property-scene.tsx`: accessible HTML evidence markers and the rendered fallback.
- `scene-engine.ts`: Three.js renderer, OrbitControls, camera flights, semantic model animation, raycasting, and cleanup.
- `investigation-layers.ts`: small reusable/instanced meshes for roof inspection, water scenarios, fire-protection paths, framing, neighboring exposures, operations, and loss history.
- `home.module.css`: responsive UI and motion preferences.

## Interactions

Drag to orbit through 360 degrees, Shift-drag or right-drag to pan, and scroll to zoom. Focus the canvas to use arrow keys for pan, +/− for zoom, and Home to reset. Site, Roof, Street, and Plan buttons fly to camera presets. Expanded viewing supports touch orbit and pinch/pan; the embedded phone canvas preserves vertical page scrolling.

Each risk lens opens evidence and frames the relevant property feature. Roof inspection separates the cladding, membrane, and insulation representation. Structural and operations inspections expose the frame and interior. Fire inspection traces the hydrant/sprinkler path. The flood slider changes the illustrative water surface and contextual next action; it is not a flood prediction or a live hazard calculation. All assembly changes can be reversed.

The expanded viewer traps keyboard focus, restores focus and scrolling when closed, and supports Escape. Reduced motion applies final geometry and camera positions immediately. When WebGL initialization, loading, or context fails, the poster and source evidence remain available; unsupported camera/assembly controls are disabled.

## Assets and rendering

Production assets: `public/models/northline.glb` (about 1.9 MB) and `northline-poster.webp` (about 68 KB). Editable source: `assets/astra/northline.blend`.

Regenerate with `blender --background --python scripts/create-astra-scene.py`, then convert the generated PNG to WebP using Pillow at quality 86. Blender uses Z-up; the UI and exported glTF use Y-up.

The authoring script merges by semantic part and material. Preserve the `roof__`, `shell__`, `frame__`, `interior__`, and `site__` name prefixes: the runtime uses them to animate the assembly without rebuilding geometry. No external textures or decoders are needed.

Rendering is capped at 60 updates per second, uses cached shadows and shared/instanced investigation geometry, lowers pixel ratio after sustained slow frames, and suspends offscreen or when the tab is hidden. A settled site renders on demand. The baseline scene is roughly 41,000 triangles / 43 draw calls; inspection overlays add a small number of draws. Canvas data attributes expose render diagnostics for local profiling, not product UI.

## Application integration

The primary actions link to the existing `/overview` and `/cases/new` workflows. The homepage never submits cases, contacts underwriting services, or embeds credentials. The demo recommendation remains subject to roof inspection, flood review, and human authority.
