import {expect, it} from 'vitest';
import * as THREE from 'three';
import {cabinetGeometry} from './roomGeometry';
import {SceneInteractions} from './sceneInteractions';
import type {RoomElement} from './model';
const base: RoomElement = {
  id: 'standard',
  kind: 'base',
  width: 36,
  depth: 24,
  height: 34.5,
  face: 'shaker',
  placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
};
it.each([
  'single-door',
  'door-drawer',
  'three-drawer',
  'pullout',
  'corner',
] as const)(
  'opens and closes standard %s fronts from a click on attached hardware',
  (configuration) => {
    const group = cabinetGeometry({...base, configuration}, false);
    group.userData.id = base.id;
    const fronts: THREE.Object3D[] = [];
    group.traverse((child) => {
      if (child.userData.updateOpening) fronts.push(child);
    });
    expect(fronts.length).toBeGreaterThan(0);
    const motion = new SceneInteractions();
    for (const front of fronts) {
      const closed = new THREE.Box3().setFromObject(front).clone();
      const origin = front.position.clone();
      expect(motion.toggle(front.children[0])).toBe(true);
      for (let i = 0; i < 20; i++) motion.update(group, 0.05);
      expect(new THREE.Box3().setFromObject(front).equals(closed)).toBe(false);
      for (const sibling of fronts.filter((f) => f !== front))
        expect(sibling.rotation.y).toBeCloseTo(0);
      motion.reset();
      expect(front.position.distanceTo(origin)).toBeLessThan(1e-8);
      expect(
        new THREE.Box3().setFromObject(front).min.distanceTo(closed.min),
      ).toBeLessThan(1e-8);
    }
  },
);
it('swings paired doors outward on opposite hinges and moves complete drawer boxes', () => {
  const doors = cabinetGeometry(base, false).children.filter(
    (c) => c.name === 'cabinet-front',
  );
  doors.forEach((door) => door.userData.updateOpening(1));
  expect(doors[0].rotation.y).toBe(-Math.PI / 2);
  expect(doors[1].rotation.y).toBe(Math.PI / 2);
  const group = cabinetGeometry(
    {...base, configuration: 'three-drawer'},
    false,
  );
  const front = group.getObjectByName('cabinet-front')!;
  const drawer = front.getObjectByName('storage-drawer-box')!;
  const origin = drawer.getWorldPosition(new THREE.Vector3());
  front.userData.updateOpening(1);
  expect(drawer.getWorldPosition(new THREE.Vector3()).z - origin.z).toBeCloseTo(
    22 * 0.0254,
  );
});

it.each(['slab', 'shaker', 'beaded-shaker'] as const)(
  'attaches the independent box front behind the %s decorative front',
  (face) => {
    const group = cabinetGeometry(
      {...base, face, configuration: 'three-drawer'},
      false,
    );
    const front = group.getObjectByName('cabinet-front')!;
    const boxFront = front.getObjectByName('drawer-box-front')!;
    const bounds = new THREE.Box3().setFromObject(boxFront);
    expect(bounds.max.z).toBeCloseTo((base.depth / 2) * 0.0254);
    const before = bounds.clone();
    front.userData.updateOpening(1);
    group.updateMatrixWorld(true);
    const after = new THREE.Box3().setFromObject(boxFront);
    expect(after.max.z - before.max.z).toBeCloseTo(22 * 0.0254);
  },
);

it.each(['slab', 'shaker', 'beaded-shaker'] as const)(
  'picks only the clicked %s drawer even with another drawer open',
  (face) => {
    const group = cabinetGeometry(
      {...base, face, configuration: 'three-drawer'},
      false,
    );
    group.userData.id = base.id;
    const fronts = group.children.filter(
      (child) => child.name === 'cabinet-front',
    );
    const motion = new SceneInteractions();
    for (const open of [false, true]) {
      fronts[0].userData.updateOpening(open ? 1 : 0);
      group.updateMatrixWorld(true);
      for (const front of open ? fronts.slice(1) : fronts) {
        const center = front.getWorldPosition(new THREE.Vector3());
        const ray = new THREE.Raycaster(
          center.clone().add(new THREE.Vector3(1, 0.7, 2)),
          new THREE.Vector3(-1, -0.7, -2).normalize(),
        );
        const hits = ray.intersectObjects([group], true);
        let picked: THREE.Object3D | null = hits[0]?.object ?? null;
        while (picked && !picked.userData.updateOpening) picked = picked.parent;
        expect(picked?.uuid).toBe(front.uuid);
        expect(
          hits.some((hit) => hit.object instanceof THREE.LineSegments),
        ).toBe(false);
        const positions = fronts.map((item) => item.position.clone());
        expect(motion.toggle(hits[0].object)).toBe(true);
        for (let i = 0; i < 20; i++) motion.update(group, 0.05);
        expect(front.position.z).toBeGreaterThan(center.z);
        fronts.forEach((sibling, index) => {
          if (sibling !== front)
            expect(sibling.position.equals(positions[index])).toBe(true);
        });
        motion.reset();
        fronts[0].userData.updateOpening(open ? 1 : 0);
        group.updateMatrixWorld(true);
      }
    }
  },
);
