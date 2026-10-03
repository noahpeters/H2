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
