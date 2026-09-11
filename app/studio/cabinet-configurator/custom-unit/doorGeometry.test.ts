import {expect, it} from 'vitest';
import * as THREE from 'three';
import {doorPreview} from './doorGeometry';
import type {CabinetPart} from './model';
const part: CabinetPart = {
  id: 'door',
  kind: 'door',
  x: 0,
  y: 0,
  z: -0.75,
  width: 18,
  height: 30,
  depth: 0.75,
  door: {mechanism: 'pocket', side: 'left', travel: 18, slatSize: 1},
};
const mesh = () =>
  new THREE.Mesh(
    new THREE.BoxGeometry(18, 30, 0.75),
    new THREE.MeshStandardMaterial(),
  );
it('swings pocket doors before retracting and returns exactly closed', () => {
  const rig = doorPreview(mesh(), part, 0);
  rig.userData.updateOpening(0.5);
  expect(rig.rotation.y).toBeCloseTo(Math.PI / 2);
  expect(rig.position.z).toBe(0);
  rig.userData.updateOpening(1);
  expect(rig.position.z).toBe(18);
  rig.userData.updateOpening(0);
  expect(rig.rotation.y).toBe(0);
  expect(rig.position.z).toBe(0);
});
it('extends the full drawer box length', () => {
  const rig = doorPreview(mesh(), {...part, kind: 'drawer'}, 0, 24);
  expect(rig.children).toHaveLength(5);
  rig.userData.updateOpening(1);
  expect(rig.position.z).toBe(-22.5);
  rig.userData.updateOpening(0);
  expect(rig.position.z).toBe(0);
});
it.each(['vertical', 'horizontal'] as const)(
  'rolls %s tambour slats off the opening',
  (direction) => {
    const rig = doorPreview(
      mesh(),
      {...part, door: {...part.door!, mechanism: 'tambour', direction}},
      0,
    );
    const before = rig.children[0].position.clone();
    rig.userData.updateOpening(1);
    expect(rig.children[0].position.z).toBeGreaterThan(0);
    expect(rig.children[0].position.equals(before)).toBe(false);
    rig.userData.updateOpening(0);
    expect(rig.children[0].position.equals(before)).toBe(true);
  },
);

it.each(['vertical', 'horizontal'] as const)(
  'keeps the %s roll within the opening throughout travel',
  (direction) => {
    for (const side of ['left', 'right'] as const) {
      const rig = doorPreview(
        mesh(),
        {...part, door: {...part.door!, mechanism: 'tambour', direction, side}},
        0,
      );
      for (let step = 0; step <= 20; step++) {
        rig.userData.updateOpening(step / 20);
        const bounds = new THREE.Box3().setFromObject(rig);
        expect(bounds.min.x).toBeGreaterThanOrEqual(-part.width / 2 - 0.0001);
        expect(bounds.max.x).toBeLessThanOrEqual(part.width / 2 + 0.0001);
        expect(bounds.min.y).toBeGreaterThanOrEqual(-part.height / 2 - 0.0001);
        expect(bounds.max.y).toBeLessThanOrEqual(part.height / 2 + 0.0001);
        expect(bounds.min.z).toBeGreaterThanOrEqual(-part.depth / 2 - 0.0001);
      }
    }
  },
);
