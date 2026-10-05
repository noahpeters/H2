import {denoisePhoto} from './photoDenoise';
vi.mock('./photoHistory', () => ({
  PhotoRadianceHistory: class {
    samples = 0;
    target = {texture: new THREE.Texture()};
    record = vi.fn(
      async (_renderer: unknown, _texture: unknown, samples: number) => {
        this.samples = samples;
      },
    );
    dispose = vi.fn();
  },
}));
import {finishPhoto} from './photoFinish';
import {afterEach, expect, test, vi} from 'vitest';
import * as pathTracer from 'three-gpu-pathtracer';
import * as THREE from 'three';
import {
  clonePhotoSnapshot,
  createPhotoSnapshot,
  easedGeometry,
  renderPhoto,
} from './photoRender';
import {createMaterial, mapMaterialPart} from './materialRendering';
import {disposeStudyObject, StudyScene} from './studyScene';
import {blankStudy} from './CabinetConfigurator';
import {facePreviewGeometry} from './custom-unit/facePreview';
import type {MaterialDefinition} from './materialDefinition';
import {presetOutline} from './roomOutline';
import {
  addPhotoLighting,
  DEFAULT_PHOTO_SETTINGS,
  visiblePhotoScene,
} from './photoLighting';

vi.mock('./photoGpu', () => ({waitForPhotoGpu: vi.fn()}));
vi.mock('./photoConvergence', async (original) => ({
  ...(await original<typeof import('./photoConvergence')>()),
  PhotoConvergenceProbe: class {
    width = 128;
    async read() {
      return new Float32Array(128 * 64 * 4);
    }
    dispose() {}
  },
}));

vi.mock('./photoFinish', () => ({finishPhoto: vi.fn()}));

vi.mock('./photoDenoise', () => ({denoisePhoto: vi.fn()}));

const pathTracerMock = vi.hoisted(() => ({
  dispose: vi.fn(),
  settings: [] as {randomType: number; contactPaths: number}[],
  stalled: false,
}));
vi.mock('three-gpu-pathtracer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three-gpu-pathtracer')>()),
  WebGLPathTracer: class {
    samples = 0;
    tiles = new THREE.Vector2();
    textureSize = new THREE.Vector2();
    _pathTracer = {
      material: new (
        pathTracer as unknown as {
          PhysicalPathTracingMaterial: new () => THREE.ShaderMaterial;
        }
      ).PhysicalPathTracingMaterial(),
    };
    target = {texture: new THREE.Texture()};
    setScene = vi.fn(() => {
      const material = this._pathTracer.material;
      pathTracerMock.settings.push({
        randomType: material.defines.RANDOM_TYPE,
        contactPaths: material.uniforms.photoContactPaths.value,
      });
    });
    reset = () => {
      this.samples = 0;
    };
    renderSample = () => {
      if (!pathTracerMock.stalled) this.samples += 1;
    };
    dispose = pathTracerMock.dispose;
  },
}));

const definition: MaterialDefinition = {
  version: 1,
  id: 'test',
  label: 'Test',
  substrate: {type: 'paint-grade'},
  finish: {},
  pbr: {color: '#ffffff', roughness: 0.5},
};
afterEach(() => {
  vi.mocked(denoisePhoto).mockClear();
  vi.mocked(finishPhoto).mockClear();
  pathTracerMock.stalled = false;
  pathTracerMock.dispose.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test.each([
  ['quick', 1000, 540000],
  ['standard', 1600, 1215000],
  ['fine', 2400, 2700000],
] as const)(
  'allows the tripled %s rendering budget and reports timeout while restoring the live view',
  async (quality, maxDimension, limit) => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      now += 60000;
      callback(0);
      return 1;
    });
    pathTracerMock.stalled = true;
    const host = document.createElement('div');
    const live = document.createElement('canvas');
    host.append(live);
    const canvas = document.createElement('canvas');
    const dispose = vi.fn(),
      loseContext = vi.fn();
    vi.spyOn(THREE, 'WebGLRenderer').mockImplementation(
      class {
        domElement = canvas;
        extensions = {has: () => true};
        capabilities = {maxTextureSize: 8192};
        getContext = () => ({
          isContextLost: () => false,
          getParameter: () => 8192,
        });
        setPixelRatio = () => {};
        setSize = () => {};
        dispose = dispose;
        forceContextLoss = loseContext;
      } as unknown as typeof THREE.WebGLRenderer,
    );
    const progress = vi.fn();
    await expect(
      renderPhoto(
        createPhotoSnapshot(
          new THREE.Scene(),
          new THREE.PerspectiveCamera(38, 1.6),
        ),
        host,
        {
          ...DEFAULT_PHOTO_SETTINGS,
          maxDimension,
          camera: {...DEFAULT_PHOTO_SETTINGS.camera!, quality},
        },
        {onProgress: progress},
      ),
    ).rejects.toThrow(
      `timed out after ${Math.round(limit / 60000)} minutes (0% complete)`,
    );
    expect(now).toBeGreaterThan(limit);
    expect(now).toBeLessThanOrEqual(limit + 60000);
    expect(progress.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(host.children).toHaveLength(1);
    expect(host.firstChild).toBe(live);
    expect(dispose).toHaveBeenCalledOnce();
    expect(loseContext).toHaveBeenCalledOnce();
  },
);

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

