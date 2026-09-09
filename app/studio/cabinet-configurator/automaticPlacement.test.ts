import {describe, expect, it} from 'vitest';
import {
  automaticallyPlaceElement as place,
  automaticallyPlaceOpening,
  automaticallyPlaceIsland,
  elementPlacementCandidates,
  validAutomaticPlacement,
  type PlacementLayout,
} from './automaticPlacement';
import {bounds, wallToFloor, type KitchenElement} from './model';
import {presetOutline} from './roomOutline';
const cabinet = (id = 'new'): KitchenElement => ({
  id,
  kind: 'base',
  width: 30,
  depth: 24,
  height: 34.5,
  face: 'shaker',
  placement: {mode: 'wall', wall: 'back', offset: 0, elevation: 0},
});
const layout = (): PlacementLayout => ({
  room: {width: 180, depth: 144, height: 108, floor: 'oak', walls: 'white'},
  elements: [],
  openings: [],
  islands: [],
});
describe('deterministic automatic placement', () => {
  it('builds a flush run beside a sink and preserves its wall orientation', () => {
    const d = layout();
    d.elements.push({
      ...cabinet('sink'),
      configuration: 'sink',
      placement: {mode: 'wall', wall: 'left', offset: 0, elevation: 0},
    });
    for (let i = 1; i <= 3; i++) {
      const next = place(cabinet(String(i)), d);
      expect(next.placement).toEqual({
        mode: 'wall',
        wall: 'left',
        offset: i * 30,
        elevation: 0,
      });
      expect(wallToFloor(next, d.room).rotation).toBe(270);
      d.elements.push(next);
    }
  });
  it('rejects occupied run ends and searches the same wall', () => {
    const d = layout();
    d.elements = [
      cabinet('active'),
      {
        ...cabinet('obstacle'),
        width: 40,
        placement: {mode: 'wall', wall: 'back', offset: 30, elevation: 0},
      },
    ];
    const next = place(cabinet(), d, {elementId: 'active'});
    expect(next.placement).toMatchObject({wall: 'back', offset: 70});
    expect(validAutomaticPlacement(next, d)).toBe(true);
  });
  it('continues around an adjacent corner when the local wall is full', () => {
    const d = layout();
    d.room.width = 90;
    d.elements = [0, 30, 60].map((offset, i) => ({
      ...cabinet(String(i)),
      placement: {
        mode: 'wall' as const,
        wall: 'back' as const,
        offset,
        elevation: 0,
      },
    }));
    const next = place(cabinet(), d);
    expect(next.placement).toMatchObject({
      mode: 'wall',
      wall: 'right',
      offset: 24,
    });
    expect(validAutomaticPlacement(next, d)).toBe(true);
  });
  it('starts flush against a corner cabinet on either adjoining wall', () => {
    const d = layout();
    const corner = place(
      {...cabinet('corner'), configuration: 'corner', width: 36, depth: 36},
      d,
    );
    d.elements.push(corner);
    const next = place(cabinet(), d, {elementId: corner.id});
    expect(validAutomaticPlacement(next, d)).toBe(true);
    expect(
      bounds(next, d.room).left === bounds(corner, d.room).right ||
        bounds(next, d.room).top === bounds(corner, d.room).bottom,
    ).toBe(true);
  });
  it('searches another compatible wall and respects opening heights', () => {
    const d = layout();
    d.openings = ['back', 'left', 'right'].map((wall, i) => ({
      id: String(i),
      kind: 'opening' as const,
      wall: wall as 'back' | 'left' | 'right',
      offset: 0,
      width: wall === 'back' ? 180 : 144,
      height: 108,
    }));
    expect(place(cabinet(), d).placement).toMatchObject({wall: 'front'});
    d.openings = [
      {
        id: 'window',
        kind: 'window',
        wall: 'back',
        width: 180,
        offset: 0,
        sill: 42,
        height: 38,
      },
    ];
    expect(place(cabinet(), d).placement).toMatchObject({wall: 'back'});
    const upper = {
      ...cabinet(),
      kind: 'wall-cabinet' as const,
      height: 30,
      depth: 12,
      placement: {
        mode: 'wall' as const,
        wall: 'back' as const,
        offset: 0,
        elevation: 54,
      },
    };
    expect(place(upper, d).placement).not.toMatchObject({wall: 'back'});
  });
  it('uses a compatible island when walls are unavailable', () => {
    const d = layout();
    d.openings = ['back', 'right', 'front', 'left'].map((wall) => ({
      id: wall,
      kind: 'opening' as const,
      wall: wall as 'back',
      offset: 0,
      width: wall === 'back' || wall === 'front' ? 180 : 144,
      height: 108,
    }));
    d.islands = [
      {
        id: 'island',
        x: 90,
        z: 72,
        width: 72,
        depth: 42,
        rotation: 90,
        overhang: 12,
        seatingSide: 'none',
      },
    ];
    const next = place(cabinet(), d);
    expect(next.islandId).toBe('island');
    expect(next.placement).toMatchObject({mode: 'floor', rotation: 90});
    expect(validAutomaticPlacement(next, d)).toBe(true);
  });
  it('uses safe interior free space, then stages outside an entirely full room', () => {
    const d = layout();
    d.openings = ['back', 'right', 'front', 'left'].map((wall) => ({
      id: wall,
      kind: 'opening' as const,
      wall: wall as 'back',
      offset: 0,
      width: wall === 'back' || wall === 'front' ? 180 : 144,
      height: 108,
    }));
    const next = place(cabinet(), d);
    expect(next.placement.mode).toBe('floor');
    expect(validAutomaticPlacement(next, d)).toBe(true);
    d.elements = [
      {
        ...cabinet('full'),
        width: 180,
        depth: 144,
        height: 108,
        placement: {mode: 'floor', x: 90, z: 72, rotation: 0},
      },
    ];
    const staged = place(cabinet(), d);
    expect(bounds(staged, d.room).left).toBeGreaterThan(180);
    expect(validAutomaticPlacement(staged, d, false)).toBe(true);
  });
  it('uses a moved active free-standing run and is repeatable without mutating inputs', () => {
    const d = layout();
    d.elements = [
      {
        ...cabinet('moved'),
        placement: {mode: 'floor', x: 90, z: 72, rotation: 180},
      },
    ];
    const before = JSON.stringify(d);
    const next = place(cabinet(), d, {elementId: 'moved'});
    expect(next.placement).toMatchObject({
      mode: 'floor',
      x: 60,
      z: 72,
      rotation: 180,
    });
    expect(place(cabinet(), d, {elementId: 'moved'})).toEqual(next);
    expect(JSON.stringify(d)).toBe(before);
  });
  it('rejects concave room cutouts and tall/upper collisions', () => {
    const d = layout();
    d.room.outline = presetOutline(d.room, 'l-shape');
    d.elements = [{...cabinet('tall'), height: 96}];
    const upper = {
      ...cabinet(),
      kind: 'wall-cabinet' as const,
      placement: {
        mode: 'wall' as const,
        wall: 'back' as const,
        offset: 0,
        elevation: 54,
      },
    };
    expect(
      elementPlacementCandidates(upper, d).every((c) =>
        validAutomaticPlacement(c.element, d),
      ),
    ).toBe(true);
    expect(place(upper, d).placement).not.toMatchObject({
      wall: 'back',
      offset: 0,
    });
  });
  it('places openings away from cabinetry and existing openings, including perpendicular cabinets', () => {
    const d = layout();
    d.elements = [cabinet('base')];
    d.openings = [
      {
        id: 'door',
        kind: 'door',
        wall: 'back',
        offset: 30,
        width: 32,
        height: 80,
      },
    ];
    const opening = {
      id: 'new',
      kind: 'door' as const,
      wall: 'back' as const,
      offset: 12,
      width: 32,
      height: 80,
    };
    expect(automaticallyPlaceOpening(opening, d)).toMatchObject({
      wall: 'back',
      offset: 62,
    });
    d.elements = [
      {
        ...cabinet('left'),
        placement: {mode: 'wall', wall: 'left', offset: 0, elevation: 0},
      },
    ];
    d.openings = [];
    expect(automaticallyPlaceOpening(opening, d).offset).toBe(24);
  });
});

