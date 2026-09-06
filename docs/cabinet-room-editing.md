# Room definitions and plan editing

The Room accordion owns room dimensions/outline, Add opening, opening properties (doors, windows and doorless openings), and island definitions. Add to room now contains only cabinets and appliances.

While Edit room outline is active:

- Drag an opening along its wall or onto another wall. Its center follows the pointer without jumping at pickup, then projects onto the nearest wall long enough to contain its width. Offsets use whole inches and clamp to the wall endpoints. This works with rectangular, recess and alcove walls. Width, height, sill and type are preserved.
- Drag a wall perpendicular to itself as before.
- Drag island zones in both axes; their grouped cabinets/appliances move with them. Cabinet/appliance hit targets are disabled in this mode so they cannot obscure room editing targets or accidentally move independently.
- Each drag uses one Undo entry. Pointer release, cancellation and lost capture end dragging. Changes use the existing room autosave and shared 3D state; no saved-room schema change is needed.

Outside outline editing, openings remain selectable and their room controls open, but they do not drag. Islands retain their existing regular-plan dragging. Selecting an island in the plan opens its Room controls. Entering outline editing from a 3D-only view switches to split view so the plan is available.

If no wall can contain an opening, dragging leaves it unchanged; the existing width/layout warning remains available. Opening collisions are not prevented by this feature.
