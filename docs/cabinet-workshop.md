# Cabinet workshop

The cabinet library at `/admin/custom-cabinets` uses the Studio shell and a physical-part editor. `/cabinet-configurator/custom-unit` opens the same editor without requiring the library service.

## Authoring

- Select boards, dividers, shelves, panels, rods, doors, or drawer fronts in the model or parts list.
- Move a selected part with the translation handles. Snap can be disabled or set to 1/16, 1/8, or 1/2 inch. Position and size inputs accept precise decimal inches.
- X is measured from the cabinet's left side, Y from its bottom, and Z from its front. Positive Z recesses a part; negative Z projects it outward. Changing a shelf/panel setback preserves its rear edge.
- Add back/side panels or left/right rounded end shelves with dedicated controls. Duplicate and position shelves individually to form an end stack.
- Use independent front setbacks to build stepped faces. The reveal control adjusts all fronts; individual door dimensions and positions remain editable; drawer arrays follow their openings.
- Undo/redo retains the last 50 geometry edits. Import/export is under a collapsed section in the inspector.

## Curves

The cabinet supports inward/outward circular arcs, either through the whole cabinet or at the front with a straight back. Front-only profiles also support rounded left, right, or both ends. Arc radius must exceed half the width; other limits prevent collapsed geometry.

The primary controls are now **Shared cabinet profile**: left edge, right edge, and cabinet edge radius. This single outline fits the top and bottom identically, trims sides/dividers to the boundary, and shapes shelf/door/drawer fronts in cabinet coordinates. Shelves retain their exact front setback and rear edge; door and drawer thicknesses stay constant. Selecting a previously shaped panel offers **Use selected part’s edges for the cabinet** to promote its outline. New shelves and fronts inherit automatically.

Individual shaping is collapsed under **Independent part shape (advanced)** and requires explicitly detaching the part. Existing end-shelf attachments remain independent. Shared profiles override legacy local panel outlines without deleting that source data.

Parts can independently have a semicircular/elliptical left or right end. For end shelves, width is the projection and depth is the full span: width = depth / 2 produces a semicircle. Part front edges can independently use convex or concave quarter-circle profiles with a specified radius.

Part sizes and positions describe the uncurved layout. Curves deform that layout into the displayed geometry; these dimensions are not developed cut lengths. The room configurator uses the same closed geometry and its actual bounds, including projecting shelves and fronts.

## Doors

Side-hinged, pocket, tambour, lift-up, and pull-down mechanisms are stored on individual door parts. Pocket travel, pocket/hinge side, and tambour slat size are editable. Opening sliders are transient preview state and are not saved as cabinet dimensions.

Door motion is illustrative, not a hardware-specific clearance or fabrication check. The editor warns when a door is too wide for its pocket. Tambour currently supports a straight rectangular opening; curvature is rejected only when it intersects the tambour opening. A separate curved cabinet end is allowed.

## Persistence and compatibility

Legacy version-1 region trees remain readable and produce the same physical parts. The first part edit stores an explicit `parts` array while retaining the original region tree. Optional curve, edge, shape, and mechanism fields round-trip through the existing library/room snapshot format. Explicit parts take precedence over region-generated geometry.

Library saves require `CABINET_ROOMS_URL` and `CABINET_ROOMS_TOKEN`. The editor reports save errors and switches from creation to version updates after a successful first save. The standalone workshop is unsaved until exported; it does not write to the library.

## Verification

Automated coverage includes legacy round trips, exact part edits, setbacks, curved profiles, projected footprints, mechanism geometry, import propagation, and create-then-update library saves. Browser checks cover exact dimensions, handle dragging, curved cabinets/end shelves, door opening, and mobile layout. Local library persistence uses a simulated service in the save-flow test; a configured service is needed for live verification.

## Opening placement

Click an Add button to enter placement mode, then hover the cabinet. A translucent part follows the cursor and fits the opening beneath it; click to place or press Escape to cancel. Fronts fade during placement so the interior remains visible. Shelves and rods follow the cursor vertically, dividers horizontally, and doors/drawers fit the opening with the cabinet reveal. Openings are derived from the current physical boards, including newly placed shelves and moved dividers. Placement is a single undoable edit; hovering and cancellation do not change the design. The inspector remains available for precise adjustments after placement.

**+ Drawer array** fills an opening with equal fronts. The default is the largest count whose fronts are at least 6 inches high after subtracting reveals; a shorter opening gets one front if it can accommodate the 2-inch minimum. Change Drawer count to divide the space equally again. Individual height inputs run top to bottom. Editing one height balances the remaining space from the bottom upward, retaining other upper heights where possible; every front stays at least 2 inches high. Equalize drawer heights restores equal spacing.

