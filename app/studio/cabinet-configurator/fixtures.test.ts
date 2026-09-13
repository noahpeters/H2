import {describe, it, expect} from 'vitest';
import * as THREE from 'three';
import {
  createFixture,
  showerGlassSides,
  FIXTURE_CATALOG,
  type FixtureKind,
} from './fixtures';
import {fixtureGeometry, sinkCutout} from './fixtureGeometry';
import {createSink, sinkAttachment, sinkFits} from './sinkAttachments';
import {
  migrateElement,
  validateLayout,
  type RoomElement,
  type Room,
} from './model';
import {cabinetGeometry, islandCountertop} from './roomGeometry';
import {validStudy} from './savedRoomProtocol';
import {
  automaticallyPlaceElement,
  validAutomaticPlacement,
} from './automaticPlacement';
const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak',
  walls: 'white',
};
const base: RoomElement = {
  id: 'base',
  kind: 'base',
  width: 36,
  depth: 24,
  height: 34.5,
  face: 'slab',
  placement: {mode: 'floor', x: 70, z: 60, rotation: 0},
};
const study = (elements: RoomElement[]) => ({
  version: 2,
  room,
  elements,
  openings: [],
  islands: [],
  countertop: true,
  view: 'plan',
});
describe('bathroom fixtures', () => {
  it.each(Object.keys(FIXTURE_CATALOG) as FixtureKind[])(
    'round trips and places %s without overlap',
    (kind) => {
      const item = createFixture(kind, kind, room),
        layout = study([base]);
      const placed = automaticallyPlaceElement(item, layout, {});
      expect(validAutomaticPlacement(placed, layout)).toBe(true);
      expect(
        validStudy(JSON.parse(JSON.stringify(study([base, placed])))),
      ).toBe(true);
      const size = new THREE.Box3()
        .setFromObject(fixtureGeometry(item, room))
        .getSize(new THREE.Vector3());
      expect(size.x).toBeGreaterThan(0);
      expect(size.y).toBeGreaterThan(0);
      expect(size.z).toBeGreaterThan(0);
    },
  );
  it('omits full wall contacts, not nearby or partial contacts', () => {
    const shower = createFixture('glass-shower', 'shower', room);
    shower.placement = {mode: 'floor', x: 24, z: 18, rotation: 0};
    expect(showerGlassSides(shower, room)).toEqual(['front', 'right']);
    shower.placement = {mode: 'floor', x: 25, z: 19, rotation: 0};
    expect(showerGlassSides(shower, room)).toHaveLength(4);
    shower.placement = {mode: 'floor', x: 18, z: 24, rotation: 90};
    expect(showerGlassSides(shower, room)).toEqual(['back', 'right']);
    const partial = {
      ...room,
      outline: [
        {id: 'back' as const, x: 0, z: 0},
        {id: 'right' as const, x: 24, z: 0},
        {id: 'front' as const, x: 24, z: 120},
        {id: 'left' as const, x: 0, z: 120},
      ],
    };
    shower.placement = {mode: 'floor', x: 24, z: 18, rotation: 0};
    expect(showerGlassSides(shower, partial)).toContain('back');
  });
  it('follows ceiling changes and switches glass door to open entry', () => {
    const shower = createFixture('glass-shower', 'shower', room);
    const tall = {...room, height: 108};
    const geo = fixtureGeometry(shower, tall);
    expect(
      new THREE.Box3().setFromObject(geo).max.y / 0.0254 + shower.height / 2,
    ).toBeCloseTo(108);
    expect(geo.getObjectByName('shower-door')).toBeDefined();
    shower.showerOpening = {side: 'left', style: 'open'};
    expect(
      fixtureGeometry(shower, room).getObjectByName('shower-door'),
    ).toBeUndefined();
  });
  it('rejects invalid fixture and sink data', () => {
    expect(
      validStudy(
        study([
          {
            ...createFixture('toilet', 't', room),
            fixtureKind: 'bad',
          } as unknown as RoomElement,
        ]),
      ),
    ).toBe(false);
    expect(
      validStudy(study([{...base, sink: {...createSink('oval'), width: -1}}])),
    ).toBe(false);
    expect(
      validStudy(
        study([
          {...createFixture('toilet', 't', room), sink: createSink('oval')},
        ]),
      ),
    ).toBe(false);
  });
});
describe('cabinet sink attachments', () => {
  it.each(['sink', 'farmhouse-sink'] as const)(
    'migrates legacy %s and allows explicit removal',
    (configuration) => {
      const migrated = migrateElement({...base, configuration});
      expect(migrated.sink?.kind).toBe(
        configuration === 'sink' ? 'undermount' : 'farmhouse',
      );
      expect(sinkAttachment({...migrated, sink: null})).toBeNull();
      expect(validStudy(study([migrated]))).toBe(true);
    },
  );
  it.each(['undermount', 'farmhouse', 'oval', 'vessel'] as const)(
    'repositions %s independently and persists dimensions',
    (kind) => {
      const item = {...base, sink: {...createSink(kind), x: 3}};
      const loaded = JSON.parse(JSON.stringify(study([item]))) as ReturnType<
        typeof study
      >;
      expect(validStudy(loaded)).toBe(true);
      expect(loaded.elements[0].sink).toEqual(item.sink);
      expect(item.width).toBe(36);
      const geo = cabinetGeometry(item, true);
      expect(geo.getObjectByName('sink-attachment')?.position.x).toBeCloseTo(
        3 * 0.0254,
      );
      expect(sinkFits(item, item.sink)).toBe(true);
      expect(
        validateLayout([{...item, width: 10}], room)
          .get(base.id)
          ?.join(),
      ).toContain('Sink extends');
    },
  );
  it('creates oval openings and small vessel drain openings in island counters', () => {
    const oval = sinkCutout(createSink('oval'));
    expect(oval.length).toBeGreaterThan(60);
    const vessel = sinkCutout(createSink('vessel'));
    expect(Math.max(...vessel.map((p) => p.x))).toBe(0.75);
    const item = {
      ...base,
      islandId: 'island',
      sink: {...createSink('oval'), x: 4},
    };
    const island = {
      id: 'island',
      x: 70,
      z: 60,
      width: 72,
      depth: 42,
      rotation: 0,
      overhang: 1,
      seatingSide: 'none' as const,
    };
    const top = islandCountertop(island, [item])
      .children[0] as THREE.Mesh<THREE.ExtrudeGeometry>;
    const shape = top.geometry.parameters.shapes as THREE.Shape;
    expect(shape.holes).toHaveLength(1);
    const points = shape.holes[0].getPoints();
    expect(
      (Math.max(...points.map((p) => p.x)) +
        Math.min(...points.map((p) => p.x))) /
        2,
    ).toBeCloseTo(4 * 0.0254);
  });
});

