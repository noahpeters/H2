import * as THREE from 'three';
import {expect, it} from 'vitest';
import {roomGeometry} from './roomGeometry';
import type {Opening, Room} from './model';

const inch = 0.0254;
const room: Room = {
  width: 120,
  depth: 100,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};
const opening: Opening = {
  id: 'arch',
  kind: 'opening',
  wall: 'back',
  offset: 30,
  width: 36,
  height: 80,
  arch: 'simple',
};

it.each(['back', 'right', 'front', 'left'] as const)(
  'cuts a continuous semicircular roof through the full %s wall',
  (wall) => {
    const group = roomGeometry(room, [{...opening, wall}], 0xffffff)[
      ['back', 'right', 'front', 'left'].indexOf(wall)
    ];
    // Check local wall geometry, including both faces and the middle of its thickness.
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const length =
      wall === 'back' || wall === 'front' ? room.width : room.depth;
    for (const depth of [0.1, 0.5, 0.9])
      for (const dx of [-17, -12, -6, -1, 0, 1, 6, 12, 17]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(
            (opening.offset + 18 + dx - length / 2) * inch,
            60 * inch,
            THREE.MathUtils.lerp(box.min.z, box.max.z, depth),
          ),
          new THREE.Vector3(0, 1, 0),
        );
        const hit = ray.intersectObject(group, true)[0];
        expect(hit).toBeDefined();
        expect(
          Math.abs(hit.point.y / inch - (62 + Math.sqrt(18 ** 2 - dx ** 2))),
        ).toBeLessThan(0.004);
      }
  },
);

it('retains a rectangular window alongside the arch and unions overlapping apertures', () => {
  const window: Opening = {
    id: 'window',
    kind: 'window',
    wall: 'back',
    offset: 75,
    width: 24,
    height: 24,
    sill: 40,
  };
  const extra: Opening = {
    ...opening,
    id: 'overlap',
    width: 10,
    height: 50,
    offset: 42,
    arch: undefined,
  };
  const group = roomGeometry(room, [opening, window, extra], 0xffffff)[0];
  group.position.set(0, 0, 0);
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3((87 - 60) * inch, 50 * inch, -2 * inch),
    new THREE.Vector3(0, 1, 0),
  );
  expect(ray.intersectObject(group, true)[0].point.y / inch).toBeCloseTo(64, 4);
  ray.ray.origin.set((48 - 60) * inch, 20 * inch, -2 * inch);
  expect(ray.intersectObject(group, true)[0].point.y / inch).toBeCloseTo(80, 4);
});
