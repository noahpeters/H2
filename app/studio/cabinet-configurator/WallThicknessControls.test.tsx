import {useState} from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, test} from 'vitest';
import type {Room, Wall} from './model';
import {WallThicknessControls} from './WallThicknessControls';
afterEach(cleanup);

test('individual wall overrides stay independent of other walls and the room default, and can reset to inheritance', () => {
  function Editor() {
    const [room, setRoom] = useState<Room>({
      width: 144,
      depth: 120,
      height: 96,
      floor: 'oak',
      walls: 'white',
      wallThickness: 4.5,
      partitions: [
        {
          id: 'segment-divider',
          x: 72,
          z: 0,
          length: 120,
          orientation: 'vertical',
        },
      ],
    });
    const [selectedWall, select] = useState<Wall>('back');
    return (
      <>
        <WallThicknessControls
          room={room}
          selectedWall={selectedWall}
          onSelect={select}
          onChange={(wall, thickness) =>
            setRoom((room) => {
              const wallThicknesses = {...room.wallThicknesses};
              if (thickness === undefined) delete wallThicknesses[wall];
              else wallThicknesses[wall] = thickness;
              return {...room, wallThicknesses};
            })
          }
        />
        <button
          onClick={() => setRoom((room) => ({...room, wallThickness: 5.5}))}
        >
          Change default
        </button>
      </>
    );
  }
  render(<Editor />);
  const field = () => screen.getByLabelText(/Selected wall thickness/);
  const select = screen.getByLabelText('Wall to edit');
  expect(field()).toHaveValue(4.5);
  fireEvent.change(field(), {target: {value: '6'}});
  fireEvent.change(select, {target: {value: 'right'}});
  expect(field()).toHaveValue(4.5);
  fireEvent.click(screen.getByText('Change default'));
  expect(field()).toHaveValue(5.5);
  fireEvent.change(select, {target: {value: 'segment-divider'}});
  fireEvent.change(field(), {target: {value: '8'}});
  fireEvent.change(select, {target: {value: 'back'}});
  expect(field()).toHaveValue(6);
  fireEvent.change(field(), {target: {value: '0'}});
  expect(field()).toHaveValue(6);
  fireEvent.click(screen.getByText('Use room default for this wall'));
  expect(field()).toHaveValue(5.5);
  fireEvent.change(select, {target: {value: 'segment-divider'}});
  expect(field()).toHaveValue(8);
});
