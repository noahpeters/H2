import {expect, it} from 'vitest';
import * as THREE from 'three';
import {SceneInteractions} from './sceneInteractions';
import {doorPreview, type DoorMechanism} from './custom-unit/doorGeometry';

function rig(kind: 'door' | 'drawer', mechanism: DoorMechanism = 'hinged') {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(18, 30, 0.75),
    new THREE.MeshStandardMaterial(),
  );
  const object = doorPreview(
    mesh,
    {
      id: 'front',
      kind,
      x: 0,
      y: 0,
      z: -0.75,
      width: 18,
      height: 30,
      depth: 0.75,
      door: {mechanism, side: 'left', travel: 18, slatSize: 1},
    },
    0,
    24,
  );
  object.userData.partId = 'front';
  return object;
}
function finish(motion: SceneInteractions, root: THREE.Object3D) {
  for (let i = 0; i < 20; i++) motion.update(root, 0.05);
}

it.each(['hinged', 'pocket', 'tambour', 'lift-up', 'pull-down'] as const)(
  'opens and closes the existing %s customization rig',
  (mechanism) => {
    const root = new THREE.Group();
    root.userData.id = 'cabinet';
    const door = rig('door', mechanism);
    root.add(door);
    const closed = new THREE.Box3().setFromObject(door).clone();
    const motion = new SceneInteractions();
    expect(motion.toggle(door.children[0])).toBe(true);
    finish(motion, root);
    expect(new THREE.Box3().setFromObject(door).equals(closed)).toBe(false);
    expect(motion.toggle(door.children[0])).toBe(true);
    finish(motion, root);
    expect(
      new THREE.Box3().setFromObject(door).min.distanceTo(closed.min),
    ).toBeLessThan(1e-8);
    expect(
      new THREE.Box3().setFromObject(door).max.distanceTo(closed.max),
    ).toBeLessThan(1e-8);
  },
);
it('extends a drawer with its box and closes all motions on leaving three mode', () => {
  const root = new THREE.Group();
  root.userData.id = 'cabinet';
  const drawer = rig('drawer');
  root.add(drawer);
  const motion = new SceneInteractions();
  motion.toggle(drawer.children[0]);
  finish(motion, root);
  expect(drawer.position.z).toBe(-22.5);
  expect(drawer.getObjectByName('storage-drawer-box')!.children).toHaveLength(
    5,
  );
  motion.reset();
  expect(drawer.position.z).toBe(0);
  expect(motion.update(root, 0.05)).toBe(false);
});
it('keeps drawer arrays together and scopes matching part IDs to one cabinet', () => {
  const root = new THREE.Group(),
    cabinet = new THREE.Group(),
    other = new THREE.Group();
  cabinet.userData.id = 'one';
  other.userData.id = 'two';
  root.add(cabinet, other);
  const first = rig('drawer'),
    second = rig('drawer'),
    unrelated = rig('drawer');
  cabinet.add(first, second);
  other.add(unrelated);
  const motion = new SceneInteractions();
  motion.toggle(first.children[0]);
  finish(motion, root);
  expect(first.position.z).toBe(-22.5);
  expect(second.position.z).toBe(-22.5);
  expect(unrelated.position.z).toBe(0);
  cabinet.remove(first, second);
  expect(motion.update(root, 0.05)).toBe(false);
});
it('ignores static carcass hits', () => {
  expect(new SceneInteractions().toggle(new THREE.Mesh())).toBe(false);
});
