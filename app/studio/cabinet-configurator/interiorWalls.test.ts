import {describe, expect, it} from 'vitest';
import {
  moveInteriorWall,
  previewInteriorWall,
  resizeInteriorWall,
  wallFits,
  partitionEnds,
} from './interiorWalls';
import {presetOutline, roomSegments, wallPoint} from './roomOutline';
import {
  validateLayout,
  type Room,
  type Partition,
  type RoomElement,
} from './model';
import {validStudy} from './savedRoomProtocol';
import * as THREE from 'three';
import {roomGeometry} from './roomGeometry';
import {wallFootprint} from './wallDimensions';
const inch = 0.0254;
const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  walls: 'white',
  floor: 'oak',
};
const wall: Partition = {
  id: 'segment-test',
  x: 72,
  z: 0,
  length: 120,
  orientation: 'vertical',
};
describe('plan wall gestures', () => {
  it('keeps the full partition width inside the room and clear of parallel walls', () => {
    expect(wallFits(room, {...wall, x: 1})).toBe(false);
    expect(wallFits(room, {...wall, x: 2.25})).toBe(true);
    expect(wallFits({...room, wallThickness: 6}, {...wall, x: 2.25})).toBe(
      false,
    );
    const r = {...room, partitions: [wall]};
    expect(wallFits(r, {...wall, id: 'segment-second', x: 75})).toBe(false);
    expect(wallFits(r, {...wall, id: 'segment-second', x: 76.5})).toBe(true);
  });
  it('spans perpendicular to the nearest wall without needing a name', () => {
    expect(previewInteriorWall(room, {x: 60, z: 10})).toMatchObject({
      x: 60,
      z: 0,
      length: 120,
      orientation: 'vertical',
    });
    expect(previewInteriorWall(room, {x: 10, z: 55})).toMatchObject({
      x: 0,
      z: 55,
      length: 144,
      orientation: 'horizontal',
    });
    expect(previewInteriorWall(room, {x: -10, z: 40})).toBeNull();
  });
  it('divides only the current compartment, stopping at an interior wall', () => {
    expect(
      previewInteriorWall({...room, partitions: [wall]}, {x: 60, z: 55}),
    ).toMatchObject({x: 0, z: 55, length: 72, orientation: 'horizontal'});
  });
  it('stops at the first boundary of a concave room', () => {
    const shaped = {...room, outline: presetOutline(room, 'l-shape')};
    expect(previewInteriorWall(shaped, {x: 120, z: 8})).toMatchObject({
      x: 120,
      z: 0,
      length: 48,
    });
  });
  it('detaches either end and snaps it back to a supporting wall', () => {
    const r = {...room, partitions: [wall]};
    const shortened = resizeInteriorWall(r, wall, 'start', {x: 72, z: 24});
    expect(shortened).toMatchObject({z: 24, length: 96});
    const free = resizeInteriorWall(r, shortened, 'end', {x: 72, z: 100});
    expect(free).toMatchObject({z: 24, length: 76});
    expect(resizeInteriorWall(r, free, 'start', {x: 72, z: 2})).toMatchObject({
      z: 0,
      length: 100,
    });
    expect(resizeInteriorWall(r, wall, 'end', {x: 72, z: -30}).length).toBe(6);
  });
  it('moves detached walls without extending them back to the boundary', () => {
    const free = {...wall, z: 24, length: 60};
    expect(
      moveInteriorWall({...room, partitions: [free]}, free, 90),
    ).toMatchObject({x: 90, z: 24, length: 60});
  });
  it('snaps an end to another interior wall', () => {
    const cross: Partition = {
      id: 'segment-cross',
      x: 0,
      z: 80,
      length: 144,
      orientation: 'horizontal',
    };
    expect(
      resizeInteriorWall({...room, partitions: [wall, cross]}, wall, 'end', {
        x: 72,
        z: 78,
      }),
    ).toMatchObject({length: 80});
  });
});