it('migrates the original wall-based cabinet schema with a sink attachment', () => {
  const migrated = migrateElement({
    id: 'legacy',
    type: 'base',
    wall: 'back',
    offset: 0,
    width: 36,
    depth: 24,
    height: 34.5,
    face: 'slab',
    configuration: 'sink',
  });
  expect(migrated.sink?.kind).toBe('undermount');
  expect(migrated.placement.mode).toBe('wall');
});
it('never hosts a room fixture in an island', () => {
  const item: RoomElement = {
    ...createFixture('toilet', 'toilet', room),
    islandId: 'island',
  };
  const layout = {
    ...study([]),
    islands: [
      {
        id: 'island',
        x: 72,
        z: 60,
        width: 72,
        depth: 42,
        rotation: 0,
        overhang: 1,
        seatingSide: 'none' as const,
      },
    ],
  };
  expect(validAutomaticPlacement(item, layout)).toBe(false);
  delete item.islandId;
  const placed = automaticallyPlaceElement(item, layout, {});
  expect(placed.islandId).toBeUndefined();
  expect(validAutomaticPlacement(placed, layout)).toBe(true);
});

it('checks a ceiling-height fixture against overhead cabinetry', () => {
  const upper: RoomElement = {
    ...base,
    kind: 'wall-cabinet',
    height: 30,
    placement: {mode: 'wall', wall: 'back', offset: 0, elevation: 54},
  };
  const shower: RoomElement = {
    ...createFixture('glass-shower', 'shower', room),
    placement: {mode: 'wall', wall: 'back', offset: 0, elevation: 0},
  };
  expect(validateLayout([upper, shower], room).get(shower.id)).toContain(
    'Overlaps another element',
  );
  const tub = {...shower, fixtureKind: 'alcove-tub' as const, height: 22};
  expect(validateLayout([upper, tub], room).get(tub.id)).toBeUndefined();
});

it('places mirrors above base cabinets and preserves mounting height on reload', () => {
  const mirror = createFixture('mirror', 'mirror', room);
  expect(mirror).toMatchObject({
    width: 30,
    height: 36,
    depth: 1,
    placement: {mode: 'wall', elevation: 42},
  });
  const placed = automaticallyPlaceElement(
    mirror,
    study([
      {
        ...base,
        placement: {mode: 'wall', wall: 'back', offset: 0, elevation: 0},
      },
    ]),
    {},
  );
  expect(placed.placement.mode).toBe('wall');
  expect(validStudy(JSON.parse(JSON.stringify(study([placed]))))).toBe(true);
  expect(
    validStudy(
      study([
        {...mirror, placement: {mode: 'floor', x: 30, z: 30, rotation: 0}},
      ]),
    ),
  ).toBe(false);
  const geo = fixtureGeometry({...mirror, width: 40, height: 48}, room);
  expect(geo.getObjectByName('mirror-glass')).toBeDefined();
  const size = new THREE.Box3().setFromObject(geo).getSize(new THREE.Vector3());
  expect(size.x / 0.0254).toBeCloseTo(40);
  expect(size.y / 0.0254).toBeCloseTo(48);
});
