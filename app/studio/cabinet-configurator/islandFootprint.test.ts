import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {
  islandOutline,
  islandCountertopOutline,
  islandContainsElement,
  islandOverlapsElement,
  islandWorldBounds,
} from './islandFootprint';
import {islandAt, snapIslandEdges} from './placement';
import {islandCountertop, cabinetGeometry} from './roomGeometry';
import {
  createDragUpdate,
  createDragEndUpdate,
  type Study,
  blankStudy,
  migrateStudy,
} from './CabinetConfigurator';
import {
  aisleClearance,
  moveIsland,
  type Island,
  type RoomElement,
  type SeatingSide,
} from './model';
import {validStudy} from './savedRoomProtocol';
import {validAutomaticPlacement} from './automaticPlacement';
const room: Study['room'] = {
  width: 240,
  depth: 240,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};
const zone: Island = {
  id: 'island',
  x: 100,
  z: 100,
  width: 66,
  depth: 40,
  rotation: 0,
  overhang: 12,
  seatingSide: 'south',
};
const cabinet = (x = 100, z = 100): RoomElement => ({
  id: 'cabinet',
  kind: 'base',
  width: 20,
  depth: 24,
  height: 34.5,
  face: 'slab',
  placement: {mode: 'floor', x, z, rotation: 0},
});
const study = (item: RoomElement, island = zone): Study => ({
  version: 2,
  room,
  elements: [item],
  islands: [island],
  openings: [],
  selected: item.id,
  countertop: true,
  view: 'plan',
});
function atLocal(island: Island, x: number, z: number, member = false) {
  const angle = (island.rotation * Math.PI) / 180;
  const item = cabinet();
  item.placement = {
    mode: 'floor',
    x: island.x + x * Math.cos(angle) - z * Math.sin(angle),
    z: island.z + x * Math.sin(angle) + z * Math.cos(angle),
    rotation: island.rotation,
  };
  item.islandId = member ? island.id : undefined;
  return item;
}
describe('shared island outline', () => {
  it.each([
    ['none', -33, 33, -20, 20],
    ['north', -33, 33, -32, 20],
    ['south', -33, 33, -20, 32],
    ['east', -33, 45, -20, 20],
    ['west', -45, 33, -20, 20],
  ] as const)(
    'applies overhang only to %s seating in plan and 3D',
    (seatingSide, left, right, top, bottom) => {
      const island = {...zone, seatingSide};
      expect(islandOutline(island)).toEqual({left, right, top, bottom});
      const box = new THREE.Box3().setFromObject(islandCountertop(island, []));
      const finished = islandCountertopOutline(island, []);
      expect(box.min.x / 0.0254).toBeCloseTo(finished.left);
      expect(box.max.x / 0.0254).toBeCloseTo(finished.right);
      expect(box.min.z / 0.0254).toBeCloseTo(finished.top);
      expect(box.max.z / 0.0254).toBeCloseTo(finished.bottom);
      if (seatingSide === 'south') expect(finished.bottom).toBe(bottom);
    },
  );
  it.each([0, 90, 180, 270, 45])(
    'uses the same outline for %s degree snapping, grouping, and clearance',
    (rotation) => {
      const island = {...zone, rotation};
      const item = atLocal(island, 0, 20);
      expect(islandContainsElement(item, island)).toBe(true);
      expect(islandAt(item, [island], room)).toBe(island.id);
      expect(
        validAutomaticPlacement(
          {...item, islandId: island.id},
          {room, elements: [], islands: [island], openings: []},
        ),
      ).toBe(true);
      const nearEdge = atLocal(island, 0, 19.97);
      snapIslandEdges(nearEdge, [island], room);
      expect(nearEdge.placement).toMatchObject(item.placement);
      const b = islandWorldBounds(island),
        clear = aisleClearance(island, room);
      expect(clear).toEqual({
        left: b.left,
        right: room.width - b.right,
        top: b.top,
        bottom: room.depth - b.bottom,
      });
    },
  );
  it('does not treat the non-seating sides as extra island area', () => {
    for (const side of ['none', 'north', 'east', 'west'] as SeatingSide[]) {
      const island = {...zone, seatingSide: side};
      expect(islandContainsElement(cabinet(100, 120), island)).toBe(false);
    }
  });
});
describe('island membership on release', () => {
  it.each([0, 90, 180, 270, 45])(
    'requires full entry and full exit at %s degrees',
    (rotation) => {
      const island = {...zone, rotation};
      const entering = atLocal(island, 0, 21);
      expect(
        createDragEndUpdate(entering.id)(study(entering, island)).elements[0]
          .islandId,
      ).toBeUndefined();
      const contained = atLocal(island, 0, 20);
      const joined = createDragEndUpdate(contained.id)(
        study(contained, island),
      );
      expect(joined.elements[0].islandId).toBe(island.id);
      for (const z of [21, 33, 43, 44]) {
        const member = atLocal(island, 0, z, true);
        const released = createDragEndUpdate(member.id)(study(member, island));
        expect(released.elements[0].islandId).toBe(island.id);
        expect(released.elements[0].placement).toEqual(member.placement);
        const carried = moveIsland(island, released.elements, {
          ...island,
          x: island.x + 10,
        });
        expect(carried[0].placement).toMatchObject({
          x: (member.placement as {x: number}).x + 10,
        });
      }
      const outside = atLocal(island, 0, 45, true);
      const released = createDragEndUpdate(outside.id)(study(outside, island));
      expect(released.elements[0].islandId).toBeUndefined();
      expect(
        moveIsland(island, released.elements, {...island, x: island.x + 10})[0]
          .placement,
      ).toEqual(outside.placement);
    },
  );
  it('keeps the shared countertop when a member is partly outside on release', () => {
    const item = atLocal(zone, 0, 33, true);
    const released = createDragEndUpdate(item.id)(study(item));
    expect(released.elements[0].islandId).toBe(zone.id);
    const body = cabinetGeometry(
      released.elements[0],
      true,
      !!released.elements[0].islandId,
      room,
    );
    expect(new THREE.Box3().setFromObject(body).max.y / 0.0254).toBeCloseTo(
      item.height / 2,
    );
  });
  it('preserves a member near a wall during dragging and release', () => {
    const island = {...zone, z: 20};
    const item = atLocal(island, 0, 0, true);
    const moved = createDragUpdate(
      {id: item.id, mode: 'floor', x: 100, z: 20, clientX: 0, clientY: 0},
      0,
      -8,
      1,
    )(study(item, island));
    expect(moved.elements[0].placement.mode).toBe('floor');
    expect(createDragEndUpdate(item.id)(moved).elements[0].islandId).toBe(
      island.id,
    );
  });
  it('keeps the current island ahead of another overlapping island', () => {
    const other = {...zone, id: 'other', z: 130};
    const member = atLocal(zone, 0, 33, true);
    expect(islandAt(member, [other, zone], room)).toBe(zone.id);
    const outside = atLocal(zone, 0, 46, true);
    expect(islandAt(outside, [other, zone], room)).toBe(other.id);
  });
  it('checks rotated footprint intersection rather than its enclosing rectangle', () => {
    const island = {
      ...zone,
      width: 20,
      depth: 20,
      seatingSide: 'none' as const,
    };
    const item = cabinet(121, 121);
    item.placement = {mode: 'floor', x: 121, z: 121, rotation: 45};
    expect(islandOverlapsElement(item, island)).toBe(false);
  });
});

