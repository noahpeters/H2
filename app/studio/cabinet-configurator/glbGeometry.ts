import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {RoomElement} from './model';
import {GLB_BYTE_LIMIT, validGlbUrl} from './glbObject';
import {validateGlbBytes} from './glbBinary';

const states = new WeakMap<
  THREE.Object3D,
  {ready: Promise<void>; disposed: boolean}
>();
export function disposeGlbResources(object: THREE.Object3D) {
  const resources = new Set<
    THREE.BufferGeometry | THREE.Material | THREE.Texture
  >();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    resources.add(child.geometry);
    for (const material of Array.isArray(child.material)
      ? child.material
      : [child.material]) {
      resources.add(material);
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  resources.forEach((resource) => resource.dispose());
}
async function fetchGlb(url: string): Promise<ArrayBuffer> {
  if (!validGlbUrl(url))
    throw new Error('Use a hosted HTTPS .glb URL or a /path/model.glb URL.');
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 20000);
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      signal: abort.signal,
    });
    if (!response.ok || !response.body)
      throw new Error(
        'Unable to load GLB. Check the URL and cross-origin access.',
      );
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > GLB_BYTE_LIMIT)
          throw new Error('GLB exceeds the 20 MB limit.');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    validateGlbBytes(bytes.buffer);
    return bytes.buffer;
  } finally {
    clearTimeout(timeout);
  }
}
export async function loadGlb(url: string) {
  const bytes = await fetchGlb(url);
  const model = await new GLTFLoader().parseAsync(bytes, '');
  const sceneExtras: THREE.Object3D[] = [];
  model.scene.traverse((child) => {
    if (child instanceof THREE.Light || child instanceof THREE.Camera)
      sceneExtras.push(child);
  });
  sceneExtras.forEach((child) => child.removeFromParent());
  model.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.scene);
  const size = bounds.getSize(new THREE.Vector3());
  let meshes = 0;
  model.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes++;
  });
  if (
    !meshes ||
    [size.x, size.y, size.z].some((n) => !Number.isFinite(n) || n <= 0)
  ) {
    disposeGlbResources(model.scene);
    throw new Error(
      'GLB must contain visible 3D geometry with nonzero width, depth and height.',
    );
  }
  return {scene: model.scene, bounds, size};
}
export async function measureGlb(url: string) {
  const model = await loadGlb(url);
  try {
    return {
      width: model.size.x / 0.0254,
      depth: model.size.z / 0.0254,
      height: model.size.y / 0.0254,
    };
  } finally {
    disposeGlbResources(model.scene);
  }
}
/** Each instance owns its loaded meshes/materials. Dragging reuses the same group. */
export function glbObjectGeometry(item: RoomElement) {
  const group = new THREE.Group();
  const instance = item.libraryObject!;
  group.userData.objectLibrary = {
    libraryId: instance.definition.libraryId,
    objectId: instance.definition.id,
  };
  const state = {ready: Promise.resolve(), disposed: false};
  states.set(group, state);
  state.ready = loadGlb(instance.asset.url)
    .then((model) => {
      if (state.disposed) {
        disposeGlbResources(model.scene);
        return;
      }
      if (
        Math.abs(model.size.z / model.size.x - item.depth / item.width) >
          0.00001 ||
        Math.abs(model.size.y / model.size.x - item.height / item.width) >
          0.00001
      ) {
        disposeGlbResources(model.scene);
        throw new Error(
          'Model proportions changed at this URL. Remove and reimport it.',
        );
      }
      const centered = new THREE.Group();
      centered.add(model.scene);
      model.scene.position.sub(model.bounds.getCenter(new THREE.Vector3()));
      const scale = (item.width * 0.0254) / model.size.x;
      centered.scale.setScalar(scale);
      model.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      group.add(centered);
    })
    .catch((error: unknown) => {
      if (state.disposed) return;
      group.userData.glbError =
        error instanceof Error ? error.message : 'Unable to load GLB.';
      const placeholder = new THREE.Mesh(
        new THREE.BoxGeometry(
          item.width * 0.0254,
          item.height * 0.0254,
          item.depth * 0.0254,
        ),
        new THREE.MeshBasicMaterial({color: 0xb64c42, wireframe: true}),
      );
      group.add(placeholder);
    });
  return group;
}
export function waitForGlbObject(object: THREE.Object3D) {
  return states.get(object)?.ready ?? Promise.resolve();
}
export function releaseGlbObject(object: THREE.Object3D) {
  const state = states.get(object);
  if (state) state.disposed = true;
}