test('wall fillets are photo-only and preserve opaque wall materials', async () => {
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
  for (const fillet of fillets) {
    const box = new THREE.Box3().setFromObject(fillet);
    const {width, depth} = blankStudy().room;
    expect(
      Math.min(
        Math.abs(box.min.x + (width / 2) * 0.0254),
        Math.abs(box.max.x - (width / 2) * 0.0254),
      ),
    ).toBeLessThan(1e-6);
    expect(
      Math.min(
        Math.abs(box.min.z + (depth / 2) * 0.0254),
        Math.abs(box.max.z - (depth / 2) * 0.0254),
      ),
    ).toBeLessThan(1e-6);
  }
  expect(scene.getObjectByName('photo-wall-fillet')).toBeUndefined();
  expect(
    fillets.filter(
      (part) =>
        (part as THREE.Mesh).material instanceof THREE.MeshStandardMaterial &&
        ((part as THREE.Mesh).material as THREE.MeshStandardMaterial)
          .opacity === 1,
    ),
  ).toHaveLength(4);
  disposeStudyObject(snapshot.scene);
  content.dispose();
});

test.each(['rectangle', 'l-shape'] as const)(
  '%s photos use opaque interior walls and hide exterior cutaway walls and openings without changing the live scene',
  async (shape) => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(
      (_url, onLoad) => {
        const texture = new THREE.Texture();
        queueMicrotask(() => onLoad?.(texture));
        return texture;
      },
    );
    const scene = new THREE.Scene();
    const content = new StudyScene(scene);
    const study = blankStudy();
    study.room.outline = presetOutline(study.room, shape);
    study.openings = [
      {
        id: 'near-window',
        kind: 'window',
        wall: 'front',
        offset: 20,
        width: 24,
        height: 30,
        sill: 42,
      },
      {
        id: 'near-door',
        kind: 'door',
        wall: 'right',
        offset: 20,
        width: 30,
        height: 80,
      },
      {
        id: 'far-window',
        kind: 'window',
        wall: 'back',
        offset: 20,
        width: 24,
        height: 30,
        sill: 42,
      },
    ];
    const camera = new THREE.PerspectiveCamera();
    const position = (x: number, z: number) =>
      camera.position.set(
        (x - study.room.width / 2) * 0.0254,
        48 * 0.0254,
        (z - study.room.depth / 2) * 0.0254,
      );
    try {
      await content.update(study);
      const liveWalls = content.root.children[0].children.slice(1);
      const liveMaterials: THREE.Material[] = [];
      scene.traverse((part) => {
        if (part instanceof THREE.Mesh && part.userData.photoSurface === 'wall')
          liveMaterials.push(part.material as THREE.Material);
      });
      const original = liveMaterials.map((m) => [
        m.opacity,
        m.transparent,
        m.depthWrite,
      ]);
      for (const inside of [true, false, true]) {
        // Test the concave outline, not just its rectangular bounds.
        position(
          study.room.width * (inside ? 0.25 : shape === 'l-shape' ? 0.8 : 1.1),
          study.room.depth * (inside ? 0.25 : 0.8),
        );
        const snapshot = createPhotoSnapshot(scene, camera);
        try {
          const walls: THREE.Object3D[] = [];
          const openings: THREE.Object3D[] = [];
          snapshot.scene.traverse((part) => {
            if (part.userData.photoWall) walls.push(part);
            if (
              part.userData.id &&
              study.openings.some((o) => o.id === part.userData.id)
            )
              openings.push(part);
            if (
              part instanceof THREE.Mesh &&
              part.userData.photoSurface === 'wall'
            ) {
              const m = part.material as THREE.Material;
              expect([m.opacity, m.transparent, m.depthWrite]).toEqual([
                1,
                false,
                true,
              ]);
            }
          });
          for (const wall of walls)
            expect(wall.visible).toBe(inside || !wall.userData.cutawayRoomWall);
          expect(openings.map((o) => o.visible)).toEqual([
            inside,
            inside,
            true,
          ]);
          expect(
            snapshot.scene.children.filter(
              (o) => o.name === 'photo-wall-fillet',
            ),
          ).toHaveLength(inside ? 4 : 1);
          addPhotoLighting(snapshot.scene, DEFAULT_PHOTO_SETTINGS);
          const renderScene = visiblePhotoScene(snapshot.scene);
          const lights = renderScene.children.filter(
            (o) => o instanceof THREE.RectAreaLight,
          ) as THREE.RectAreaLight[];
          // Camera cutaways must not remove the near window/door illumination.
          expect(lights.map((o) => [o.name, o.intensity])).toEqual([
            ['photo-opening:near-window:1', 100],
            ['photo-opening:near-door:1', 12],
            ['photo-opening:far-window:1', 100],
          ]);
          const renderObjects: THREE.Object3D[] = [];
          renderScene.traverse((o) => renderObjects.push(o));
          if (!inside)
            expect(renderObjects.some((o) => o.userData.cutawayRoomWall)).toBe(
              false,
            );
          // Interior photos preserve window glass transparency.
          if (inside)
            expect(
              renderObjects.some(
                (o) =>
                  o instanceof THREE.Mesh &&
                  (o.material as THREE.Material).opacity === 0.45,
              ),
            ).toBe(true);
          expect(liveWalls.every((wall) => wall.visible)).toBe(true);
          expect(content.selectable.every((o) => o.visible)).toBe(true);
          expect(
            liveMaterials.map((m) => [m.opacity, m.transparent, m.depthWrite]),
          ).toEqual(original);
          expect(liveMaterials.some((m) => m.opacity === 0.18)).toBe(true);
        } finally {
          disposeStudyObject(snapshot.scene);
        }
      }
    } finally {
      content.dispose();
    }
  },
);