describe('angled interior walls', () => {
  const detached = {...wall, x: 40, z: 30, length: 60};
  it('moves either endpoint freely with Command and leaves the opposite end fixed', () => {
    const next = resizeInteriorWall(
      room,
      detached,
      'end',
      {x: 100, z: 80},
      0,
      true,
    );
    expect(next.angle).toBeCloseTo((Math.atan2(50, 60) * 180) / Math.PI);
    expect(partitionEnds(next).start).toEqual({x: 40, z: 30});
    expect(partitionEnds(next).end.x).toBeCloseTo(100);
    const start = resizeInteriorWall(
      room,
      next,
      'start',
      {x: 50, z: 20},
      0,
      true,
    );
    expect(partitionEnds(start).end.x).toBeCloseTo(100);
    expect(partitionEnds(start).end.z).toBeCloseTo(80);
  });
  it('retains the wall angle during ordinary endpoint resizing', () => {
    const angled = {...detached, angle: 30};
    const next = resizeInteriorWall(room, angled, 'end', {x: 110, z: 95}, 0);
    expect(next.angle).toBeCloseTo(30);
    expect(next.length).toBeGreaterThan(60);
  });
  it('translates an angled wall without changing its angle or length', () => {
    const angled = {...detached, angle: -30};
    const moved = moveInteriorWall(room, angled, {x: 60, z: 50});
    expect(moved).toMatchObject({x: 60, z: 50, angle: -30, length: 60});
    expect(moveInteriorWall(room, angled, {x: 140, z: 100})).toBe(angled);
  });
  it('uses the angled tangent for openings and rendered wall segments', () => {
    const angled = {...detached, angle: -30};
    const r = {...room, partitions: [angled]};
    const segment = roomSegments(r).find((s) => s.id === angled.id)!;
    expect(segment.length).toBeCloseTo(60);
    expect(wallPoint(r, angled.id, 30).x).toBeCloseTo(
      40 + 30 * Math.cos(-Math.PI / 6),
    );
    expect(wallPoint(r, angled.id, 30).z).toBeCloseTo(15);
  });
  it('rejects short walls and full-thickness excursions beyond concave room edges', () => {
    expect(
      resizeInteriorWall(room, detached, 'end', {x: 41, z: 31}, 0, true),
    ).toBe(detached);
    const shaped = {...room, outline: presetOutline(room, 'l-shape')};
    const diagonal = {
      ...detached,
      x: 20,
      z: 100,
      length: Math.hypot(110, -70),
      angle: (Math.atan2(-70, 110) * 180) / Math.PI,
    };
    expect(wallFits(shaped, diagonal)).toBe(false);
    expect(wallFits(room, {...detached, x: 1, angle: 90})).toBe(false);
  });
  it('stops new walls at angled partitions and sloping exterior walls', () => {
    const angled = {...detached, x: 50, z: 10, length: 100, angle: 45};
    const preview = previewInteriorWall(
      {...room, partitions: [angled]},
      {x: 10, z: 60},
    );
    expect(preview?.length).toBeCloseTo(100);
  });
});

it('persists angled walls while retaining compatibility with existing saved rooms', () => {
  const study = {
    version: 2,
    room: {...room, partitions: [wall] as Partition[]},
    elements: [],
    openings: [],
    islands: [],
    selected: null,
    countertop: true,
    view: 'plan',
  };
  expect(validStudy(study)).toBe(true);
  study.room.partitions = [{...wall, x: 30, z: 30, length: 60, angle: 35}];
  expect(validStudy(JSON.parse(JSON.stringify(study)))).toBe(true);
  for (const angle of [NaN, Infinity, '30', 361]) {
    expect(
      validStudy({
        ...study,
        room: {...study.room, partitions: [{...wall, angle}]},
      }),
    ).toBe(false);
  }
});
it('checks the actual angled partition footprint rather than its bounding box', () => {
  const r = {
    ...room,
    partitions: [{...wall, x: 20, z: 20, angle: 45, length: 100}],
  };
  const cabinet: RoomElement = {
    id: 'test-cabinet',
    kind: 'base',
    width: 12,
    height: 34.5,
    depth: 12,
    face: 'slab',
    placement: {mode: 'floor', x: 30, z: 80, rotation: 0},
  };
  expect(validateLayout([cabinet], r).get(cabinet.id)).toBeUndefined();
  expect(
    validateLayout(
      [{...cabinet, placement: {mode: 'floor', rotation: 0, x: 55, z: 55}}],
      r,
    ).get(cabinet.id),
  ).toContain('Crosses an interior wall');
});

it('can angle a wall connected to the perimeter without disconnecting its fixed endpoint', () => {
  const next = resizeInteriorWall(room, wall, 'end', {x: 100, z: 100}, 0, true);
  expect(next.angle).toBeCloseTo((Math.atan2(100, 28) * 180) / Math.PI);
  expect(next.x).toBe(72);
  expect(next.z).toBe(0);
  expect(wallFits(room, next)).toBe(true);
});

it('renders angled partition thickness and keeps door apertures open in 3D', () => {
  const angled = {...wall, x: 30, z: 30, length: 70, angle: -30};
  const r = {...room, partitions: [angled]};
  const group = roomGeometry(
    r,
    [
      {
        id: 'door',
        kind: 'door',
        wall: angled.id,
        offset: 20,
        width: 30,
        height: 80,
      },
    ],
    0xffffff,
  ).at(-1)!;
  group.updateMatrixWorld(true);
  const footprint = wallFootprint(r, angled.id);
  const bounds = new THREE.Box3().setFromObject(group);
  expect(bounds.min.x).toBeCloseTo(
    (Math.min(...footprint.map((p) => p.x)) - r.width / 2) * inch,
  );
  expect(bounds.max.z).toBeCloseTo(
    (Math.max(...footprint.map((p) => p.z)) - r.depth / 2) * inch,
  );
  const segment = roomSegments(r).find((s) => s.id === angled.id)!;
  const rayAt = (offset: number) => {
    const point = wallPoint(r, angled.id, offset);
    return new THREE.Raycaster(
      new THREE.Vector3(
        (point.x + segment.nx * 10 - r.width / 2) * inch,
        40 * inch,
        (point.z + segment.nz * 10 - r.depth / 2) * inch,
      ),
      new THREE.Vector3(-segment.nx, 0, -segment.nz),
    ).intersectObject(group, true);
  };
  expect(rayAt(35)).toHaveLength(0);
  expect(rayAt(10).length).toBeGreaterThan(0);
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        material.dispose();
    }
  });
});
