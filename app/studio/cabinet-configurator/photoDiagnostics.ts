import * as THREE from 'three';
import {PhotoRadianceHistory} from './photoHistory';
import {waitForPhotoGpu} from './photoGpu';
import type {PhotoSettings} from './photoLighting';

/** Lossless little-endian float32 RGBA, bottom row first. Avoid RGBE's lossy channel encoding. */
export function photoFloatBytes(pixels: Float32Array) {
  const bytes = new Uint8Array(pixels.length * 4);
  const view = new DataView(bytes.buffer);
  pixels.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return bytes;
}
async function hash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    Uint8Array.from(bytes).buffer,
  );
  return Array.from(new Uint8Array(digest), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
}

export async function photoManifest(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  settings: PhotoSettings,
  signal?: AbortSignal,
) {
  const meshes: Record<string, unknown>[] = [],
    lights: unknown[] = [];
  const textures = new Map<THREE.Texture, Promise<unknown>>();
  const hashTexture = (texture: THREE.Texture) => {
    let pending = textures.get(texture);
    if (!pending) {
      pending = (async () => {
        const image = texture.image;
        if (!image)
          return {status: 'UNVERIFIED', colorSpace: texture.colorSpace};
        let pixels: Uint8Array;
        if (image.data)
          pixels = new Uint8Array(
            image.data.buffer,
            image.data.byteOffset,
            image.data.byteLength,
          );
        else {
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          if (!context)
            throw new Error('Photo diagnostic texture readback unavailable.');
          context.drawImage(image, 0, 0);
          const data = context.getImageData(
            0,
            0,
            image.width,
            image.height,
          ).data;
          pixels = new Uint8Array(data.buffer);
        }
        return {
          sha256: await hash(pixels),
          basis: 'decoded texture pixels',
          width: image.width,
          height: image.height,
          colorSpace: texture.colorSpace,
        };
      })();
      textures.set(texture, pending);
    }
    return pending;
  };
  scene.updateMatrixWorld(true);
  const parts: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) parts.push(object);
    if (object instanceof THREE.Light)
      lights.push({
        type: object.type,
        name: object.name,
        color: object.color.toArray(),
        intensity: object.intensity,
        matrix: object.matrixWorld.toArray(),
        ...(object instanceof THREE.RectAreaLight
          ? {width: object.width, height: object.height}
          : {}),
      });
  });
  for (const part of parts) {
    signal?.throwIfAborted();
    const attributes: Record<string, unknown> = {};
    for (const [name, attribute] of Object.entries(part.geometry.attributes)) {
      const array = attribute.array;
      attributes[name] = {
        itemSize: attribute.itemSize,
        type: array.constructor.name,
        count: attribute.count,
        sha256: await hash(
          new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
        ),
      };
    }
    const index = part.geometry.index?.array;
    const materials = [];
    for (const value of Array.isArray(part.material)
      ? part.material
      : [part.material]) {
      const material = value as THREE.MeshPhysicalMaterial;
      const maps: Record<string, unknown> = {};
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'aoMap'] as const)
        if (material[slot]) maps[slot] = await hashTexture(material[slot]!);
      materials.push({
        type: material.type,
        definition: material.userData.materialDefinition,
        textureErrors: material.userData.textureErrors,
        color: material.color?.toArray(),
        roughness: material.roughness,
        metalness: material.metalness,
        normalScale: material.normalScale?.toArray(),
        ior: material.ior,
        specularIntensity: material.specularIntensity,
        clearcoat: material.clearcoat,
        clearcoatRoughness: material.clearcoatRoughness,
        transmission: material.transmission,
        opacity: material.opacity,
        side: material.side,
        maps,
      });
    }
    meshes.push({
      name: part.name,
      matrix: part.matrixWorld.toArray(),
      attributes,
      indexSha256: index
        ? await hash(
            new Uint8Array(index.buffer, index.byteOffset, index.byteLength),
          )
        : null,
      groups: part.geometry.groups,
      application: part.geometry.userData.materialApplication,
      materials,
    });
  }
  const capture = {
    version: 1,
    renderer: {
      three: THREE.REVISION,
      pathtracer: '0.0.23',
      sampler: 'fixed spatial ranks / stratified seed 0',
      units: 'metres',
    },
    camera: {
      matrix: camera.matrixWorld.toArray(),
      projection: camera.projectionMatrix.toArray(),
      near: camera.near,
      far: camera.far,
    },
    settings,
    environment: scene.environment
      ? {hash: await hashTexture(scene.environment)}
      : null,
    background:
      scene.background instanceof THREE.Color
        ? scene.background.toArray()
        : null,
    meshes,
    lights,
  };
  return {
    ...capture,
    captureSha256: await hash(
      new TextEncoder().encode(JSON.stringify(capture)),
    ),
  };
}

export async function readPhotoRadiance(
  renderer: THREE.WebGLRenderer,
  image: THREE.Texture,
  width: number,
  height: number,
  signal?: AbortSignal,
) {
  const copy = new PhotoRadianceHistory(width, height);
  try {
    await copy.record(renderer, image, 1, signal);
    const pixels = new Float32Array(width * height * 4);
    await waitForPhotoGpu(renderer.getContext(), signal);
    renderer.readRenderTargetPixels(copy.target, 0, 0, width, height, pixels);
    return pixels;
  } finally {
    copy.dispose();
  }
}

export async function photoDiagnosticZip(
  files: Record<string, Uint8Array>,
  png: Blob,
  metadata: unknown,
) {
  const {zipSync, strToU8} = await import('fflate');
  const bytes = zipSync(
    {
      ...files,
      'final.png': new Uint8Array(await png.arrayBuffer()),
      'capture.json': Uint8Array.from(
        strToU8(JSON.stringify(metadata, null, 2)),
      ),
    },
    {level: 0},
  );
  return new Blob([Uint8Array.from(bytes).buffer], {type: 'application/zip'});
}
