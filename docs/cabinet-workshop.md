# Cabinet workshop

The cabinet library at `/admin/custom-cabinets` uses the Studio shell and a physical-part editor. `/cabinet-configurator/custom-unit` opens the same editor without requiring the library service.

## Authoring

- Select boards, dividers, shelves, panels, rods, doors, or drawer fronts in the model or parts list.
- Move a selected part with the translation handles. Snap can be disabled or set to 1/16, 1/8, or 1/2 inch. Position and size inputs accept precise decimal inches.
- X is measured from the cabinet's left side, Y from its bottom, and Z from its front. Positive Z recesses a part; negative Z projects it outward. Changing a shelf/panel setback preserves its rear edge.
- Add back/side panels or left/right rounded end shelves with dedicated controls. Duplicate and position shelves individually to form an end stack.
- Use independent front setbacks to build stepped faces. The reveal control adjusts all fronts; individual front dimensions and positions remain editable.
- Undo/redo retains the last 50 geometry edits. Import/export is under a collapsed section in the inspector.

## Curves

The cabinet supports inward/outward circular arcs, either through the whole cabinet or at the front with a straight back. Front-only profiles also support rounded left, right, or both ends. Arc radius must exceed half the width; other limits prevent collapsed geometry.

The primary controls are now **Shared cabinet profile**: left edge, right edge, and cabinet edge radius. This single outline fits the top and bottom identically, trims sides/dividers to the boundary, and shapes shelf/door/drawer fronts in cabinet coordinates. Shelves retain their exact front setback and rear edge; door and drawer thicknesses stay constant. Selecting a previously shaped panel offers **Use selected part’s edges for the cabinet** to promote its outline. New shelves and fronts inherit automatically.

Individual shaping is collapsed under **Independent part shape (advanced)** and requires explicitly detaching the part. Existing end-shelf attachments remain independent. Shared profiles override legacy local panel outlines without deleting that source data.

Parts can independently have a semicircular/elliptical left or right end. For end shelves, width is the projection and depth is the full span: width = depth / 2 produces a semicircle. Part front edges can independently use convex or concave quarter-circle profiles with a specified radius.

Part sizes and positions describe the uncurved layout. Curves deform that layout into the displayed geometry; these dimensions are not developed cut lengths. The room configurator uses the same closed geometry and its actual bounds, including projecting shelves and fronts.

## Doors

Side-hinged, pocket, tambour, lift-up, and pull-down mechanisms are stored on individual door parts. Pocket travel, pocket/hinge side, and tambour slat size are editable. Opening sliders are transient preview state and are not saved as cabinet dimensions.

Door motion is illustrative, not a hardware-specific clearance or fabrication check. The editor warns when a door is too wide for its pocket. Tambour currently supports a straight rectangular opening; combining it with cabinet or part curvature is rejected rather than silently drawing a different design.

## Persistence and compatibility

Legacy version-1 region trees remain readable and produce the same physical parts. The first part edit stores an explicit `parts` array while retaining the original region tree. Optional curve, edge, shape, and mechanism fields round-trip through the existing library/room snapshot format. Explicit parts take precedence over region-generated geometry.

Library saves require `CABINET_ROOMS_URL` and `CABINET_ROOMS_TOKEN`. The editor reports save errors and switches from creation to version updates after a successful first save. The standalone workshop is unsaved until exported; it does not write to the library.

## Verification

Automated coverage includes legacy round trips, exact part edits, setbacks, curved profiles, projected footprints, mechanism geometry, import propagation, and create-then-update library saves. Browser checks cover exact dimensions, handle dragging, curved cabinets/end shelves, door opening, and mobile layout. Local library persistence uses a simulated service in the save-flow test; a configured service is needed for live verification.

## Opening placement

Click an Add button to enter placement mode, then hover the cabinet. A translucent part follows the cursor and fits the opening beneath it; click to place or press Escape to cancel. Fronts fade during placement so the interior remains visible. Shelves and rods follow the cursor vertically, dividers horizontally, and doors/drawers fit the opening with the cabinet reveal. Openings are derived from the current physical boards, including newly placed shelves and moved dividers. Placement is a single undoable edit; hovering and cancellation do not change the design. The inspector remains available for precise adjustments after placement.

New drawer fronts follow the cursor within the available front area and are capped at 8 inches high, shrinking to fit smaller remaining spaces. Door fronts fill the available area. Existing doors and drawers are excluded from both placement targets regardless of setback or preview opening state, with the default reveal retained between fronts. Shelves and other interior parts still target the physical opening behind fronts.
