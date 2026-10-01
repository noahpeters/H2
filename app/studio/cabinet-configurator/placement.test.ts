import {describe, it, expect} from 'vitest';
import {
  islandAt,
  snapAdjacent,
  positionElement,
  snapWall,
  snapIslandEdges,
  snapRoomCorner,
} from './placement';
import {createDragUpdate, type Study} from './CabinetConfigurator';
import {
  bounds,
  validateLayout,
  type RoomElement,
  type Island,
  type Room,
} from './model';
const room: Room = {
  width: 240,
  depth: 200,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};
const item = (id: string, x: number): RoomElement => ({
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
  it.each([
    [0, 18, 21],
    [90, 219, 18],
    [180, 222, 179],
    [270, 21, 182],
  ])(
    'snaps a non-square corner flush to two walls at %s degrees',
    (rotation, x, z) => {
      const cabinet = {
        ...item('corner', x),
        configuration: 'corner' as const,
        width: 36,
        depth: 42,
      };
      cabinet.placement = {mode: 'floor', x: x + 1, z: z - 1, rotation: 0};
      expect(snapRoomCorner(cabinet, room)).toBe(true);
      expect(cabinet.placement).toMatchObject({x, z, rotation});
      const footprint = bounds(cabinet, room);
      expect(footprint.left).toBeGreaterThanOrEqual(0);
      expect(footprint.top).toBeGreaterThanOrEqual(0);
      expect(footprint.right).toBeLessThanOrEqual(room.width);
      expect(footprint.bottom).toBeLessThanOrEqual(room.depth);
      expect(validateLayout([cabinet], room).size).toBe(0);
      // The local +X/+Z opening must point toward the room center.
      const angle = (rotation * Math.PI) / 180;
      expect(
        (Math.cos(angle) - Math.sin(angle)) * (room.width / 2 - x),
      ).toBeGreaterThan(0);
      expect(
        (Math.sin(angle) + Math.cos(angle)) * (room.depth / 2 - z),
      ).toBeGreaterThan(0);
      cabinet.placement.x = room.width / 2;
      cabinet.placement.z = room.depth / 2;
      expect(snapRoomCorner(cabinet, room)).toBe(false);
    },
  );
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

it('keeps mirrors wall mounted when dragged across the room', () => {
  const mirror: RoomElement = {
    id: 'mirror',
    kind: 'fixture',
    fixtureKind: 'mirror',
    width: 30,
    height: 36,
    depth: 1,
    face: 'slab',
    placement: {mode: 'wall', wall: 'back', offset: 0, elevation: 42},
  };
  positionElement(mirror, room.width, 60, room);
  expect(mirror.placement).toMatchObject({
    mode: 'wall',
    wall: 'right',
    elevation: 42,
  });
  positionElement(mirror, 70, 60, room);
  expect(mirror.placement.mode).toBe('wall');
  expect(mirror.placement.elevation).toBe(42);
});

describe('Option-drag precision near snap targets', () => {
  it.each(['base', 'appliance'] as const)(
    'preserves small gaps for %s elements at every zoom',
    (kind) => {
      for (const scale of [0.5, 1, 4]) {
        for (const gap of [0, 1, 2, 3]) {
          for (const target of [
            'neighbor',
            'wall',
            'island',
            'corner',
          ] as const) {
            const moving: RoomElement = {
              ...item('moving', 36),
              kind,
              ...(kind === 'appliance'
                ? {applianceKind: 'dishwasher' as const}
                : {}),
              ...(target === 'corner' && kind === 'base'
                ? {configuration: 'corner' as const}
                : {}),
            };
            const z = target === 'wall' || target === 'corner' ? 12 : 60;
            const x = target === 'corner' ? 12 : target === 'island' ? 84 : 36;
            moving.placement = {mode: 'floor', x, z, rotation: 0};
            const original: Study = {
              version: 2,
              room,
              openings: [],
              elements:
                target === 'neighbor'
                  ? [moving, item('neighbor', 60)]
                  : [moving],
              islands:
                target === 'island'
                  ? [{...island, rotation: 0, depth: 48}]
                  : [],
              selected: moving.id,
              countertop: true,
              view: 'plan',
            };
            const dx = target === 'neighbor' || target === 'island' ? -gap : 0;
            const dz = target === 'wall' || target === 'corner' ? gap : 0;
            const moved = createDragUpdate(
              {id: moving.id, mode: 'floor', x, z, clientX: 0, clientY: 0},
              dx * scale,
              dz * scale,
              scale,
              true,
            )(original);
            expect(bounds(moved.elements[0], room)).toEqual({
              left: x + dx - 12,
              right: x + dx + 12,
              top: z + dz - 12,
              bottom: z + dz + 12,
            });
            expect(original.elements[0].placement).toEqual(moving.placement);
          }
        }
      }
    },
  );
  it('resumes adjacency snapping when Option is released during a drag', () => {
    const moving = item('moving', 36);
    const original: Study = {
      version: 2,
      room,
      openings: [],
      elements: [moving, item('neighbor', 60)],
      islands: [],
      selected: moving.id,
      countertop: true,
      view: 'plan',
    };
    const drag = {
      id: moving.id,
      mode: 'floor' as const,
      x: 36,
      z: 60,
      clientX: 0,
      clientY: 0,
    };
    const precise = createDragUpdate(drag, -1, 0, 1, true)(original);
    expect(precise.elements[0].placement).toMatchObject({x: 35});
    const snapped = createDragUpdate(drag, -1, 0, 1, false)(precise);
    expect(snapped.elements[0].placement).toMatchObject({x: 36});
  });
  it.each(['back', 'front', 'left', 'right'] as const)(
    'preserves one-inch gaps along the %s wall',
    (wall) => {
      for (const gap of [0, 1, 2, 3]) {
        const moving = item('moving', 36);
        moving.placement = {mode: 'wall', wall, offset: 24, elevation: 0};
        const neighbor = item('neighbor', 60);
        neighbor.placement = {mode: 'wall', wall, offset: 48, elevation: 0};
        const original: Study = {
          version: 2,
          room,
          openings: [],
          elements: [moving, neighbor],
          islands: [],
          selected: moving.id,
          countertop: true,
          view: 'plan',
        };
        const horizontal = wall === 'back' || wall === 'front';
        const moved = createDragUpdate(
          {id: moving.id, mode: 'wall', wall, offset: 24, pointer: 0},
          horizontal ? -gap * 2 : 0,
          horizontal ? 0 : -gap * 2,
          2,
          true,
        )(original);
        expect(moved.elements[0].placement).toMatchObject({
          mode: 'wall',
          wall,
          offset: 24 - gap,
        });
      }
    },
  );
});
