# Room surfaces and Take Photo

Room controls select three wall treatments (warm plaster, white plaster, sage painted plaster), three floor treatments (light wood planks, dark stained planks, smooth concrete), and three countertop treatments (white quartz, Taj Mahal, dark granite). Existing `room.walls` and `room.floor` IDs are retained, including legacy oak/walnut IDs; the plank scan does not identify its wood species. Optional `room.countertopMaterial` persists through existing room JSON save/load, undo/redo and sharing; older rooms default to white quartz. Server validation rejects unknown countertop IDs without changing the room protocol version.

`roomMaterials.ts` uses the existing `MaterialDefinition`, `createMaterial`, immutable texture cache, load/fallback handling and metre-based UV projection. Geometry factories still produce the same stock, openings, overhangs and sink cutouts. `StudyScene` assigns room PBR materials to floors, walls, cabinet countertops, dishwasher countertops and island tops. Cache signatures include countertop selection. Walls retain their existing transparency and floors retain double-sided rendering. Material transitions wait for texture loading and preserve the previous scene until replacement is ready.

| Surface | Reusable assets / preview specification |
| --- | --- |
| Walls | Poly Haven White Plaster 02 microstructure; 1m tile; uniform warm/white/sage paint albedo, reduced normal/AO strengths |
| Wood floors | Poly Haven Wood Floor; 1.7m tile; neutral/light and dark stained variants |
| Concrete floor | Poly Haven Smooth Concrete Floor; 2m tile |
| White quartz | Uniform polished engineered-quartz preview; base color `#f6f4ef`, roughness 0.18, IOR 1.54; no invented scan |
| Taj Mahal | Representative Poly Haven Marble 01, 1.5m tile, cream tint and polished roughness multiplier; **not a verified Taj Mahal quartzite scan** |
| Dark granite | ambientCG Granite001B, procedural seamless granite; dark tint and polished roughness multiplier; 1m preview tile assumption because provider reports no measured footprint |

The Taj Mahal control includes a visible representative-preview note. An exact slab scan can replace this explicit definition without changing the rendering architecture. Finish/IOR/tint values are visual preview assumptions, not laboratory measurements. CC0 1K source maps are bundled under `public/textures/room`, with provenance, source download URLs, authors where supplied, source footprint information and SHA-256 hashes. Poly Haven sets include albedo, OpenGL normal, roughness and AO; granite includes albedo, OpenGL normal and roughness. Source maps are unmodified. No displacement or AI-generated textures are used.

## Photo lifecycle

The interactive Three.js renderer remains mounted and demand-rendered with its existing camera, controls, geometry and renderer configuration. `Take Photo` synchronously captures a private scene/camera copy, including current door/drawer poses, transforms, visibility, FOV, aspect, zoom, material definitions and grain mapping. Capture waits until the live scene has finished its current material transition. Geometry and materials belong to the copy; texture resources are retained through the existing reference-counted cache. Later design edits and camera navigation cannot modify captured pixels.

`photoRender.ts` is a separate on-demand Three.js render pipeline and GPU lifetime. It eases rectangular cabinet stock by 1mm and countertops by 2mm. Box envelopes stay exact; extrusions inset their end caps and retain their central outline, thickness and holes. Shaker/slatted custom front pieces retain independent grain axes and glass material groups. Profile-deformed stock is kept intact rather than replaced by rectangular approximations. Unsupported geometry shapes retain their exact current mesh; they can acquire additional photo treatments later. All enhancement geometry is created in the photo copy and never enters saved designs, placement, dimensions, snapping, takeoffs or fabrication.

Room corner treatment adds 25mm curved plaster fillets at convex perimeter wall intersections in the photo copy. It retains translucent-wall visibility, leaves concave recess corners intact and omits intersections adjacent to opening voids. Wall panel subdivisions are not rounded separately, avoiding seams around window/door decomposition. Free-standing partitions without a joined perimeter intersection retain their existing geometry.

The photo pass renders an antialiased PNG at up to 2400px on its longest side, with the captured camera aspect and existing lighting/shadow configuration. Its canvas temporarily overlays the live canvas **in the same viewport**. After capture, a 220ms white shutter flash plays, photo GPU resources are disposed, and the live canvas is exposed again. Reduced-motion preferences suppress the flash animation. The PNG then opens in a native modal dialog with an image preview, Download PNG link and Close/Escape handling. Blob URLs live until the dialog closes and are revoked on close/unmount. Capture errors restore the live view and show retry feedback; repeated clicks are blocked during a capture.

This first photo pass adds stock easing, room corner fillets and increased image resolution. It does not claim global illumination or change lighting intent. Future photographic lighting or postprocessing belongs in this isolated pipeline.

## Validation

Tests cover material definition validity, asset integrity, saved-room compatibility and rejection, room/countertop transitions with identical positions and cutouts, cached texture lifetime during repeated drags, camera/pose/visibility fidelity, independent snapshot materials, stock bounds, countertop holes, custom front groups/grain, photo-only wall fillets and transparency, same-viewport render/flash/cleanup, and PNG preview/download/Escape URL lifetime. Run the repository's `npm run verify` and pre-push hook before publishing a PR.
