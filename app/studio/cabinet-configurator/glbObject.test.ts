import {afterEach, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {blankStudy} from './CabinetConfigurator';
import {cabinetTypes} from './cabinetTypes';
import {validStudy} from './savedRoomProtocol';
import {
  createGlbObject,
  resizeGlbObject,
  validGlbUrl,
  GLB_BYTE_LIMIT,
} from './glbObject';
import {
  measureGlb,
  glbObjectGeometry,
  waitForGlbObject,
  releaseGlbObject,
  disposeGlbResources,
} from './glbGeometry';
import {validateGlbBytes} from './glbBinary';
import {glbFixture} from './__tests__/glbFixture';
import {StudyScene} from './studyScene';
import {resolveFabrication} from './fabrication/resolve';
import {DEFAULT_CONSTRUCTION} from './fabrication/profile';
import {projectSchedule} from '../../../services/cabinet-rooms/pricing';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const url = 'https://example.com/model.glb';
const dimensions = {width: 10, depth: 30, height: 20};
const object = () =>
  createGlbObject('Our model', url, dimensions, 'model-1', blankStudy().room);
const serve = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(glbFixture())),
  );

it('rejects ephemeral, insecure, ambiguous and external-resource model references', () => {
  expect(validGlbUrl(url)).toBe(true);
  expect(validGlbUrl('/models/object.glb?version=2')).toBe(true);
  for (const value of [
    'model.glb',
    'blob:local',
    'data:model/gltf-binary;base64,AAA',
    '//example.com/model.glb',
    'http://example.com/model.glb',
    'https://user:secret@example.com/model.glb',
    'https://example.com/model.gltf',
  ])
    expect(validGlbUrl(value)).toBe(false);
  expect(() => validateGlbBytes(glbFixture())).not.toThrow();
  expect(() =>
    validateGlbBytes(
      glbFixture({images: [{uri: 'https://other.example/texture.png'}]}),
    ),
  ).toThrow('self-contained');
  expect(() =>
    validateGlbBytes(
      glbFixture({buffers: [{byteLength: 36, uri: 'buffer.bin'}]}),
    ),
  ).toThrow('self-contained');
  expect(() =>
    validateGlbBytes(
      glbFixture({extensionsUsed: ['KHR_draco_mesh_compression']}),
    ),
  ).toThrow('compression');
  expect(() => validateGlbBytes(new ArrayBuffer(20))).toThrow('valid GLB');
});

it('loads actual GLB bytes, centers geometry, keeps materials and scales uniformly', async () => {
  serve();
  const measured = await measureGlb(url);
  expect(measured.width).toBeCloseTo(10, 4);
  expect(measured.height).toBeCloseTo(20, 4);
  expect(measured.depth).toBeCloseTo(30, 4);
  const item = object();
  resizeGlbObject(item, 20);
  const group = glbObjectGeometry(item);
  await waitForGlbObject(group);
  const bounds = new THREE.Box3().setFromObject(group);
  expect(bounds.getCenter(new THREE.Vector3()).length()).toBeCloseTo(0);
  const size = bounds.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(20 * 0.0254);
  expect(size.y).toBeCloseTo(40 * 0.0254);
  expect(size.z).toBeCloseTo(60 * 0.0254);
  let material: THREE.MeshStandardMaterial | undefined;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh)
      material = child.material as THREE.MeshStandardMaterial;
  });
  expect(material!.color.toArray()).toEqual([0.2, 0.4, 0.6]);
  expect(group.userData.objectLibrary).toEqual({
    libraryId: 'design-objects',
    objectId: 'glb-object:model-1',
  });
  disposeGlbResources(group);
});

it('round trips saved models and excludes GLBs from cabinet fabrication and costing', () => {
  const item = object();
  resizeGlbObject(item, 20);
  const study = {...blankStudy(), elements: [item]};
  expect(validStudy(JSON.parse(JSON.stringify(study)))).toBe(true);
  expect(validStudy({...study, elements: [{...item, height: 50}]})).toBe(false);
  expect(
    validStudy({...study, elements: [{...item, libraryObject: undefined}]}),
  ).toBe(false);
  const foreign = structuredClone(item);
  foreign.libraryObject!.definition.tenantId = 'other-business';
  expect(validStudy({...study, elements: [foreign]})).toBe(false);
  expect(projectSchedule(study).lines).toEqual([]);
  expect(() =>
    resolveFabrication(
      study,
      {slug: 'a'.repeat(32), revision: 1, updatedAt: '2026-10-07T00:00:00Z'},
      DEFAULT_CONSTRUCTION,
    ),
  ).toThrow('no cabinet parts');
  const cabinet = cabinetTypes()[0].item;
  const fabrication = resolveFabrication(
    {...study, elements: [cabinet, item]},
    {slug: 'a'.repeat(32), revision: 1, updatedAt: '2026-10-07T00:00:00Z'},
    DEFAULT_CONSTRUCTION,
  );
  expect(fabrication.assemblies.map((assembly) => assembly.id)).toEqual([
    cabinet.id,
  ]);
  expect(fabrication.parts.length).toBeGreaterThan(0);
});

it('reuses loaded models during dragging and blocks photos when a model fails', async () => {
  serve();
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(
    (_url, onLoad) => {
      const texture = new THREE.Texture();
      queueMicrotask(() => onLoad?.(texture));
      return texture;
    },
  );
  const scene = new StudyScene(new THREE.Scene());
  const study = {...blankStudy(), elements: [object()]};
  await scene.update(study);
  const model = scene.selectable[0];
  expect(scene.ready).toBe(true);
  study.elements[0].placement = {mode: 'floor', x: 60, z: 40, rotation: 90};
  await scene.update(study);
  expect(scene.selectable[0]).toBe(model);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(model.rotation.y).toBeCloseTo(-Math.PI / 2);
  vi.mocked(fetch).mockResolvedValue(new Response(null, {status: 404}));
  study.elements[0].libraryObject!.loadRevision = 1;
  await scene.update(study);
  expect(scene.assetErrors[0]).toContain('Unable to load GLB');
  expect(scene.ready).toBe(false);
  scene.dispose();
});

it('does not attach a late model to an already disposed instance', async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const group = glbObjectGeometry(object());
  releaseGlbObject(group);
  resolve(new Response(glbFixture()));
  await waitForGlbObject(group);
  expect(group.children).toHaveLength(0);
});

it('cancels a streamed asset at the size limit', async () => {
  const cancel = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(GLB_BYTE_LIMIT + 1));
            },
            cancel,
          }),
        ),
    ),
  );
  await expect(measureGlb(url)).rejects.toThrow('20 MB');
  expect(cancel).toHaveBeenCalled();
});
