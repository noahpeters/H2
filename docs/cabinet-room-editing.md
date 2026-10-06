# Room definitions and plan editing

The Room accordion owns room dimensions/outline, Add opening, opening properties (doors, windows and doorless openings), and island definitions. Add to room now contains only cabinets and appliances.

**Default wall thickness** defaults to 4.5 inches and is adjustable from 1 to 24 inches in Room controls (quarter-inch input steps). Enter **Edit room outline**, select a wall in the plan or the **Wall to edit** menu, then change **Selected wall thickness** to override it independently. **Use room default for this wall** removes the override. Changing the default affects only walls without overrides. Room width/depth and perimeter outline coordinates measure to finished interior faces; perimeter walls grow outward, with solid mitered corners. Interior partition coordinates remain centerlines and their solid walls extend half the thickness on each side. Cabinet backs snap to finished faces, including either side of an interior partition. Increasing thickness preserves perimeter room dimensions and wall-mounted cabinet offsets; partition-mounted cabinets follow their wall face. Floor-placed objects remain in place and receive collision warnings if a thicker partition reaches them. Automatic placement also checks partition volume.

Plan and 3D use the same wall footprints. Doors, windows and doorless openings cut through the entire thickness, with full-depth jambs/reveals and leaves/glazing centered within the wall. Photo light sources remain outside the full wall depth, and photo corner fillets meet the finished interior faces. Optional `room.wallThickness` and `room.wallThicknesses` (overrides keyed by stable perimeter/partition IDs) save with version-2 rooms, including copy/share and undo; rooms without it use 4.5 inches. Validation rejects non-finite, non-numeric and out-of-range thicknesses or overrides for unknown walls. Removing a wall drops its override; Undo retains the prior snapshot. Mixed-thickness corner miters use each adjacent wall’s own thickness.

While Edit room outline is active:

- Drag an opening along its wall or onto another wall. Its center follows the pointer without jumping at pickup, then projects onto the nearest wall long enough to contain its width. Offsets use whole inches and clamp to the wall endpoints. This works with rectangular, recess and alcove walls. Width, height, sill and type are preserved.
- Drag a wall perpendicular to itself as before.
- Drag island zones in both axes; their grouped cabinets/appliances move with them. Cabinet/appliance hit targets are disabled in this mode so they cannot obscure room editing targets or accidentally move independently.
- Each drag uses one Undo entry. Pointer release, cancellation and lost capture end dragging. Changes use the existing room autosave and shared 3D state; no saved-room schema change is needed.

Outside outline editing, perimeter walls, interior walls and all openings are locked: they cannot be selected or dragged, and wall end handles are hidden. Opening selection in split-view 3D is also locked. Leaving edit mode clears opening selection and ends active wall/opening gestures. Islands retain their existing regular-plan dragging. Selecting an island in the plan opens its Room controls. Entering outline editing from a 3D-only view switches to split view so the plan is available.

Island boundaries and countertops follow the island's defined width, depth, seating overhang and finished-edge allowances. Moving a grouped cabinet, including partly outside its island, never enlarges these extents or changes aisle measurements. Membership still persists until the cabinet is fully outside. Face-frame allowance follows cabinet orientation rather than cabinet position.

If no wall can contain an opening, dragging leaves it unchanged; the existing width/layout warning remains available. Opening collisions are not prevented by this feature.

### Interior walls and door styles

Use **+ Add wall** above the plan. Move the cursor into the room: a dashed
preview runs perpendicular to the nearest wall and extends to the first wall
on each side, dividing that part of the room. Click to place; Escape or
**Cancel wall** cancels without creating a wall. Existing interior walls also
bound the preview, so smaller closets and pantries can be divided independently.

Select a perimeter wall on the plan to anchor **+ Add recess** or **+ Add alcove**
to it. These actions appear alongside **+ Add wall** in the plan banner, with
helper text below the buttons.

Select an interior wall directly on the plan. Drag its line perpendicular to
itself to move it. Drag either square end handle along the wall to shorten or
extend that end. Ends snap to nearby walls; pulling them away creates a detached
or entirely free-standing wall. The handles also support arrow keys. Wall
lengths appear on the plan; no wall names or coordinate-entry form are needed.

