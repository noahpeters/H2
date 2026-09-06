import {describe, expect, it} from 'vitest';
import {Vector3} from 'three';
import {snapWall} from './placement';
import {
  APPLIANCE_CATALOG,
  bounds,
  createKitchenAppliance,
  moveIsland,
  snapAngle,
  validateLayout,
  wallToFloor,
  type Island,
  type KitchenElement,
  type Room,
} from './model';

const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};

describe('unified cabinet, appliance, and island model', () => {
  it.each(['base', 'wall-cabinet', 'tall', 'appliance'] as const)(
    'orients snapped %s fronts into the room on all four walls',
    (kind) => {
      for (const [wall, x, z, inwardX, inwardZ] of [
        ['left', 12, 60, 1, 0],
        ['right', 132, 60, -1, 0],
        ['back', 72, 12, 0, 1],
        ['front', 72, 108, 0, -1],
      ] as const) {
        const item: KitchenElement = {
          id: 'orientation',
          kind,
          width: 30,
          depth: 24,
          height: 36,
          face: 'shaker',
          applianceKind: kind === 'appliance' ? 'refrigerator' : undefined,
          placement: {mode: 'floor', x, z, rotation: 0},
        };
        snapWall(item, room);
        expect(item.placement).toMatchObject({mode: 'wall', wall});
        const placed = wallToFloor(item, room);
        // Geometry faces local +Z; Three.js applies the negative plan rotation.
        const forward = new Vector3(0, 0, 1).applyAxisAngle(
          new Vector3(0, 1, 0),
          (-placed.rotation * Math.PI) / 180,
        );
        expect(forward.x).toBeCloseTo(inwardX);
        expect(forward.z).toBeCloseTo(inwardZ);
        expect(placed.x).toBe(x);
        expect(placed.z).toBe(z);
        if (item.placement.mode === 'wall') item.placement.rotation = 180;
        expect(wallToFloor(item, room).rotation).toBe(180);
      }
    },
  );
  it('preserves all six parametric appliance types', () => {
    expect(Object.keys(APPLIANCE_CATALOG)).toEqual([
      'refrigerator',
      'dishwasher',
      'range',
      'wall-oven',
      'microwave',
      'coffee-maker',
    ]);
    expect(createKitchenAppliance('refrigerator', 'fridge')).toMatchObject({
      kind: 'appliance',
      applianceKind: 'refrigerator',
      width: 36,
      depth: 30,
      height: 70,
    });
  });

  it('converts wall placement to equivalent floor coordinates', () => {
    const element: KitchenElement = {
      id: 'cabinet',
      kind: 'base',
      width: 30,
      depth: 24,
      height: 34.5,
      face: 'shaker',
      placement: {mode: 'wall', wall: 'right', offset: 18, elevation: 0},
    };
    expect(wallToFloor(element, room)).toEqual({
      mode: 'floor',
      x: 132,
      z: 33,
      rotation: 90,
    });
  });

  it('snaps rotation and moves grouped island elements together', () => {
    expect(snapAngle(88)).toBe(90);
    const island: Island = {
      id: 'island',
      x: 72,
      z: 60,
      width: 72,
      depth: 42,
      rotation: 0,
      overhang: 12,
      seatingSide: 'south',
    };
    const appliance: KitchenElement = {
      ...createKitchenAppliance('dishwasher', 'dishwasher'),
      islandId: island.id,
      placement: {mode: 'floor', x: 84, z: 60, rotation: 0},
    };
    expect(
      moveIsland(island, [appliance], {x: 72, z: 60, rotation: 90})[0]
        .placement,
    ).toMatchObject({x: 72, z: 72, rotation: 90});
  });

  it('reports room-bound and collision warnings for free-floating elements', () => {
    const first: KitchenElement = {
      ...createKitchenAppliance('range', 'range'),
      placement: {mode: 'floor', x: 8, z: 8, rotation: 0},
    };
    const second: KitchenElement = {
      ...createKitchenAppliance('dishwasher', 'dishwasher'),
      placement: {mode: 'floor', x: 8, z: 8, rotation: 0},
    };
    expect(bounds(first, room).left).toBeLessThan(0);
    const warnings = validateLayout([first, second], room);
    expect(warnings.has('range')).toBe(true);
    expect(warnings.has('dishwasher')).toBe(true);
  });
});
