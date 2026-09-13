# Room definitions and plan editing

The Room accordion owns room dimensions/outline, Add opening, opening properties (doors, windows and doorless openings), and island definitions. Add to room now contains only cabinets and appliances.

While Edit room outline is active:

- Drag an opening along its wall or onto another wall. Its center follows the pointer without jumping at pickup, then projects onto the nearest wall long enough to contain its width. Offsets use whole inches and clamp to the wall endpoints. This works with rectangular, recess and alcove walls. Width, height, sill and type are preserved.
- Drag a wall perpendicular to itself as before.
- Drag island zones in both axes; their grouped cabinets/appliances move with them. Cabinet/appliance hit targets are disabled in this mode so they cannot obscure room editing targets or accidentally move independently.
- Each drag uses one Undo entry. Pointer release, cancellation and lost capture end dragging. Changes use the existing room autosave and shared 3D state; no saved-room schema change is needed.

Outside outline editing, openings remain selectable and their room controls open, but they do not drag. Islands retain their existing regular-plan dragging. Selecting an island in the plan opens its Room controls. Entering outline editing from a 3D-only view switches to split view so the plan is available.

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
can still be adjusted under Room → Openings. Supported types are standard swing, sliding glass, pocket,
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
