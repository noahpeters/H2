import type {CustomUnitDefinition} from './model';

export type CabinetCurve = {
  scope: 'cabinet' | 'front';
  profile: 'arc' | 'rounded-left' | 'rounded-right' | 'rounded-both';
  radius: number;
  direction: 'inward' | 'outward';
};

/** Coordinates use the uncurved cabinet's left/front datum, in inches. */
export function curvePoint(
  unit: CustomUnitDefinition,
  x: number,
  z: number,
): [number, number] {
  const curve = unit.curve;
  if (!curve) return [x, z];
  const half = unit.width / 2;
  const centered = x - half;
  const radius = curve.radius;
  if (curve.profile !== 'arc') {
    const left = curve.profile !== 'rounded-right';
    const right = curve.profile !== 'rounded-left';
    const edge =
      left && x < radius
        ? radius - x
        : right && x > unit.width - radius
          ? x - (unit.width - radius)
          : 0;
    const setback =
      radius -
      Math.sqrt(Math.max(0, radius * radius - Math.min(radius, edge) ** 2));
    return [x, z + setback * Math.max(0, 1 - z / unit.depth)];
  }
  const sign = curve.direction === 'inward' ? 1 : -1;
  const bounded = Math.max(-radius + 0.001, Math.min(radius - 0.001, centered));
  const cosine = Math.sqrt(1 - (bounded / radius) ** 2);
  const bow =
    sign * (radius * cosine - Math.sqrt(radius * radius - half * half));
  if (curve.scope === 'front')
    return [x, z + bow * Math.max(0, 1 - z / unit.depth)];
  return [half + centered - (sign * z * bounded) / radius, bow + z * cosine];
}

export function edgeSetback(
  x: number,
  width: number,
  edges: NonNullable<import('./model').CabinetPart['edges']>,
) {
  const r = edges.radius;
  const left = x < r;
  const reach = left ? Math.max(0, r - x) : Math.max(0, x - (width - r));
  const style = left ? edges.left : edges.right;
  const distance = Math.min(r, reach);
  if (!distance || style === 'square') return 0;
  return style === 'convex'
    ? r - Math.sqrt(Math.max(0, r * r - distance * distance))
    : Math.sqrt(Math.max(0, r * r - (r - distance) * (r - distance)));
}
