/** JSON-only specifications. Missing fields mean unspecified, not measured facts. */
export type LengthUnit = 'in' | 'mm' | 'm';
export type GrainAxis = 'x' | 'y' | 'z';
export type MaterialApplication = {
  grainAxis?: GrainAxis;
  rotation?: 0 | 90 | 180 | 270;
  offset?: {u: number; v: number; unit: LengthUnit};
};
export type TextureAsset = {
  uri: string;
  provenance: {source: string; license: string; notes?: string};
};
export type MaterialDefinition = {
  version: 1;
  id: string;
  label: string;
  substrate: {
    type:
      | 'wood'
      | 'solid-wood'
      | 'plywood'
      | 'mdf'
      | 'particleboard'
      | 'paint-grade'
      | 'unspecified';
    species?: string;
    cut?: 'rift-sawn' | 'plain-sawn' | 'unspecified';
  };
  finish: {system?: string; color?: string};
  /** Preview values are inherited from the designer; they are not finish measurements. */
  pbr: {
    color: string;
    /** Optional neutral/color multiplier for an albedo map; color is the fallback. */
    albedoTint?: string;
    roughness?: number;
    metalness?: number;
    ior?: number;
    specularIntensity?: number;
  };
  textures?: {
    albedo?: TextureAsset;
    normal?: TextureAsset;
    roughness?: TextureAsset;
    ao?: TextureAsset;
  };
  /** One tile: width across grain, height along grain. Shared by all slots. */
  textureSize?: {width: number; height: number; unit: LengthUnit};
  /** Source image direction along grain; independent of each part's grain axis. */
  textureGrainAxis?: 'u' | 'v';
};

export const metersPerUnit: Record<LengthUnit, number> = {
  in: 0.0254,
  mm: 0.001,
  m: 1,
};
const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === 'object' && !Array.isArray(v));
const text = (v: unknown) =>
  typeof v === 'string' && v.length > 0 && v.length <= 2000;
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const unit = (v: unknown): v is LengthUnit =>
  v === 'in' || v === 'mm' || v === 'm';

export function validMaterialApplication(value: unknown): boolean {
  if (value === undefined) return true;
  if (!object(value)) return false;
  return (
    (value.grainAxis === undefined ||
      ['x', 'y', 'z'].includes(String(value.grainAxis))) &&
    (value.rotation === undefined ||
      (finite(value.rotation) && [0, 90, 180, 270].includes(value.rotation))) &&
    (value.offset === undefined ||
      (object(value.offset) &&
        finite(value.offset.u) &&
        finite(value.offset.v) &&
        unit(value.offset.unit)))
  );
}

export function validMaterialDefinition(
  value: unknown,
): value is MaterialDefinition {
  if (
    !object(value) ||
    value.version !== 1 ||
    !text(value.id) ||
    !text(value.label)
  )
    return false;
  const {substrate, finish, pbr, textures, textureSize, textureGrainAxis} =
    value;
  if (
    textureGrainAxis !== undefined &&
    !['u', 'v'].includes(String(textureGrainAxis))
  )
    return false;
  if (
    !object(substrate) ||
    ![
      'wood',
      'solid-wood',
      'plywood',
      'mdf',
      'particleboard',
      'paint-grade',
      'unspecified',
    ].includes(String(substrate.type)) ||
    (substrate.species !== undefined && !text(substrate.species)) ||
    (substrate.cut !== undefined &&
      !['rift-sawn', 'plain-sawn', 'unspecified'].includes(
        String(substrate.cut),
      ))
  )
    return false;
  if (
    !object(finish) ||
    (finish.system !== undefined && !text(finish.system)) ||
    (finish.color !== undefined && !text(finish.color))
  )
    return false;
  if (
    !object(pbr) ||
    typeof pbr.color !== 'string' ||
    !/^#[a-f0-9]{6}$/i.test(pbr.color)
  )
    return false;
  if (
    pbr.albedoTint !== undefined &&
    (typeof pbr.albedoTint !== 'string' ||
      !/^#[a-f0-9]{6}$/i.test(pbr.albedoTint))
  )
    return false;
  for (const key of ['roughness', 'metalness', 'specularIntensity'] as const) {
    const n = pbr[key];
    if (n !== undefined && (!finite(n) || n < 0 || n > 1)) return false;
  }
  if (
    pbr.ior !== undefined &&
    (!finite(pbr.ior) || pbr.ior < 1 || pbr.ior > 2.333)
  )
    return false;
  if (
    textureSize !== undefined &&
    (!object(textureSize) ||
      !finite(textureSize.width) ||
      textureSize.width <= 0 ||
      !finite(textureSize.height) ||
      textureSize.height <= 0 ||
      !unit(textureSize.unit))
  )
    return false;
  if (textures !== undefined) {
    if (!object(textures)) return false;
    for (const [slot, asset] of Object.entries(textures)) {
      if (
        !['albedo', 'normal', 'roughness', 'ao'].includes(slot) ||
        !object(asset) ||
        typeof asset.uri !== 'string' ||
        !/^(\/(?!\/)|https:\/\/)/.test(asset.uri) ||
        !object(asset.provenance) ||
        !text(asset.provenance.source) ||
        !text(asset.provenance.license) ||
        (asset.provenance.notes !== undefined && !text(asset.provenance.notes))
      )
        return false;
    }
    if (Object.keys(textures).length && textureSize === undefined) return false;
  }
  return true;
}
