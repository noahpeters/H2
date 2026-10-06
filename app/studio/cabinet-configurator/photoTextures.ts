import * as THREE from 'three';
import type {MaterialDefinition} from './materialDefinition';
import {createMaterial} from './materialRendering';

const DETAIL_FOLDERS = [
  'oak-veneer-02',
  'oak-veneer-05',
  'walnut-veneer',
  'white-maple-veneer',
  'cherry-veneer',
];
export const PHOTO_TEXTURE_BUDGET = 256 * 1024 * 1024;

/** The tracer allocates every source at one shared size. Fit automatic detail
 * to the visible layer count instead of failing a larger room at exactly 2K. */
export function budgetedPhotoTextureResolution(
  scene: THREE.Scene,
  preferred: number,
  maxTextureSize: number,
) {
  const layers = photoTextureBytes(scene, 1) / 4;
  const limit = Math.min(
    preferred,
    maxTextureSize,
    Math.sqrt(PHOTO_TEXTURE_BUDGET / (layers * 4)),
  );
  // Small alignment steps retain most of the 2K source without exceeding budget.
  return Math.max(1024, Math.floor(limit / 128) * 128);
}
export function detailedPhotoDefinition(
  definition: MaterialDefinition,
  resolution: number,
): MaterialDefinition {
  const next = structuredClone(definition);
  if (resolution < 2048) return next;
  const albedo = next.textures?.albedo;
  if (
    albedo &&
    /^\/studio\/materials\/rubio-oil-plus-2c\/(plain-white-oak|rift-white-oak|walnut|maple)-(chocolate|natural|pure|white)\.jpg$/.test(
      albedo.uri,
    )
  )
    albedo.uri = albedo.uri.replace('.jpg', '-2k.jpg');
  for (const slot of ['albedo', 'normal', 'roughness'] as const) {
    const asset = next.textures?.[slot];
    if (
      asset &&
      DETAIL_FOLDERS.some((folder) =>
        asset.uri.startsWith(`/studio/materials/${folder}/`),
      ) &&
      asset.uri.endsWith('_1k.jpg')
    )
      asset.uri = asset.uri.replace('_1k.jpg', '_2k.jpg');
  }
  return next;
}
/** Upgrade only known versions of existing scans, inside an owned render clone. */
export function upgradePhotoTextures(scene: THREE.Scene, resolution: number) {
  if (resolution < 2048) return;
  const copies = new Map<THREE.Material, THREE.Material>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const copy = (original: THREE.Material) => {
      if (copies.has(original)) return copies.get(original)!;
      const definition = original.userData.materialDefinition as
        | MaterialDefinition
        | undefined;
      if (!definition || !(original instanceof THREE.MeshStandardMaterial))
        return original;
      const next = detailedPhotoDefinition(definition, resolution);
      if (JSON.stringify(next.textures) === JSON.stringify(definition.textures))
        return original;
      const material = createMaterial(next, original.roughness);
      material.normalScale.copy(original.normalScale);
      material.aoMapIntensity = original.aoMapIntensity;
      material.opacity = original.opacity;
      material.transparent = original.transparent;
      material.depthWrite = original.depthWrite;
      material.side = original.side;
      copies.set(original, material);
      return material;
    };
    object.material = Array.isArray(object.material)
      ? (object.material as THREE.Material[]).map(copy)
      : copy(object.material);
  });
  copies.forEach((_material, original) => original.dispose());
}
export function photoTextureBytes(scene: THREE.Scene, resolution: number) {
  const sources = new Set<string>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture)
          sources.add(`${value.source.uuid}:${value.colorSpace}`);
  });
  return Math.max(1, sources.size) * resolution * resolution * 4;
}
