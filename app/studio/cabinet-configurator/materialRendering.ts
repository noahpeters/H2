import type {FlatGrain} from './designMaterials';
import * as THREE from 'three';
import {resolveCabinetMaterial, type MaterialSelection} from './materials';
import {
  metersPerUnit,
  type GrainAxis,
  type LengthUnit,
  type MaterialApplication,
  type MaterialDefinition,
  type TextureAsset,
} from './materialDefinition';

export type PartRole =
  | 'door'
  | 'drawer'
  | 'stile'
  | 'rail'
  | 'shelf'
  | 'end'
  | 'drawer-side'
  | 'board';

/** Local X = width, Y = height, Z = depth. Scene rotations do not change grain. */
export function resolvePartApplication(
  role: PartRole,
  dimensions: {width: number; height: number; depth: number},
  application: MaterialApplication = {},
): Required<Pick<MaterialApplication, 'grainAxis' | 'rotation'>> &
  MaterialApplication {
  const grainAxis =
    role === 'drawer-side'
      ? 'z'
      : ['drawer', 'rail', 'shelf'].includes(role)
        ? 'x'
        : ['door', 'stile', 'end'].includes(role)
          ? 'y'
          : dimensions.height <= Math.min(dimensions.width, dimensions.depth)
            ? 'x'
            : 'y';
  return {
    ...application,
    grainAxis: ['rail', 'stile', 'drawer-side'].includes(role)
      ? grainAxis
      : (application.grainAxis ?? grainAxis),
    rotation: ['rail', 'stile', 'drawer-side'].includes(role)
      ? 0
      : (application.rotation ?? 0),
  };
}

/** UV-only stock-space projection. Does not modify positions, normals or transforms.
 * U runs across grain; V along grain. On end faces the normal-parallel grain
 * axis falls back to the first in-plane axis. No invented end-grain texture.
 */
export function applyMaterialUVs(
  geometry: THREE.BufferGeometry,
  definition: MaterialDefinition,
  application: MaterialApplication,
  geometryUnit: LengthUnit,
) {
  if (!definition.textureSize) return;
  const size = definition.textureSize;
  const width = size.width * metersPerUnit[size.unit];
  const height = size.height * metersPerUnit[size.unit];
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const grain = geometry.getAttribute('materialGrainAxis');
  const fixed = geometry.getAttribute('materialFixedGrain');
  const uv = new THREE.Float32BufferAttribute(
    new Float32Array(position.count * 2),
    2,
  );
  const axes: GrainAxis[] = ['x', 'y', 'z'];
  const angle = ((application.rotation ?? 0) * Math.PI) / 180;
  const offset = application.offset;
  for (let i = 0; i < position.count; i++) {
    const n = [
      Math.abs(normal.getX(i)),
      Math.abs(normal.getY(i)),
      Math.abs(normal.getZ(i)),
    ];
    const faceAxis = n.indexOf(Math.max(...n));
    const plane = [0, 1, 2].filter((axis) => axis !== faceAxis);
    const locked = fixed?.getX(i) === 1;
    const along = axes.indexOf(
      locked && grain
        ? axes[grain.getX(i)]
        : (application.grainAxis ?? (grain ? axes[grain.getX(i)] : 'y')),
    );
    const vAxis = plane.includes(along) ? along : plane[0];
    const uAxis = plane.find((axis) => axis !== vAxis)!;
    const p = [position.getX(i), position.getY(i), position.getZ(i)];
    const u = p[uAxis] * metersPerUnit[geometryUnit];
    const v = p[vAxis] * metersPerUnit[geometryUnit];
    const rotation = locked ? 0 : angle;
    uv.setXY(
      i,
      (u * Math.cos(rotation) -
        v * Math.sin(rotation) +
        (offset ? offset.u * metersPerUnit[offset.unit] : 0)) /
        width,
      (u * Math.sin(rotation) +
        v * Math.cos(rotation) +
        (offset ? offset.v * metersPerUnit[offset.unit] : 0)) /
        height,
    );
  }
  geometry.setAttribute('uv', uv);
  // Explicit channel 0 for AO as well; do not depend on undocumented UV2 defaults.
}

type LoadedTexture = {
  texture: THREE.Texture;
  ready: Promise<boolean>;
  references: number;
};
// Texture transforms are configured once. Every part's orientation/scale lives in UVs.
const textureCache = new Map<string, LoadedTexture>();
const materialLoads = new WeakMap<THREE.Material, Promise<unknown>>();

function configureTexture(texture: THREE.Texture, albedo: boolean) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  texture.center.set(0, 0);
  texture.rotation = 0;
  texture.matrixAutoUpdate = true;
  texture.colorSpace = albedo ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.channel = 0;
  texture.needsUpdate = true;
}

function acquireTexture(asset: TextureAsset, albedo: boolean) {
  const key = `${albedo ? 'srgb' : 'data'}:${asset.uri}`;
  let entry = textureCache.get(key);
  if (!entry) {
    let complete!: (success: boolean) => void;
    const ready = new Promise<boolean>((resolve) => {
      complete = resolve;
    });
    const texture = new THREE.TextureLoader().load(
      asset.uri,
      () => complete(true),
      undefined,
      () => complete(false),
    );
    configureTexture(texture, albedo);
    entry = {texture, ready, references: 0};
    textureCache.set(key, entry);
  }
  entry.references++;
  const owned = entry;
  return {
    ...owned,
    release() {
      if (--owned.references === 0) {
        textureCache.delete(key);
        owned.texture.dispose();
      }
    },
  };
}