test.each(['standard', 'ultra'] as const)(
  '%s same-viewport photo and flash finish before returning PNG and release only photo resources',
  async (quality) => {
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
        extensions = {has: () => true};
        capabilities = {maxTextureSize: 8192};
        getContext = () => ({
          isContextLost: () => false,
          getParameter: () => 8192,
        });
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
    const completed = vi.fn();
    const settings = structuredClone(DEFAULT_PHOTO_SETTINGS);
    settings.camera!.quality = quality;
    const result = renderPhoto(snapshot, host, settings, {
      onComplete: completed,
    });
    await vi.waitFor(() =>
      expect(host.querySelector('.cc-photo-flash')).not.toBeNull(),
    );
    expect(host.contains(canvas)).toBe(true);
    expect(host.querySelector('.cc-photo-flash')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(220);
    expect((await result).type).toBe('image/png');
    expect(host.children).toHaveLength(1);
    expect(host.firstChild).toBe(live);
    expect(pathTracerMock.settings.at(-1)).toEqual({
      randomType: 2,
      contactPaths: 2,
    });
    expect(completed).toHaveBeenCalledWith(
      expect.objectContaining({
        samples: quality === 'ultra' ? 512 : 64,
        converged: quality !== 'ultra',
      }),
    );
    expect(denoisePhoto).toHaveBeenCalledTimes(1);
    expect(finishPhoto).toHaveBeenCalledOnce();
    expect(pathTracerMock.dispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(loseContext).toHaveBeenCalledOnce();
    host.remove();
    vi.useRealTimers();
  },
);

test('prepared clones preserve exact geometry and UVs and own disposable resources', () => {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 3),
    new THREE.MeshStandardMaterial(),
  );
  scene.add(mesh);
  const snapshot = createPhotoSnapshot(
    scene,
    new THREE.PerspectiveCamera(),
    new THREE.Vector3(1, 2, 3),
  );
  const copy = clonePhotoSnapshot(snapshot);
  const original = snapshot.scene.children[0] as THREE.Mesh;
  const cloned = copy.scene.children[0] as THREE.Mesh;
  expect(cloned.geometry).not.toBe(original.geometry);
  expect(cloned.material).not.toBe(original.material);
  for (const name of ['position', 'normal', 'uv'])
    expect(cloned.geometry.getAttribute(name).array).toEqual(
      original.geometry.getAttribute(name).array,
    );
  expect(copy.camera.projectionMatrix).toEqual(
    snapshot.camera.projectionMatrix,
  );
  expect(copy.target).toEqual(snapshot.target);
  const disposed = vi.spyOn(original.geometry, 'dispose');
  disposeStudyObject(copy.scene);
  expect(disposed).not.toHaveBeenCalled();
  disposeStudyObject(snapshot.scene);
  disposeStudyObject(scene);
});

