# Editable room outlines (first version)

Open **Room → Edit room outline**. Start with Rectangle, L-shape, or Alcove. Select a wall in the plan or wall selector, drag it perpendicular to itself, or enter its position in inches. **Add inward recess** cuts into the floor; **Add alcove** extends the floor outward. Use Undo to restore the previous layout. Overall width/depth resize the outline; wall edits preserve right angles and snap to whole inches.

Room boundaries are clockwise orthogonal polygons with stable outgoing wall IDs. Old version-2 rectangular rooms remain valid without an outline. An edited room gains an optional `room.outline`; its width/depth track the bounding envelope. Existing back/front/left/right IDs are retained where possible. New segments use `segment-*` IDs. Openings and wall-mounted objects reference these IDs; floor and wall rendering, snapping and room-fit validation derive from the same geometry. Missing wall references after changing presets or removing a recess release cabinets to their previous floor position and move openings to the nearest surviving wall. Review the room after changing its shape; oversized objects/openings are warned about rather than deleted or silently resized.

Boundaries are limited to 40 segments, minimum 6-inch wall lengths, no diagonals, crossings, touching non-adjacent segments or reversed winding. Overall dimensions are 12–10,000 inches. Plan hit targets expose keyboard selection; the wall-position field supports precise keyboard editing. Select the middle wall or either return of a rectangular recess/alcove, then choose **Remove recess / alcove** to straighten the wall run. Removal requires aligned shoulders and a valid resulting polygon; the button is disabled for ineligible walls. Undo restores the original outline and all attachments. Interior partitions, freehand drawing, arbitrary angled walls, bathroom fixtures and arbitrary segment deletion are not included. Use the Rectangle preset to replace the entire outline when desired.

## Deployment

The shared API validator must deploy with the storefront through the normal main-merge GitHub Actions workflows. No database migration is required: outlines persist inside existing room JSON. Verify API and storefront deployments before advertising the feature; an older API will reject custom segment references. Shared-design snapshots use the same saved format. No production deployment is performed locally.

## Verification

Automated coverage includes legacy rectangle positions, all presets, invalid outlines, whole-inch movement, concave-cutout containment, inward snapping, opening transforms, floor triangulation area and D1 round-trip storage. The local preview uses isolated mock storage and sends no emails or production writes.
