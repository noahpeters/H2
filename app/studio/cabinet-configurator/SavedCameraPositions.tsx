import {useId, useState} from 'react';
import {
  CAMERA_POSITION_LIMIT,
  type CameraPose,
  type SavedCameraPosition,
} from './cameraPositions';

export function CameraPositions({
  positions,
  selected,
  disabled,
  onSelect,
  onChange,
  capture,
}: {
  positions: SavedCameraPosition[];
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onChange: (positions: SavedCameraPosition[]) => void;
  capture: () => CameraPose | undefined;
}) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const selection = positions.some((p) => p.id === selected) ? selected : '';
  return (
    <div
      className="cc-camera-positions"
      role="group"
      aria-label="Camera positions"
    >
      <div className="cc-camera-position-row">
        <label htmlFor={id}>Camera position</label>
        <select
          id={id}
          value={selection}
          disabled={disabled}
          onChange={(event) => onSelect(event.target.value)}
        >
          <option value="">Current view</option>
          {positions.map((position) => (
            <option key={position.id} value={position.id}>
              {position.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={
            disabled || adding || positions.length >= CAMERA_POSITION_LIMIT
          }
          onClick={() => {
            let number = 1;
            while (positions.some((p) => p.name === `View ${number}`)) number++;
            setName(`View ${number}`);
            setAdding(true);
          }}
        >
          Add position
        </button>
        <button
          type="button"
          disabled={disabled || !selection}
          onClick={() => {
            onChange(positions.filter((p) => p.id !== selection));
            onSelect('');
          }}
        >
          Delete position
        </button>
      </div>
      {adding && (
        <form
          className="cc-camera-position-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              disabled ||
              !name.trim() ||
              positions.length >= CAMERA_POSITION_LIMIT
            )
              return;
            const pose = capture();
            if (!pose) return;
            const position = {
              ...pose,
              id: crypto.randomUUID(),
              name: name.trim(),
            };
            onChange([...positions, position]);
            onSelect(position.id);
            setAdding(false);
          }}
        >
          <label htmlFor={`${id}-name`}>Position name</label>
          <input
            id={`${id}-name`}
            value={name}
            maxLength={80}
            required
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" disabled={disabled || !name.trim()}>
            Save position
          </button>
          <button type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}
      {positions.length >= CAMERA_POSITION_LIMIT && (
        <small>Up to {CAMERA_POSITION_LIMIT} camera positions per model.</small>
      )}
    </div>
  );
}
