import {describe, it, expect} from 'vitest';
import {
  islandAt,
  snapAdjacent,
  positionElement,
  snapWall,
  snapIslandEdges,
} from './placement';
import {createDragUpdate} from './CabinetConfigurator';
import {type KitchenElement, type Island, type Room} from './model';
const room: Room = {
  width: 240,
  depth: 200,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};
const item = (id: string, x: number): KitchenElement => ({
  id,
  kind: 'base',
  width: 24,
  depth: 24,
  height: 34.5,
  face: 'slab',
  placement: {mode: 'floor', x, z: 60, rotation: 0},
});
const island: Island = {
  id: 'one',
  x: 60,
  z: 60,
  width: 72,
  depth: 40,
  rotation: 90,
  overhang: 0,
  seatingSide: 'none',
};
describe('placement tools', () => {
  it.each([0, 90, 45])(
    'snaps inside rotated island edges at %s degrees and releases',
    (rotation) => {
      const zone = {...island, rotation, width: 72, depth: 48};
      const a = (rotation * Math.PI) / 180;
      const object = item('edge', 60);
      object.placement = {
        mode: 'floor',
        x: 60 + 22 * Math.cos(a),
        z: 60 + 22 * Math.sin(a),
        rotation,
      };
      snapIslandEdges(object, [zone], room);
      expect(object.placement.x).toBeCloseTo(60 + 24 * Math.cos(a));
      expect(object.placement.z).toBeCloseTo(60 + 24 * Math.sin(a));
      object.placement = {
        mode: 'floor',
        x: 60 + 19 * Math.cos(a),
        z: 60 + 19 * Math.sin(a),
        rotation,
      };
      snapIslandEdges(object, [zone], room);
      expect(object.placement.x).toBeCloseTo(60 + 19 * Math.cos(a));
      expect(object.placement.z).toBeCloseTo(60 + 19 * Math.sin(a));
    },
  );
  it.each([
    ['back', 60, 14],
    ['front', 60, 186],
    ['left', 14, 60],
    ['right', 226, 60],
  ] as const)('snaps to the %s wall and preserves elevation', (wall, x, z) => {
    const a = item('a', x);
    a.placement = {mode: 'floor', x, z, rotation: 0, elevation: 54};
    snapWall(a, room);
    expect(a.placement).toMatchObject({
      mode: 'wall',
      wall,
      offset: 48,
      elevation: 54,
    });
  });
  it('snaps, releases and reattaches during a single drag', () => {
    const original = {
      version: 2 as const,
      room,
      openings: [],
      elements: [item('a', 60)],
      islands: [],
      selected: 'a',
      countertop: true,
      view: 'plan' as const,
    };
    const drag = {
      id: 'a',
      mode: 'floor' as const,
      x: 60,
      z: 60,
      clientX: 0,
      clientY: 0,
    };
    const attached = createDragUpdate(drag, 0, -46, 1)(original);
    expect(attached.elements[0].placement).toMatchObject({
      mode: 'wall',
      wall: 'back',
    });
    const released = createDragUpdate(drag, 1, -40, 1)(attached);
    expect(released.elements[0].placement).toMatchObject({
      mode: 'floor',
      x: 61,
      z: 20,
    });
    const reattached = createDragUpdate(drag, -46, 0, 1)(released);
    expect(reattached.elements[0].placement).toMatchObject({
      mode: 'wall',
      wall: 'left',
    });
  });
  it('snaps to adjacency and releases once outside the tolerance', () => {
    const a = item('a', 35),
      b = item('b', 60);
    snapAdjacent(a, [a, b], room);
    expect(a.placement).toMatchObject({x: 36});
    positionElement(a, 25, 60, room);
    snapAdjacent(a, [a, b], room);
    expect(a.placement).toMatchObject({x: 25});
  });
  it('chooses a specific rotated island and clears membership outside zones', () => {
    const two = {...island, id: 'two', x: 160};
    expect(islandAt(item('a', 160), [island, two], room)).toBe('two');
    expect(islandAt(item('a', 220), [island, two], room)).toBeUndefined();
  });
  it('drags only the selected island and its assigned objects', () => {
    const member = {...item('a', 60), islandId: 'one'};
    const study = {
      version: 2 as const,
      room,
      openings: [],
      elements: [member, item('b', 160)],
      islands: [island, {...island, id: 'two', x: 160}],
      selected: 'one',
      countertop: true,
      view: 'plan' as const,
    };
    const next = createDragUpdate(
      {id: 'one', mode: 'island', x: 60, z: 60, clientX: 0, clientY: 0},
      20,
      10,
      1,
    )(study);
    expect(next.islands[0]).toMatchObject({x: 80, z: 70});
    expect(next.elements[0].placement).toMatchObject({x: 80, z: 70});
    expect(next.elements[1].placement).toMatchObject({x: 160, z: 60});
  });
});
