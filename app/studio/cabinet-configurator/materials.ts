export const CABINET_MATERIALS = {
  'rift-white-oak': {label: 'Rift-sawn white oak', color: '#c4aa80'},
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
export function hasMaterialFinish(item: {
  kind: string;
  applianceKind?: string;
  applianceFront?: string;
}) {
  return (
    item.kind !== 'appliance' ||
    (['refrigerator', 'dishwasher'].includes(item.applianceKind ?? '') &&
      ['shaker', 'slab'].includes(item.applianceFront ?? ''))
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
