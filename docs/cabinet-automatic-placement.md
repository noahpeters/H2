# Automatic cabinet placement

New cabinets, appliances, Open storage units, openings, and island zones use the deterministic candidate layer in `automaticPlacement.ts`. No inference service or saved-design schema change is involved.

Candidates are validated before scoring. Cabinet footprints must fit the room outline (including recesses), remain below the ceiling, and avoid overlapping element/opening volumes at the same elevation. Island members must fit entirely inside the rotated zone. Footprints use the existing conservative axis-aligned bounds; rotated objects may therefore leave more space than strictly necessary. Existing hosted appliances remain untouched and count as obstacles for new additions.

The scoring tiers prefer continuing the active compatible run, another space on its wall, adjacent walls, other walls, compatible islands, then open floor space. Explicit island selection or a recently moved free-standing cabinet can make that run the active context. Corner cabinets use the existing corner snapping geometry. Valid ties use stable candidate order. Free-space search runs only if attached candidates fail; island-zone creation searches free space first.

The selected object and session-only last-selected IDs for floor and wall cabinetry supply context. Those IDs are cleared when switching designs; they are never written to room records or creation preferences. Subsequent additions resolve the IDs against the current study, so manual moves and Undo immediately affect placement. Each add still uses the existing single undo snapshot. This configurator has Undo but no existing Redo control; this change does not add a separate history system.

When no room position can hold the requested dimensions, creation remains non-blocking: an element is staged six inches beyond the occupied right boundary, with the existing outside-room warning. Openings have no floor placement mode, so an opening that cannot fit any wall is staged beyond a wall end with its existing resize/reposition warning. Neither fallback shrinks the requested object or overlaps existing design geometry. These physically exhausted-room cases require moving/resizing the new object or changing the room.

## Verification for issue #78

- 14 new automated tests cover run continuation, sink adjacency, wall rotation, same/alternative wall search, corners, opening conflicts and sill heights, concave outlines, tall/upper overlap, island placement and containment, free-space/staging fallback, repeatability, and input immutability.
- All 164 tests pass. Lint passes with six existing unrelated warnings; typecheck and production build pass. Vitest exits successfully after its existing shutdown-timeout warning.
- Browser verification used the actual configurator in an isolated Vite preview with simulated local room persistence. The full Hydrogen dev server encountered `EMFILE: too many open files, watch`; production services were not used.
- Four consecutive drawer-cabinet additions extended the starter back-wall cabinet at offset 86, then used the right wall at offsets 0, 30, and 60. Plan and 3D views displayed the resulting run and reported six elements with clear fit, without manual placement.
