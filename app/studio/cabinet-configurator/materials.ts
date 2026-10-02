import type {MaterialDefinition} from './materialDefinition';
export const CABINET_MATERIALS = {
  'rift-white-oak': {label: 'Rift-sawn white oak', color: '#c4aa80'},
  'plain-white-oak': {label: 'Plain-sawn white oak', color: '#c4aa80'},
  walnut: {label: 'Walnut', color: '#72513d'},
  maple: {label: 'Maple', color: '#dfcba4'},
  cherry: {label: 'Cherry', color: '#ad7150'},
  'paint-grade': {label: 'Paint grade', color: '#f2f0e9'},
} as const;
// Original visualization colors, not reproductions of a branded paint catalog.
export const CABINET_PAINTS = {
  white: {label: 'White', color: '#f2f0e9'},
  'warm-cream': {label: 'Warm cream', color: '#e8ddc5'},
  'sage-green': {label: 'Sage green', color: '#929d86'},
  'warm-gray': {label: 'Warm gray', color: '#aaa59b'},
  'navy-blue': {label: 'Navy blue', color: '#2d4054'},
} as const;
export type CabinetMaterial = keyof typeof CABINET_MATERIALS;
export type CabinetPaint = keyof typeof CABINET_PAINTS;

/** Substrate selections are design intent; texture provenance records source limitations. */
export const CABINET_MATERIAL_DEFINITIONS: Record<
  CabinetMaterial,
  MaterialDefinition
> = Object.fromEntries(
  Object.entries(CABINET_MATERIALS).map(([id, entry]) => [
    id,
    {
      version: 1,
      id,
      label: entry.label,
      substrate: {
        type: id === 'paint-grade' ? 'paint-grade' : 'wood',
        ...(id === 'paint-grade'
          ? {}
          : {species: id.includes('white-oak') ? 'White oak' : entry.label}),
        cut:
          id === 'rift-white-oak'
            ? 'rift-sawn'
            : id === 'plain-white-oak'
              ? 'plain-sawn'
              : 'unspecified',
      },
      finish: {},
      pbr: {color: entry.color},
    },
  ]),
) as Record<CabinetMaterial, MaterialDefinition>;

const whiteOakAsset = (slot: string) => ({
  uri: `/studio/materials/white-oak-veneer/white_oak_veneer_${slot}_1k.jpg`,
  provenance: {
    source: 'https://polyhaven.com/a/white_oak_veneer',
    license: 'CC0-1.0',
    notes:
      'Raw white oak veneer preview. The texture source does not specify the saw cut; no finish system is represented.',
  },
});
CABINET_MATERIAL_DEFINITIONS['plain-white-oak'] = {
  ...CABINET_MATERIAL_DEFINITIONS['plain-white-oak'],
  // Neutral albedo and roughness multipliers, not measured finish parameters.
  pbr: {color: '#c4aa80', albedoTint: '#ffffff', roughness: 1},
  textures: {
    albedo: whiteOakAsset('diff'),
    normal: whiteOakAsset('nor_gl'),
    roughness: whiteOakAsset('rough'),
    ao: whiteOakAsset('ao'),
  },
  textureSize: {width: 500, height: 500, unit: 'mm'},
};

export type MaterialSelection = {
  material?: CabinetMaterial;
  paintColor?: CabinetPaint;
  /** Optional versioned snapshot, persisted with the design. Identity matches selection. */
  materialDefinition?: MaterialDefinition;
};

export function resolveCabinetMaterial(
  item: MaterialSelection,
): MaterialDefinition {
  const id = item.material ?? 'rift-white-oak';
  const definition =
    item.materialDefinition?.id === id
      ? item.materialDefinition
      : CABINET_MATERIAL_DEFINITIONS[id];
  // Never mutate either the saved snapshot or the shared catalog entry.
  return {
    ...definition,
    pbr: {
      ...definition.pbr,
      color: id === 'paint-grade' ? cabinetColor(item) : definition.pbr.color,
    },
  };
}

export function materialPreviewNote(item: MaterialSelection) {
  return resolveCabinetMaterial(item).textures?.albedo?.provenance.notes;
}
export function hasMaterialFinish(item: {
  kind: string;
  applianceKind?: string;
  applianceFront?: string;
}) {
  return (
    (item.kind !== 'appliance' && item.kind !== 'fixture') ||
    (['refrigerator', 'dishwasher'].includes(item.applianceKind ?? '') &&
      ['shaker', 'slab', 'vertical-slat'].includes(item.applianceFront ?? ''))
  );
}
export function cabinetColor(item: {
  material?: CabinetMaterial;
  paintColor?: CabinetPaint;
}) {
  const material = item.material ?? 'rift-white-oak';
  return material === 'paint-grade'
    ? CABINET_PAINTS[item.paintColor ?? 'white'].color
    : CABINET_MATERIALS[material].color;
}