Use **+ Add opening** in the plan banner to add a door, window or doorless
opening. All five door styles are available in that menu; existing openings
are edited by clicking them on the plan and using Selected Object. Supported types are standard swing, sliding glass, pocket,
sliding closet and double swing (French doors). Existing doors default to
standard swing. Hinge / pocket side controls the plan symbol. Pocket doors warn
when their selected side lacks an uninterrupted wall section as wide as the door.
Door panels are shown closed in 3D; the plan distinguishes their operation.

Removing an interior wall removes its openings and preserves attached furniture
at its floor position. Undo restores a wall gesture or removal. Shortening a wall
keeps doors at their existing room position and warns if an opening no longer
fits. These are planning dimensions, not construction framing or hardware
clearances.

Optional partition and door fields preserve saved-room version 2, including
older named-wall records. Release the frontend and room-service validator together.

Openings and islands have no sidebar object lists. Select either directly on the
plan to show its dimensions and settings in Selected Object. Create island
zones with **+ Island zone** under Add to room.

## Room front overlay

Room → Front overlay applies to every exterior cabinet door and drawer, including custom configurations and their workshop preview. New rooms and rooms without an overlay setting use `full-overlay`; `partial-overlay` exposes more of the supporting frame, and `inset` places fronts inside the opening, flush with the carcass front. Internal drawers and tambour mechanisms retain their operating clearances.

Front style is independent: shaker, beaded Shaker, beaded flat, slab, slatted, and eligible glass fronts can use any room overlay. Legacy `inset-shaker` values become `shaker` when loading rooms, reusable configurations, imported definitions, or creation preferences. The old per-front face frame is intentionally discarded. Existing version-2 rooms remain readable; new saves persist `room.overlay`. Unknown explicit overlay settings fail saved-room validation.

Custom composition dimensions remain canonical. The renderer derives exterior front bounds from their openings and supporting boards: full coverage, half coverage, or no coverage, followed by the definition's reveal. Door and drawer edges share this calculation. Room changes do not rewrite library templates, drawer proportions, or the cabinet envelope.

Island overhang extends only toward the selected seating side (none means no seating overhang). The same visible outline defines the countertop, plan boundary, snapping, and automatic placement. A released cabinet/appliance joins an island only when its full nominal footprint is within that outline. Existing members remain grouped while any part of their footprint still touches or overlaps the island, even if their center leaves the outline; they detach when completely outside. Existing membership takes priority over an overlapping second island. Island movement carries retained members. Dragging a member across a nearby wall does not attach it to that wall while it still overlaps its island.

### Design materials

The left sidebar's Materials section holds named finishes shared by the design.
Add as many finishes as needed (up to 200), choose any current wood or paint
option, and assign objects using the Selected object's Design material menu.
Changing a material updates every assigned cabinet, open-storage object, and
panel-ready appliance. New objects inherit the selected object's design material
when available; otherwise an existing matching finish or the first material is
used. Existing rooms migrate matching per-object finishes into shared entries;
different paint colors and material-definition snapshots remain distinct.

Flat surface grain can follow the existing part defaults or run horizontally /
across width or vertically / along height (depth for horizontal shelves). Direction
is local to each surface and follows the object when it rotates. Shaker rails and
stiles always run lengthwise, including customized fronts. The setting records
intent for every finish; visible grain requires a textured preview material.

Removing a material requires choosing a remaining material and confirming
reassignment. The last material cannot be removed. Material edits, assignments,
and removal participate in Undo, online saving, local recovery, copied rooms,
and sharing. Saved material ids are design-local; stale creation preferences do
not add finishes from another design.

### Island countertop edge allowance

Room settings include **Island countertop edge overhang (in)**, defaulting to
1/8 inch. This allowance is measured beyond the cabinet body or the projecting
3/4-inch face frame for inset and partial-overlay rooms. It applies to every
island, including islands with no seating and zero seating overhang. Each
island's seating side keeps its separately configured overhang. Plan and 3D
views, including aisle labels, use the same finished countertop outline.
Cabinet placement and island membership continue to use the island body and
seating area. Wall countertop geometry is unchanged. Saved rooms without this
setting use the default; explicit zero creates a flush edge at the body/frame.

