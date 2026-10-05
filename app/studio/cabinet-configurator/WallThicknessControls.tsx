import {positioningResolution} from './positioningPrecision';
import type {Room, Wall} from './model';
import {roomSegments} from './roomOutline';
import {
  wallThickness,
  MIN_WALL_THICKNESS,
  MAX_WALL_THICKNESS,
} from './wallDimensions';

export function WallThicknessControls({
  room,
  selectedWall,
  onSelect,
  onChange,
}: {
  room: Room;
  selectedWall: Wall;
  onSelect: (wall: Wall) => void;
  onChange: (wall: Wall, thickness: number | undefined) => void;
}) {
  const walls = roomSegments(room);
  const selected = walls.find((s) => s.id === selectedWall) ?? walls[0];
  const inherited = room.wallThicknesses?.[selected.id] === undefined;
  return (
    <>
      <label>
        Wall to edit
        <select
          value={selected.id}
          onChange={(event) => onSelect(event.currentTarget.value as Wall)}
        >
          {walls.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Selected wall thickness
        <span>
          <input
            type="number"
            min={MIN_WALL_THICKNESS}
            max={MAX_WALL_THICKNESS}
            step={positioningResolution(room)}
            value={wallThickness(room, selected.id)}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (
                Number.isFinite(value) &&
                value >= MIN_WALL_THICKNESS &&
                value <= MAX_WALL_THICKNESS
              )
                onChange(selected.id, value);
            }}
          />{' '}
          in
        </span>
      </label>
      <p className="cc-muted">
        {inherited
          ? 'This wall uses the room default.'
          : 'This wall has its own thickness.'}
      </p>
      <button
        type="button"
        disabled={inherited}
        onClick={() => onChange(selected.id, undefined)}
      >
        Use room default for this wall
      </button>
    </>
  );
}
