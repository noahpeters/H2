import {expect, it} from 'vitest';
import * as THREE from 'three';
import {panelGeometry} from './panelGeometry';
import {automaticFinishPanels} from './automaticFinishPanels';
import {blankStudy} from './CabinetConfigurator';
import {createPhotoSnapshot} from './photoRender';
import type {RoomElement} from './model';
import type {MaterialDefinition} from './materialDefinition';

const definition: MaterialDefinition = {
  id: 'walnut',
  version: 1,
  label: 'Panel grain fixture',
  substrate: {type: 'wood'},
  finish: {},
  textureSize: {width: 12, height: 48, unit: 'in'},
  pbr: {color: '#72513d'},
};
const panel: RoomElement = {
  id: 'panel',
  kind: 'panel',
  face: 'slab',
  width: 0.75,
  height: 84,
  depth: 24,
  material: 'walnut',
  materialDefinition: definition,
  placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
};
function uvSpan(geometry: THREE.BufferGeometry, normalAxis: 'x' | 'z') {
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const indices = Array.from({length: uv.count}, (_, i) => i).filter(
    (i) => (normalAxis === 'x' ? normal.getX(i) : normal.getZ(i)) > 0.99,
  );
  const u = indices.map((i) => uv.getX(i));
  const v = indices.map((i) => uv.getY(i));
  return [Math.max(...u) - Math.min(...u), Math.max(...v) - Math.min(...v)];
}
it.each([
  [0.75, 24, 'x', 2],
  [36, 0.75, 'z', 3],
] as const)(
  'manual panel %s by %s uses physical grain scale',
  (width, depth, axis, across) => {
    const mesh = panelGeometry({...panel, width, depth});
    const [u, v] = uvSpan(mesh.geometry, axis);
    expect(u).toBeCloseTo(across, 6);
    expect(v).toBeCloseTo(84 / 48, 6);
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.max.y).toBeCloseTo((84 * 0.0254) / 2, 6);
    expect(mesh.geometry.userData.materialApplication.unit).toBe('m');
    mesh.geometry.dispose();
  },
);
it('automatic side and back panels retain the same grain scale', () => {
  const study = blankStudy();
  study.room.useMapleInternals = true;
  const owner = {
    ...panel,
    id: 'cabinet',
    kind: 'base' as const,
    width: 36,
    height: 34.5,
    depth: 24,
    placement: {mode: 'floor' as const, x: 72, z: 60, rotation: 0},
  };
  const panels = automaticFinishPanels([owner], study.room);
  expect(panels.map((p) => p.autoPanel.surface)).toEqual([
    'left',
    'right',
    'back',
  ]);
  for (const item of panels) {
    const mesh = panelGeometry(item);
    const [u, v] = uvSpan(mesh.geometry, 'x');
    expect(u).toBeCloseTo(item.depth / 12, 6);
    expect(v).toBeCloseTo(item.height / 48, 6);
    mesh.geometry.dispose();
  }
});
it('horizontal panel grain changes direction without stretching', () => {
  const mesh = panelGeometry({...panel, flatGrain: 'horizontal'});
  const [u, v] = uvSpan(mesh.geometry, 'x');
  expect(u).toBeCloseTo(84 / 12, 6);
  expect(v).toBeCloseTo(24 / 48, 6);
  mesh.geometry.dispose();
});
it('photo panels retain meter mapping and a physically small eased edge', () => {
  const mesh = panelGeometry(panel);
  const scene = new THREE.Scene();
  scene.add(mesh);
  const snapshot = createPhotoSnapshot(scene, new THREE.PerspectiveCamera());
  const photo = snapshot.scene.getObjectByName('room-panel') as THREE.Mesh;
  const positions = photo.geometry.getAttribute('position');
  const normals = photo.geometry.getAttribute('normal');
  const uv = photo.geometry.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) {
    if (normals.getX(i) < 0.99) continue;
    expect(uv.getX(i)).toBeCloseTo(positions.getZ(i) / (12 * 0.0254), 6);
    expect(uv.getY(i)).toBeCloseTo(positions.getY(i) / (48 * 0.0254), 6);
  }
  const [u, v] = uvSpan(photo.geometry, 'x');
  expect(Math.abs(u - 2)).toBeLessThan(0.01);
  expect(Math.abs(v - 84 / 48)).toBeLessThan(0.01);
  expect(photo.geometry.userData.materialApplication.unit).toBe('m');
  photo.geometry.dispose();
  mesh.geometry.dispose();
});