Width, position, and setback are derived from the opening and internal/external face placement. External fronts overlay surrounding carcass edges; internal fronts clear the opening and sit at least 0.5 inches behind covering doors. The array reserves its entire opening, uses one reveal between adjacent fronts, and reflows when the opening, reveal, or instance dimensions change. The overall cabinet envelope is unchanged. Move and Duplicate are disabled for arrays; Remove and undo affect the whole array.

Arrays persist as optional `drawerArray` metadata on a drawer part: opening bounds, face placement, and bottom-to-top front heights. Rendering and takeoff expand that record into individual fronts with unique IDs, while selection and interaction target the array. The existing version-1 definition and version-2 saved-room formats remain supported; no database migration is required. Compatible legacy stacks become arrays when edited. Unequal upper heights are retained where they fit; stacks with incompatible per-front appearance, independent shapes, or undersized fronts remain legacy parts until replaced, avoiding silent loss of their details.

## Preview appearance

Expand Preview style & material above the canvas to view slab, shaker, inset shaker, slatted, or shaker/glass fronts with the room configurator's wood and paint options. These controls are local React state: they never enter the cabinet definition, library save, export, or undo history. Room instances supply their own face/material/paint selections to the same custom-cabinet geometry renderer. Decorative profiles stay within the physical front envelope, follow cabinet curves, and retain part selection and opening previews. Tambour retains its slatted mechanism geometry. Glass applies to doors; drawer fronts use solid shaker panels.

## Interact mode

Select Interact to click doors and drawers open or closed with reversible animation; drag still orbits the cabinet. Motion uses reusable transform rigs. Pocket doors swing through 90 degrees before retracting; hinged, lift-up and pull-down fronts pivot at their corresponding edges. Drawers show a box and extend its full calculated depth. Tambour doors have a saved vertical/horizontal direction and side setting and follow a quarter-turn track and return flat under the top or along the side. Existing tambour definitions default to vertical. Opening amounts are transient preview state, not saved cabinet data. These motion previews remain illustrative rather than hardware collision or fabrication validation.

Individual doors and drawers expose Part face style. Use cabinet style clears the override; a specific choice is stored as the optional `faceStyle` field on the part and wins over workshop and room appearance settings. This permits glass doors and slab interior drawers within an otherwise shaker cabinet. Material still follows the cabinet's appearance. Legacy definitions without an override inherit as before.

Tambour flat-return travel is limited by the cabinet depth. A door longer than the available return remains partly across the opening at maximum travel rather than projecting through the back.

## Design-local configurations

Placed cabinets expose **Customize this cabinet** in the configurator. A modal
sheet reuses `CustomUnitEditor`, initializes its composition from the selected
cabinet, and shows the instance width/height/depth read-only. Imports cannot
change that envelope. Cancel discards the draft; Save configuration validates and
names it, updates the design's reusable configuration record, and applies a copy
to this instance. Other instances retain their snapshots. The inspector offers
compatible configurations and an explicit Apply latest saved version action.

Saved studies remain version 2. Optional `configurations[]` records contain id,
version, name, category and the existing `CustomUnitDefinition`. Applied copies
use the existing `customCabinet` snapshot fields with `scope: 'design'` to
separate local references from global library ids. Missing scope retains global
library semantics. Local references must resolve in the design, match category,
and reference a version no newer than the design record; historical snapshot
versions remain valid. No D1 migration or global-library mutation is required.
The existing room payload size limit remains in force.

Kinds remain base, wall-cabinet and tall. Corner bases and each open-storage
subtype are separate compatibility categories. Appliances cannot use these
configurations. Reuse fits composition to the destination envelope, preserving
board thickness where practical; existing editor validation rejects layouts
that cannot fit. Standard configuration fields stay on the instance and can be
restored by selecting Standard configuration.

Doors, drawer stacks, door/drawer splits, and shelving seed semantic templates.
Specialty corners, sink cutouts, appliance openings and storage fittings use
simplified compositions, disclosed in the sheet; this integration does not
convert every standard geometry definition into an exact custom-unit model.

### Room-owned base toe kicks

Every base cabinet reserves a recessed toe kick below its composition, including
local and global custom cabinets. `room.toeKick` stores height and setback; older
rooms default to the existing 4-inch height and 3-inch recess. The Room panel
controls both values for all bases. Cabinet overall height and placement remain
unchanged, while the editor shows the body envelope above the toe kick.

Toe-kick geometry is supplied by the room renderer, never by a custom-unit
part. Reusing or replacing a configuration therefore cannot remove it. Existing
snapshots, including older full-height definitions, fit into the current room's
body envelope at render time without rewriting their saved definitions. Changing
room toe-kick settings does not revise the reusable configuration. Standard
corner bases retain their two supports; wall cabinets receive no toe kick.
