import {expect, test} from 'vitest';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {
  captureCameraPosition,
  restoreCameraPosition,
  validCameraPositions,
} from './cameraPositions';
import {blankStudy, migrateStudy} from './CabinetConfigurator';
import {validStudy} from './savedRoomProtocol';

const saved = {
  id: 'view-1',
  name: 'Island',
  position: [3, 2, 4] as [number, number, number],
  target: [0, 1, 0] as [number, number, number],
  fov: 38,
  zoom: 1.2,
};
test('camera positions round-trip through model migration and server validation; old models remain valid', () => {
  const study = {...blankStudy(), cameraPositions: [saved]};
  expect(validStudy(study)).toBe(true);
  const restored = migrateStudy(JSON.parse(JSON.stringify(study)));
  expect(restored.cameraPositions).toEqual([saved]);
  expect(restored.cameraPositions).not.toBe(study.cameraPositions);
  expect(validStudy(blankStudy())).toBe(true);
  expect(migrateStudy(blankStudy()).cameraPositions).toBeUndefined();
  for (const invalid of [
    [{...saved, zoom: 0}],
    [{...saved, fov: Infinity}],
    [{...saved, name: ' '}],
    [{...saved, position: [NaN, 2, 4]}],
    [{...saved, target: saved.position}],
    [saved, saved],
    Array.from({length: 51}, (_, i) => ({...saved, id: `view-${i}`})),
  ]) {
    expect(validCameraPositions(invalid)).toBe(false);
    expect(validStudy({...study, cameraPositions: invalid})).toBe(false);
  }
});
test('restores actual orbit camera framing after navigation, retaining the current viewport aspect', () => {
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.01, 100);
  camera.position.set(3, 2, 4);
  camera.zoom = 1.2;
  const controls = new OrbitControls(camera, document.createElement('canvas'));
  controls.target.set(0, 1, 0);
  controls.enableDamping = true;
  controls.update();
  camera.updateProjectionMatrix();
  const pose = captureCameraPosition(camera, controls.target);
  const projection = camera.projectionMatrix.clone();
  camera.position.set(-1, 1, 2);
  controls.target.set(1, 0.5, 2);
  camera.zoom = 2;
  camera.fov = 55;
  controls.update();
  restoreCameraPosition(camera, controls, pose);
  for (let i = 0; i < 20; i++) controls.update();
  expect(camera.position.toArray()).toEqual(
    expect.arrayContaining(pose.position.map((n) => expect.closeTo(n, 10))),
  );
  expect(controls.target.toArray()).toEqual(pose.target);
  expect(camera.zoom).toBe(pose.zoom);
  expect(camera.projectionMatrix.elements).toEqual(projection.elements);
  expect(controls.enableDamping).toBe(true);
  camera.aspect = 0.8;
  restoreCameraPosition(camera, controls, pose);
  expect(camera.aspect).toBe(0.8);
  controls.dispose();
});