describe('island boundaries and opening fallback', () => {
  it('does not extend a grouped cabinet past the rotated island edge', () => {
    const d = layout();
    d.islands = [
      {
        id: 'island',
        x: 90,
        z: 72,
        width: 60,
        depth: 24,
        rotation: 90,
        overhang: 0,
        seatingSide: 'none',
      },
    ];
    const first = place(cabinet('first'), d, {elementId: 'island'});
    d.elements.push(first);
    const second = place(cabinet('second'), d, {elementId: 'first'});
    d.elements.push(second);
    expect(first.islandId).toBe('island');
    expect(second.islandId).toBe('island');
    expect(
      place(cabinet('third'), d, {elementId: 'second'}).islandId,
    ).toBeUndefined();
  });
  it('does not put elevated wall cabinets into island zones', () => {
    const d = layout();
    d.islands = [
      {
        id: 'island',
        x: 90,
        z: 72,
        width: 60,
        depth: 24,
        rotation: 0,
        overhang: 0,
        seatingSide: 'none',
      },
    ];
    expect(
      place(
        {
          ...cabinet(),
          kind: 'wall-cabinet',
          placement: {mode: 'wall', wall: 'back', offset: 0, elevation: 54},
        },
        d,
        {elementId: 'island'},
      ).islandId,
    ).toBeUndefined();
  });
  it('stages additional openings separately when no wall can fit them', () => {
    const d = layout();
    d.room.width = 24;
    d.room.depth = 24;
    const opening = {
      id: 'new',
      kind: 'door' as const,
      wall: 'back' as const,
      width: 32,
      offset: 0,
      height: 80,
    };
    const first = automaticallyPlaceOpening(opening, d);
    d.openings.push(first);
    const second = automaticallyPlaceOpening({...opening, id: 'second'}, d);
    expect(first.offset).toBeGreaterThan(24);
    expect(second.offset).toBeGreaterThan(first.offset + first.width);
  });
});

describe('island zone creation', () => {
  it('finds a separate free footprint for each new island zone', () => {
    const d = layout();
    const island = {
      id: 'one',
      x: 90,
      z: 72,
      width: 60,
      depth: 36,
      rotation: 0,
      overhang: 0,
      seatingSide: 'none' as const,
    };
    const first = automaticallyPlaceIsland(island, d);
    d.islands.push(first);
    const second = automaticallyPlaceIsland({...island, id: 'two'}, d);
    expect(first).toMatchObject({x: 90, z: 72});
    expect(
      Math.abs(second.x - first.x) >= 60 || Math.abs(second.z - first.z) >= 36,
    ).toBe(true);
  });
});
