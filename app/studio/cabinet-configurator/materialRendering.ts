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
    grainAxis: application.grainAxis ?? grainAxis,
    rotation: application.rotation ?? 0,
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
    const along = axes.indexOf(
      application.grainAxis ?? (grain ? axes[grain.getX(i)] : 'y'),
    );
    const vAxis = plane.includes(along) ? along : plane[0];
    const uAxis = plane.find((axis) => axis !== vAxis)!;
    const p = [position.getX(i), position.getY(i), position.getZ(i)];
    const u = p[uAxis] * metersPerUnit[geometryUnit];
    const v = p[vAxis] * metersPerUnit[geometryUnit];
    uv.setXY(
      i,
      (u * Math.cos(angle) -
        v * Math.sin(angle) +
        (offset ? offset.u * metersPerUnit[offset.unit] : 0)) /
        width,
      (u * Math.sin(angle) +
        v * Math.cos(angle) +
        (offset ? offset.v * metersPerUnit[offset.unit] : 0)) /
        height,
    );
  }
  geometry.setAttribute('uv', uv);
  // Explicit channel 0 for AO as well; do not depend on undocumented UV2 defaults.
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
  const owned: THREE.Texture[] = [];
  const slots = {
    albedo: 'map',
    normal: 'normalMap',
    roughness: 'roughnessMap',
    ao: 'aoMap',
  } as const;
  for (const [slot, property] of Object.entries(slots)) {
    const asset = definition.textures?.[slot as keyof typeof slots];
    if (!asset) continue;
    // A provider may cache sources. Clone its texture before setting slot semantics.
    // The default loader creates a dedicated texture and uploads when loading completes.
    const texture = textureSource
      ? textureSource(asset).clone()
      : new THREE.TextureLoader().load(
          asset.uri,
          () => {
            texture.needsUpdate = true;
          },
          undefined,
          () => {
            material[property] = null;
            material.needsUpdate = true;
            material.userData.textureErrors = [
              ...(material.userData.textureErrors ?? []),
              asset.uri,
            ];
          },
        );
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
    texture.center.set(0, 0);
    texture.rotation = 0;
    texture.matrixAutoUpdate = true;
    texture.colorSpace =
      slot === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.channel = 0;
    texture.needsUpdate = true;
    owned.push(texture);
    material[property] = texture;
  }
  let disposed = false;
  material.addEventListener('dispose', () => {
    if (disposed) return;
    disposed = true;
    owned.forEach((texture) => texture.dispose());
  });
  return material;
}

export function createCabinetMaterial(
  item: MaterialSelection,
  legacyRoughness: number,
) {
  return createMaterial(resolveCabinetMaterial(item), legacyRoughness);
}

/** Motion-generated boards own their maps; disposing a template cannot dispose them. */
export function materialFromTemplate(template: THREE.Material) {
  const definition = template.userData.materialDefinition as
    | MaterialDefinition
    | undefined;
  return definition && template instanceof THREE.MeshStandardMaterial
    ? createMaterial(definition, template.roughness)
    : template.clone();
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
  const resolved = resolvePartApplication(role, dimensions, application);
  if (definition)
    applyMaterialUVs(
      geometry,
      definition,
      {
        ...resolved,
        grainAxis:
          application?.grainAxis ??
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
