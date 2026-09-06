import {describe, it, expect} from 'vitest';
import {
  roomPoints,
  roomSegments,
  roomWall,
  presetOutline,
  validOutline,
  boxInRoom,
  moveRoomWall,
  addRoomRecess,
} from './roomOutline';
import {
  bounds,
  wallToFloor,
  validateLayout,
  type Room,
  type KitchenElement,
} from './model';
import {snapWall, snapRoomCorner} from './placement';
import {reshapeStudy, type Study} from './CabinetConfigurator';
import {validStudy} from './savedRoomProtocol';
import {
  roomGeometry,
  roomFloorGeometry,
  openingGeometry,
} from './kitchenGeometry';
const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};
const base: KitchenElement = {
  id: 'base',
  kind: 'base',
  width: 24,
  depth: 24,
  height: 34.5,
  face: 'shaker',
  placement: {mode: 'floor', x: 12, z: 12, rotation: 0},
};
const sample: Study = {
  version: 2,
  room,
  elements: [],
  openings: [],
  islands: [],
  selected: null,
  countertop: true,
  view: 'split',
};
describe('editable orthogonal room outlines', () => {
  it('keeps legacy rectangular positions and validates all presets', () => {
    expect(validStudy(sample)).toBe(true);
    for (const kind of ['rectangle', 'l-shape', 'alcove'] as const) {
      const next = reshapeStudy(sample, presetOutline(room, kind));
      expect(validStudy(next)).toBe(true);
      expect(validOutline(roomPoints(next.room))).toBe(true);
      expect(roomGeometry(next.room, [], 0xffffff)).toHaveLength(
        roomPoints(next.room).length,
      );
    }
    for (const s of roomSegments(room)) {
      const e = {
        ...base,
        placement: {mode: 'wall' as const, wall: s.id, offset: 6, elevation: 0},
      };
      expect(wallToFloor(e, {...room, outline: roomPoints(room)})).toEqual(
        wallToFloor(e, room),
      );
    }
  });
  it('rejects crossing, duplicate, reversed, tiny and malformed outlines', () => {
    const p = roomPoints(room);
    expect(validOutline([...p].reverse())).toBe(false);
    expect(
      validOutline(p.map((v, i) => (i === 1 ? {...v, id: 'back'} : v))),
    ).toBe(false);
    expect(validOutline(p.map((v, i) => (i === 1 ? {...v, z: 20} : v)))).toBe(
      false,
    );
    expect(moveRoomWall(room, 'right', 3)).toBeNull();
    expect(validStudy({...sample, room: {...room, outline: [{}]}})).toBe(false);
  });
  it('detects cabinets spanning a concave cutout even if their corners are inside', () => {
    const points = addRoomRecess(room, 'back', 'test')!;
    const r = reshapeStudy(sample, points).room;
    expect(boxInRoom(r, {left: 20, right: 120, top: 0, bottom: 50})).toBe(
      false,
    );
    expect(boxInRoom(r, {left: 10, right: 30, top: 0, bottom: 50})).toBe(true);
    const e = {
      ...base,
      width: 100,
      depth: 50,
      placement: {mode: 'floor' as const, x: 70, z: 25, rotation: 0},
    };
    expect(validateLayout([e], r).get(e.id)).toContain('Outside room bounds');
  });
  it('snaps to every segment facing inward and keeps openings on their chosen segment', () => {
    const r = reshapeStudy(sample, presetOutline(room, 'l-shape')).room;
    for (const s of roomSegments(r)) {
      const e: KitchenElement = {
        ...base,
        width: 12,
        depth: 12,
        placement: {
          mode: 'floor',
          x: s.x + (s.horizontal ? s.length / 2 : 0) + s.nx * 6,
          z: s.z + (s.horizontal ? 0 : s.length / 2) + s.nz * 6,
          rotation: 0,
        },
      };
      snapWall(e, r);
      expect(e.placement.mode).toBe('wall');
      expect(wallToFloor(e, r).rotation).toBe(s.rotation);
      expect(boxInRoom(r, bounds(e, r))).toBe(true);
      const opening = {
        id: 'door',
        kind: 'door' as const,
        wall: s.id,
        offset: 6,
        width: 12,
        height: 80,
      };
      const g = openingGeometry(opening, r);
      expect(g.position.x).toBeCloseTo(
        (s.x + (s.horizontal ? 12 : 0) - r.width / 2) * 0.0254,
      );
      expect(g.position.z).toBeCloseTo(
        (s.z + (s.horizontal ? 0 : 12) - r.depth / 2) * 0.0254,
      );
    }
    const e: KitchenElement = {
      ...base,
      configuration: 'corner',
      placement: {mode: 'floor', x: 12, z: 108, rotation: 0},
    };
    expect(snapRoomCorner(e, r)).toBe(true);
    expect(boxInRoom(r, bounds(e, r))).toBe(true);
  });
  it('moves segments by whole inches, preserves references and validates saved custom walls', () => {
    const next = reshapeStudy(sample, presetOutline(room, 'l-shape'));
    const s = roomSegments(next.room)[2];
    const moved = moveRoomWall(next.room, s.id, s.z + 12.4)!;
    expect(roomWall({...next.room, outline: moved}, s.id).z).toBe(s.z + 12);
    next.elements = [
      {...base, placement: {mode: 'wall', wall: s.id, offset: 0, elevation: 0}},
    ];
    expect(validStudy(next)).toBe(true);
    expect(
      validStudy({
        ...next,
        elements: [
          {
            ...base,
            placement: {mode: 'wall', wall: 'segment-missing', offset: 0},
          },
        ],
      }),
    ).toBe(false);
  });
  it('triangulates the floor to the polygon area instead of its rectangular envelope', () => {
    const r = reshapeStudy(sample, presetOutline(room, 'l-shape')).room;
    const floor = roomFloorGeometry(r, 0xffffff),
      pos = floor.geometry.getAttribute('position'),
      ids = floor.geometry.index!;
    let area = 0;
    for (let i = 0; i < ids.count; i += 3) {
      const a = ids.getX(i),
        b = ids.getX(i + 1),
        c = ids.getX(i + 2);
      area +=
        Math.abs(
          (pos.getX(b) - pos.getX(a)) * (pos.getY(c) - pos.getY(a)) -
            (pos.getY(b) - pos.getY(a)) * (pos.getX(c) - pos.getX(a)),
        ) / 2;
    }
    expect(area).toBeCloseTo(
      (144 * 120 - (144 - 86) * (120 - 48)) * 0.0254 ** 2,
      4,
    );
  });
});