/** Static previews must wait before capturing pixels; failures resolve to fallback. */
export async function waitForMaterialTextures(object: THREE.Object3D) {
  const pending = new Set<Promise<unknown>>();
  object.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return;
    const materials = Array.isArray(part.material)
      ? part.material
      : [part.material];
    for (const material of materials) {
      const ready = materialLoads.get(material);
      if (ready) pending.add(ready);
    }
  });
  await Promise.all(pending);
}

export function createMaterial(
  definition: MaterialDefinition,
  legacyRoughness: number,
  textureSource?: (asset: TextureAsset) => THREE.Texture,
): THREE.MeshStandardMaterial {
  const pbr = definition.pbr;
  const properties = {
    color: pbr.color,
    roughness: pbr.roughness ?? legacyRoughness,
    metalness: pbr.metalness ?? 0,
  };
  const material =
    pbr.ior !== undefined || pbr.specularIntensity !== undefined
      ? new THREE.MeshPhysicalMaterial({
          ...properties,
          ior: pbr.ior,
          specularIntensity: pbr.specularIntensity,
        })
      : new THREE.MeshStandardMaterial(properties);
  material.userData.materialDefinition = definition;
  const release: (() => void)[] = [];
  const pending: Promise<unknown>[] = [];
  let disposed = false;
  const slots = {
    albedo: 'map',
    normal: 'normalMap',
    roughness: 'roughnessMap',
    ao: 'aoMap',
  } as const;
  for (const [slot, property] of Object.entries(slots)) {
    const asset = definition.textures?.[slot as keyof typeof slots];
    if (!asset) continue;
    // Custom providers keep independent transforms. The built-in cache owns its
    // immutable slot configuration and reference-counts shared GPU resources.
    const resource = textureSource
      ? (() => {
          const texture = textureSource(asset).clone();
          configureTexture(texture, slot === 'albedo');
          return {
            texture,
            ready: Promise.resolve(true),
            release: () => texture.dispose(),
          };
        })()
      : acquireTexture(asset, slot === 'albedo');
    release.push(resource.release);
    material[property] = resource.texture;
    if (slot === 'albedo') material.color.set(pbr.albedoTint ?? pbr.color);
    pending.push(
      resource.ready.then((success) => {
        if (success || disposed) return;
        material[property] = null;
        if (slot === 'albedo') material.color.set(pbr.color);
        material.needsUpdate = true;
        material.userData.textureErrors = [
          ...(material.userData.textureErrors ?? []),
          asset.uri,
        ];
      }),
    );
  }
  materialLoads.set(material, Promise.all(pending));
  material.addEventListener('dispose', () => {
    if (disposed) return;
    disposed = true;
    release.forEach((dispose) => dispose());
  });
  return material;
}

export function createCabinetMaterial(
  item: MaterialSelection,
  legacyRoughness: number,
) {
  const material = createMaterial(
    resolveCabinetMaterial(item),
    legacyRoughness,
  );
  material.userData.flatGrain = item.flatGrain;
  return material;
}

/** Motion-generated boards retain maps independently of their template lifetime. */
export function materialFromTemplate(template: THREE.Material) {
  const definition = template.userData.materialDefinition as
    | MaterialDefinition
    | undefined;
  const material =
    definition && template instanceof THREE.MeshStandardMaterial
      ? createMaterial(definition, template.roughness)
      : template.clone();
  material.userData.flatGrain = template.userData.flatGrain;
  return material;
}

export function mapMaterialPart(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  dimensions: {width: number; height: number; depth: number},
  unit: LengthUnit,
  role: PartRole = 'board',
  application?: MaterialApplication,
) {
  const definition = material.userData.materialDefinition as
    | MaterialDefinition
    | undefined;
  const flatGrain = material.userData.flatGrain as FlatGrain | undefined;
  const locked = ['rail', 'stile', 'drawer-side'].includes(role);
  const thinAxis =
    dimensions.width < Math.min(dimensions.height, dimensions.depth)
      ? 'x'
      : dimensions.height < dimensions.depth
        ? 'y'
        : 'z';
  const designApplication =
    !locked && flatGrain && flatGrain !== 'automatic'
      ? {
          grainAxis: (flatGrain === 'horizontal'
            ? thinAxis === 'x'
              ? 'z'
              : 'x'
            : thinAxis === 'y'
              ? 'z'
              : 'y') as GrainAxis,
          rotation: 0 as const,
        }
      : application;
  const resolved = resolvePartApplication(role, dimensions, designApplication);
  if (definition)
    applyMaterialUVs(
      geometry,
      definition,
      {
        ...resolved,
        grainAxis:
          (locked ? resolved.grainAxis : designApplication?.grainAxis) ??
          (geometry.hasAttribute('materialGrainAxis')
            ? undefined
            : resolved.grainAxis),
      },
      unit,
    );
  geometry.userData.materialApplication = {
    mapping: 'local-planar',
    role,
    unit,
    dimensions: {
      width: dimensions.width,
      height: dimensions.height,
      depth: dimensions.depth,
    },
    ...resolved,
  };
}
