import {afterEach, expect, test, vi} from 'vitest';
import * as THREE from 'three';
import {createPhotoSnapshot, easedGeometry, renderPhoto} from './photoRender';
import {createMaterial, mapMaterialPart} from './materialRendering';
import {disposeStudyObject, StudyScene} from './studyScene';
import {blankStudy} from './CabinetConfigurator';
import {facePreviewGeometry} from './custom-unit/facePreview';
import type {MaterialDefinition} from './materialDefinition';

const definition: MaterialDefinition = {
  version: 1,
  id: 'test',
  label: 'Test',
  substrate: {type: 'paint-grade'},
  finish: {},
  pbr: {color: '#ffffff', roughness: 0.5},
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('photo snapshot retains camera, poses, visibility and independent materials without changing live geometry', () => {
  const source = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.01, 100);
  camera.position.set(4, 3, 6);
  camera.zoom = 1.3;
  camera.lookAt(0, 1, 0);
  camera.updateProjectionMatrix();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.02, 0.6),
    createMaterial(definition, 0.5),
  );
  mapMaterialPart(
    mesh.geometry,
    mesh.material,
    {width: 0.7, height: 0.02, depth: 0.6},
    'm',
  );
  mesh.rotation.set(0.1, 0.3, 0);
  mesh.position.set(1, 0.5, 2);
  mesh.visible = false;
  source.add(mesh);
  const original = Array.from(mesh.geometry.getAttribute('position').array);
  const snapshot = createPhotoSnapshot(source, camera);
  const photo = snapshot.scene.children[0] as THREE.Mesh;
  expect(snapshot.camera.projectionMatrix).toEqual(camera.projectionMatrix);
  expect(snapshot.camera.position).toEqual(camera.position);
  expect(photo.quaternion.angleTo(mesh.quaternion)).toBeCloseTo(0);
  expect(photo.position).toEqual(mesh.position);
  expect(photo.visible).toBe(false);
  expect(photo.geometry).not.toBe(mesh.geometry);
  expect(photo.material).not.toBe(mesh.material);
  expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(
    original,
  );
  expect(photo.geometry.getAttribute('position').count).toBeGreaterThan(
    mesh.geometry.getAttribute('position').count,
  );
  const photoBounds = new THREE.Box3().setFromBufferAttribute(
    photo.geometry.getAttribute('position') as THREE.BufferAttribute,
  );
  expect(photoBounds.getSize(new THREE.Vector3()).toArray()).toEqual(
    expect.arrayContaining([
      expect.closeTo(0.7, 5),
      expect.closeTo(0.02, 5),
      expect.closeTo(0.6, 5),
    ]),
  );
  mesh.position.x = 99;
  camera.position.x = 99;
  (mesh.material as THREE.Material).userData.materialDefinition.pbr.color =
    '#000000';
  expect(photo.position.x).toBe(1);
  expect(snapshot.camera.position.x).toBe(4);
  expect(
    (photo.material as THREE.Material).userData.materialDefinition.pbr.color,
  ).toBe('#ffffff');
  disposeStudyObject(snapshot.scene);
  disposeStudyObject(source);
});

test('easing retains stock envelopes, inset countertop holes, face-frame parts and grain axes', () => {
  const shape = new THREE.Shape()
    .moveTo(-0.5, -0.4)
    .lineTo(0.5, -0.4)
    .lineTo(0.5, 0.4)
    .lineTo(-0.5, 0.4)
    .closePath();
  shape.holes.push(
    new THREE.Path()
      .moveTo(-0.2, -0.15)
      .lineTo(-0.2, 0.15)
      .lineTo(0.2, 0.15)
      .lineTo(0.2, -0.15)
      .closePath(),
  );
  const original = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0381,
    bevelEnabled: false,
  });
  const eased = easedGeometry(original, 0.002) as THREE.ExtrudeGeometry;
  const bounds = new THREE.Box3().setFromBufferAttribute(
    eased.getAttribute('position') as THREE.BufferAttribute,
  );
  expect(bounds.min.z).toBeCloseTo(0);
  expect(bounds.max.z).toBeCloseTo(0.0381);
  expect(bounds.min.x).toBeCloseTo(-0.5);
  expect(bounds.max.x).toBeCloseTo(0.5);
  expect((eased.parameters.shapes as THREE.Shape).holes).toHaveLength(1);
  const face = facePreviewGeometry(24, 30, 0.75, 'shaker-glass', false);
  const softened = easedGeometry(face, 0.001 / 0.0254);
  expect(softened.groups.map((group) => group.materialIndex)).toEqual(
    face.groups.map((group) => group.materialIndex),
  );
  expect(new Set(softened.getAttribute('materialGrainAxis').array)).toEqual(
    new Set([0, 1]),
  );
  expect(new Set(softened.getAttribute('materialFixedGrain').array)).toEqual(
    new Set([0, 1]),
  );
  [original, eased, face, softened].forEach((geometry) => geometry.dispose());
});

test('wall fillets are photo-only and preserve translucent wall visibility', async () => {
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(
    (_url, onLoad) => {
      const texture = new THREE.Texture();
      queueMicrotask(() => onLoad?.(texture));
      return texture;
    },
  );
  const scene = new THREE.Scene();
  const content = new StudyScene(scene);
  await content.update(blankStudy());
  const snapshot = createPhotoSnapshot(scene, new THREE.PerspectiveCamera());
  const fillets = snapshot.scene.children.filter(
    (part) => part.name === 'photo-wall-fillet',
  );
  expect(fillets).toHaveLength(4);
  expect(scene.getObjectByName('photo-wall-fillet')).toBeUndefined();
  expect(
    fillets.filter(
      (part) =>
        (part as THREE.Mesh).material instanceof THREE.MeshStandardMaterial &&
        ((part as THREE.Mesh).material as THREE.MeshStandardMaterial)
          .opacity === 0.18,
    ),
  ).toHaveLength(3);
  disposeStudyObject(snapshot.scene);
  content.dispose();
});

test('same-viewport photo and flash finish before returning PNG and release only photo resources', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const live = document.createElement('canvas');
  host.append(live);
  const dispose = vi.fn();
  const loseContext = vi.fn();
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['png'], {type: 'image/png'})),
  );
  vi.spyOn(THREE, 'WebGLRenderer').mockImplementation(
    class {
      domElement = canvas;
      shadowMap = {};
      setPixelRatio = () => {};
      setSize = () => {};
      render = () => {};
      dispose = dispose;
      forceContextLoss = loseContext;
    } as unknown as typeof THREE.WebGLRenderer,
  );
  const snapshot = createPhotoSnapshot(
    new THREE.Scene(),
    new THREE.PerspectiveCamera(38, 1.6),
  );
  const result = renderPhoto(snapshot, host);
  await vi.advanceTimersByTimeAsync(0);
  expect(host.contains(canvas)).toBe(true);
  expect(host.querySelector('.cc-photo-flash')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(220);
  expect((await result).type).toBe('image/png');
  expect(host.children).toHaveLength(1);
  expect(host.firstChild).toBe(live);
  expect(dispose).toHaveBeenCalledOnce();
  expect(loseContext).toHaveBeenCalledOnce();
  host.remove();
  vi.useRealTimers();
});
