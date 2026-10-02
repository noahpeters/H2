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

/** Catalog facts come only from existing selection labels. No finish/texture claims. */
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