describe('island finished countertop coverage', () => {
  it.each([0, 90, 45])(
    'keeps plan bounds, countertop and aisle clearance fixed while members move at %s degrees',
    (rotation) => {
      const island = {...zone, rotation};
      for (const overlay of ['full-overlay', 'inset'] as const) {
        const settings = {...room, overlay};
        const centered = atLocal(island, 0, 0, true);
        const outline = islandCountertopOutline(island, [centered], settings);
        const clearance = aisleClearance(island, settings, [centered]);
        const original = new THREE.Box3().setFromObject(
          islandCountertop(island, [centered], settings),
        );
        for (const [x, z] of [
          [40, 0],
          [-40, 0],
          [0, -30],
          [0, 33],
        ]) {
          const moved = atLocal(island, x, z, true);
          expect(islandOverlapsElement(moved, island)).toBe(true);
          const released = createDragEndUpdate(moved.id)(study(moved, island));
          expect(released.elements[0].islandId).toBe(island.id);
          expect(
            islandCountertopOutline(island, released.elements, settings),
          ).toEqual(outline);
          expect(aisleClearance(island, settings, released.elements)).toEqual(
            clearance,
          );
          const mesh = new THREE.Box3().setFromObject(
            islandCountertop(island, released.elements, settings),
          );
          expect(mesh.min.x).toBeCloseTo(original.min.x);
          expect(mesh.max.x).toBeCloseTo(original.max.x);
          expect(mesh.min.z).toBeCloseTo(original.min.z);
          expect(mesh.max.z).toBeCloseTo(original.max.z);
        }
      }
    },
  );
  it.each([0, 90, 180, 270, 45])(
    'clears the rendered inset face frame by 1/8 inch at %s degrees',
    (rotation) => {
      const island = {
        ...zone,
        rotation,
        width: 20,
        depth: 24,
        seatingSide: 'none' as const,
        overhang: 0,
      };
      const item = atLocal(island, 0, 0, true);
      const settings = {...room, overlay: 'inset' as const};
      const outline = islandCountertopOutline(island, [item], settings);
      expect(outline.left).toBeCloseTo(-10.125);
      expect(outline.right).toBeCloseTo(10.125);
      expect(outline.top).toBeCloseTo(-12.125);
      expect(outline.bottom).toBeCloseTo(12.875);
      const cabinet = cabinetGeometry(item, false, true, settings);
      const frame = cabinet.getObjectByName('cabinet-face-frame')!;
      const bounds = new THREE.Box3().setFromObject(frame);
      expect(outline.bottom - bounds.max.z / 0.0254).toBeCloseTo(0.125);
      const countertop = new THREE.Box3().setFromObject(
        islandCountertop(island, [item], settings),
      );
      expect(countertop.max.z / 0.0254).toBeCloseTo(outline.bottom);
      const world = islandWorldBounds(island, outline);
      expect(aisleClearance(island, settings, [item]).left).toBeCloseTo(
        world.left,
      );
    },
  );
  it('covers opposing face frames and honors the room allowance without changing placement', () => {
    const island = {
      ...zone,
      width: 20,
      depth: 48,
      seatingSide: 'none' as const,
    };
    const front = atLocal(island, 0, 12, true);
    const back = atLocal(island, 0, -12, true);
    if (back.placement.mode === 'floor') back.placement.rotation = 180;
    const outline = islandCountertopOutline(island, [front, back], {
      ...room,
      overlay: 'partial-overlay',
      islandCountertopOverhang: 0.25,
    });
    expect(outline.left).toBeCloseTo(-10.25);
    expect(outline.right).toBeCloseTo(10.25);
    expect(outline.top).toBeCloseTo(-25);
    expect(outline.bottom).toBeCloseTo(25);
    expect(islandOutline(island)).toEqual({
      left: -10,
      right: 10,
      top: -24,
      bottom: 24,
    });
  });
  it('applies the edge allowance to frameless cabinets and excludes other islands', () => {
    const island = {...zone, seatingSide: 'none' as const};
    const outsider = atLocal(island, 100, 100);
    expect(islandCountertopOutline(island, [outsider], room)).toEqual({
      left: -33.125,
      right: 33.125,
      top: -20.125,
      bottom: 20.125,
    });
  });
  it('saves room edge allowances, accepts legacy rooms, and rejects invalid values', () => {
    const study = blankStudy();
    expect(validStudy(study)).toBe(true);
    for (const value of [0, 0.125, 0.25, 12]) {
      const saved = JSON.parse(
        JSON.stringify({
          ...study,
          room: {...study.room, islandCountertopOverhang: value},
        }),
      );
      expect(validStudy(saved)).toBe(true);
      expect(migrateStudy(saved).room.islandCountertopOverhang).toBe(value);
    }
    for (const value of [-0.125, 12.125, NaN, Infinity, '0.125', null]) {
      expect(
        validStudy({
          ...study,
          room: {...study.room, islandCountertopOverhang: value},
        }),
      ).toBe(false);
    }
  });
});