test('easing preserves translated extrusions and retains independently transformed stock', () => {
  const shape = new THREE.Shape()
    .moveTo(0, 0)
    .lineTo(24, 0)
    .lineTo(24, 18)
    .lineTo(0, 18)
    .closePath();
  const original = new THREE.ExtrudeGeometry(shape, {
    depth: 0.75,
    bevelEnabled: false,
  });
  original.translate(-12, -9, -0.375);
  const unchanged = Array.from(original.getAttribute('position').array);
  const eased = easedGeometry(original, 0.04);
  original.computeBoundingBox();
  eased.computeBoundingBox();
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(eased.boundingBox!.min[axis]).toBeCloseTo(
      original.boundingBox!.min[axis],
      5,
    );
    expect(eased.boundingBox!.max[axis]).toBeCloseTo(
      original.boundingBox!.max[axis],
      5,
    );
  }
  expect(Array.from(original.getAttribute('position').array)).toEqual(
    unchanged,
  );
  for (const transform of [
    new THREE.Matrix4().makeRotationY(0.4),
    new THREE.Matrix4().makeScale(1.2, 0.8, 1),
  ]) {
    const transformed = original.clone().applyMatrix4(transform);
    const photo = easedGeometry(transformed, 0.04);
    expect(photo.getAttribute('position').array).toEqual(
      transformed.getAttribute('position').array,
    );
    expect(photo.getAttribute('normal').array).toEqual(
      transformed.getAttribute('normal').array,
    );
    photo.dispose();
    transformed.dispose();
  }
  original.dispose();
  eased.dispose();
});

test.each(['open', 'doors'] as const)(
  'photo snapshots keep %s cabinet arches attached to the same cabinet and pose',
  async (kind) => {
    const {createCustomUnit} = await import('./custom-unit/model');
    const {customUnitGeometry} = await import('./custom-unit/geometry');
    const unit = createCustomUnit({
      width: 36,
      height: 72,
      depth: 14,
      root: {
        id: 'shelves',
        type: 'section',
        sectionType: kind === 'open' ? 'shelves' : 'doors',
        properties: kind === 'open' ? {shelfCount: 5} : {doorCount: 2},
      },
    });
    unit.frontArch = 'simple';
    const source = new THREE.Scene();
    const cabinet = customUnitGeometry(
      unit,
      {},
      {overlay: 'inset', face: 'shaker-glass', material: 'paint-grade'},
    );
    cabinet.scale.setScalar(0.0254);
    cabinet.rotation.y = 0.7;
    cabinet.position.set(2, 0.3, -1);
    source.add(cabinet);
    source.updateMatrixWorld(true);
    const before = new Map<
      string,
      {matrix: THREE.Matrix4; bounds: THREE.Box3; positions: unknown}
    >();
    cabinet.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      before.set(object.uuid, {
        matrix: object.matrixWorld.clone(),
        bounds: new THREE.Box3().setFromObject(object),
        positions: Array.from(object.geometry.getAttribute('position').array),
      });
    });
    const snapshot = createPhotoSnapshot(source, new THREE.PerspectiveCamera());
    const captured = snapshot.scene.children[0];
    snapshot.scene.updateMatrixWorld(true);
    const liveMeshes: THREE.Mesh[] = [],
      photoMeshes: THREE.Mesh[] = [];
    cabinet.traverse((object) => {
      if (object instanceof THREE.Mesh) liveMeshes.push(object);
    });
    captured.traverse((object) => {
      if (object instanceof THREE.Mesh) photoMeshes.push(object);
    });
    expect(photoMeshes).toHaveLength(liveMeshes.length);
    for (let i = 0; i < liveMeshes.length; i++) {
      const live = liveMeshes[i],
        photo = photoMeshes[i],
        expected = before.get(live.uuid)!;
      expect(photo.matrixWorld.elements).toEqual(expected.matrix.elements);
      const bounds = new THREE.Box3().setFromObject(photo);
      // Edge easing preserves the cabinet assembly envelope within its 1mm radius.
      expect(bounds.min.distanceTo(expected.bounds.min)).toBeLessThan(0.002);
      expect(bounds.max.distanceTo(expected.bounds.max)).toBeLessThan(0.002);
      expect(Array.from(live.geometry.getAttribute('position').array)).toEqual(
        expected.positions,
      );
    }
    const archIndex = liveMeshes.findIndex(
      (mesh) =>
        mesh.name === 'cabinet-face-frame' &&
        mesh.geometry instanceof THREE.ExtrudeGeometry,
    );
    expect(archIndex).toBeGreaterThanOrEqual(0);
    expect(
      photoMeshes[archIndex].geometry.getAttribute('position').count,
    ).toBeGreaterThan(
      liveMeshes[archIndex].geometry.getAttribute('position').count,
    );
    disposeStudyObject(snapshot.scene);
    disposeStudyObject(source);
  },
);
