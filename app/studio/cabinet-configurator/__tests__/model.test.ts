import {describe, expect, it} from 'vitest';
import {
  aisleClearance,
  bounds,
  migrateElement,
  moveIsland,
  snapAngle,
  validateLayout,
  wallToFloor,
  type Island,
  type KitchenElement,
  type Room,
} from '../model';

const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak',
  walls: 'white',
};
const base = (id: string, x = 50, z = 50): KitchenElement => ({
  id,
  kind: 'base',
  width: 30,
  depth: 24,
  height: 34.5,
  face: 'shaker',
  placement: {mode: 'floor', x, z, rotation: 0},
});

describe('cabinet placement model', () => {
  it('migrates a v1 wall cabinet without losing its coordinates', () => {
    const migrated = migrateElement({
      id: 'old',
      type: 'wall',
      wall: 'left',
      offset: 17,
      elevation: 52,
      width: 30,
      depth: 12,
      height: 30,
      face: 'slab',
    });
    expect(migrated.kind).toBe('wall-cabinet');
    expect(migrated.placement).toEqual({
      mode: 'wall',
      wall: 'left',
      offset: 17,
      elevation: 52,
    });
  });
  it('converts wall coordinates and snaps extensible angles', () => {
    const legacy = migrateElement({
      id: 'old',
      type: 'base',
      wall: 'right',
      offset: 20,
      width: 30,
      depth: 24,
      height: 34.5,
      face: 'slab',
    });
    expect(wallToFloor(legacy, room)).toEqual({
      mode: 'floor',
      x: 132,
      z: 35,
      rotation: 270,
    });
    expect(snapAngle(316)).toBe(0);
    expect(snapAngle(134)).toBe(90);
  });
  it('uses rotated footprints for bounds and collision checks', () => {
    const first = base('a', 10, 40);
    first.placement = {mode: 'floor', x: 10, z: 40, rotation: 90};
    expect(bounds(first, room).left).toBeCloseTo(-2);
    expect(validateLayout([first, base('b', 30, 40)], room).get('a')).toContain(
      'Outside room bounds',
    );
    expect(validateLayout([base('a'), base('b', 80, 50)], room).size).toBe(0);
    expect(validateLayout([base('a'), base('b', 60, 50)], room).size).toBe(2);
  });
  it('moves and rotates grouped island children while preserving relative placement', () => {
    const island: Island = {
      id: 'i',
      x: 50,
      z: 50,
      width: 60,
      depth: 40,
      rotation: 0,
      overhang: 12,
      seatingSide: 'south',
    };
    const child = {...base('a', 60, 50), islandId: 'i'};
    const [moved] = moveIsland(island, [child], {x: 70, z: 60, rotation: 90});
    expect(moved.placement).toEqual({
      mode: 'floor',
      x: 70,
      z: 70,
      rotation: 90,
    });
  });
  it('reports four conceptual wall clearances around an island', () => {
    expect(
      aisleClearance(
        {
          id: 'i',
          x: 72,
          z: 60,
          width: 60,
          depth: 36,
          rotation: 0,
          overhang: 12,
          seatingSide: 'none',
        },
        room,
      ),
    ).toEqual({left: 42, right: 42, top: 42, bottom: 42});
  });
});
