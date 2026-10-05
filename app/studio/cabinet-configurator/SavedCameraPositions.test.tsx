import {useState} from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {CameraPositions} from './SavedCameraPositions';
import type {SavedCameraPosition} from './cameraPositions';
afterEach(cleanup);
test('adds a named captured position, selects a stored view and deletes only the selected view', () => {
  const capture = vi.fn(() => ({
    position: [3, 2, 4] as [number, number, number],
    target: [0, 1, 0] as [number, number, number],
    fov: 38,
    zoom: 1,
  }));
  const select = vi.fn();
  function Harness() {
    const [positions, setPositions] = useState<SavedCameraPosition[]>([]);
    const [selected, setSelected] = useState('');
    return (
      <>
        <CameraPositions
          positions={positions}
          selected={selected}
          disabled={false}
          onChange={setPositions}
          capture={capture}
          onSelect={(id) => {
            setSelected(id);
            select(id);
          }}
        />
        <output data-testid="saved">{JSON.stringify(positions)}</output>
      </>
    );
  }
  render(<Harness />);
  expect(screen.getByRole('button', {name: 'Delete position'})).toBeDisabled();
  for (const name of ['Island', 'Window']) {
    fireEvent.click(screen.getByRole('button', {name: 'Add position'}));
    fireEvent.change(screen.getByLabelText('Position name'), {
      target: {value: name},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Save position'}));
  }
  const positions = JSON.parse(
    screen.getByTestId('saved').textContent!,
  ) as SavedCameraPosition[];
  expect(positions.map((p) => p.name)).toEqual(['Island', 'Window']);
  expect(capture).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByLabelText('Camera position'), {
    target: {value: positions[0].id},
  });
  expect(select).toHaveBeenLastCalledWith(positions[0].id);
  fireEvent.click(screen.getByRole('button', {name: 'Delete position'}));
  expect(JSON.parse(screen.getByTestId('saved').textContent!)).toEqual([
    positions[1],
  ]);
  expect(screen.getByLabelText('Camera position')).toHaveValue('');
});