## Saved 3D camera positions

The 3D view (including Split) has a Camera position dropdown, Add position and Delete position. Add captures the current view with a name. Selecting a saved position restores its world-space position, orbit target, zoom and field of view; the current viewport aspect remains appropriate to the screen. Orbiting, panning, zooming or fitting returns the dropdown to Current view without overwriting saved positions. Delete removes only the selected entry and leaves the current camera in place. Add/delete use normal model undo and autosave.

Optional `cameraPositions` entries travel with version-2 models through local/online save, load, copy and sharing. Old models need no migration changes and start with no saved positions. The list is limited to 50 entries; IDs are unique and names, finite coordinates, nonzero camera-to-target distance, field of view and zoom are validated. Loading a model makes its views available for explicit selection; it does not force a saved view onto the initial room framing. Camera selection does not edit room geometry or photo settings.

### Shaker face profiles

Standard Shaker and Beaded Shaker center panels sit exactly 5/16 inch behind the front face. Beaded Shaker adds a rounded 1/4-inch-wide bead at the panel opening, matching the supplied reference; the crown stays on the face plane. Existing frame sizing is retained. These are physical inch dimensions shared by standard doors/drawers, custom fronts, shaped and arched fronts, photo capture, and fabrication export. Beaded Shaker is available in the cabinet front selector and per-part door/drawer selector, and survives saved rooms and creation preferences. Stock must be thicker than the panel setback.

Fabrication exports retain assembled rails, stiles, panels and aligned grooves for standard Shaker. Beaded Shaker exports profiled solid stock with explicit mesh surfaces; curved and arched geometry follows the same design functions as preview. The mesh represents the finished profile, not machining toolpaths. Photo easing retains the bead geometry instead of rebuilding it as rectangular stock. Panel-ready appliance Shaker fronts also use the 5/16-inch setback.

Beaded Flat uses the same 1/4-inch rounded perimeter bead with a flush center rather than a recessed Shaker panel. The bead occupies the outermost 1/4 inch of the face, with no outer land. Its crown is flush with the center panel, so it does not project beyond the face plane. It preserves a continuous flat-face grain direction and exports the explicit finished profile. Doors and drawers can select it globally or per part; its selling-price addition is $5 per face.

Combination fronts offer **Top: Flat / Lower: Shaker**, **Top: Beaded Flat / Lower: Beaded Shaker**, and **Top: Flat / Lower: Beaded Shaker**. The highest physical row uses the top profile; paired faces with matching upper edges both belong to that row. A single row uses the top profile. Custom part overrides take precedence, expanded drawer arrays resolve each face, and concealed internal fronts/tambour mechanisms do not determine the exterior top row. Sink false fronts count as faces; farmhouse sink aprons remain sink placeholders. Resolution happens before overlay fitting for standard cabinets and before profile generation for custom cabinets, exports and handles. The original 1/4-inch bead and 5/16-inch Shaker panel setback are unchanged.

### Automatic finish panels with maple internals

When **Use maple internals** is enabled, exposed cabinet left/right sides and backs receive attached 3/4-inch finish panels in the cabinet's exterior material. Contact with cabinets, appliances, existing room panels, perimeter walls or partition faces suppresses the covered area; partial-height/depth contact leaves panels only on exposed rectangular patches. A 0.02-inch contact tolerance absorbs numerical/installation clearance. Floating shelves have no cabinet side/back stock and receive no panels. Corner returns use their physical arm depth.

Panels are derived from the current layout, so moving/resizing a cabinet or changing its neighbors updates them in plan, split, 3D, photos, and elevations. They are grey on plan. Selecting one shows **Size and position are not editable**, with a button to select its controlling cabinet. They cannot be independently dragged, resized, duplicated or deleted. **Disable automatic finish panels** on a cabinet suppresses its panels and persists with the saved room. Only that preference is saved; derived panels never become room objects.

Base countertops extend by the attached top-reaching panel thickness before applying their existing overhang, and clear finish panels on adjacent taller units. Island tops reserve the same finish-stock allowance at the fixed island boundary, without following member translation. Elevation widths include the attached stock. Fabrication exports place finish-panel parts inside the controlling cabinet assembly; their thickness, span, height, elevation and material match the scene.
