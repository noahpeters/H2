import type {RoomElement} from './model';
import type {CabinetPart} from './custom-unit/model';

export const COMBINATION_FACE_STYLES = {
  'flat-shaker': 'Top: Flat / Lower: Shaker',
  'beaded-flat-beaded-shaker': 'Top: Beaded Flat / Lower: Beaded Shaker',
  'flat-beaded-shaker': 'Top: Flat / Lower: Beaded Shaker',
} as const;
export type CombinationFace = keyof typeof COMBINATION_FACE_STYLES;
export type AtomicFace = NonNullable<CabinetPart['faceStyle']>;
export const combinationProfiles: Record<
  CombinationFace,
  readonly [AtomicFace, AtomicFace]
> = {
  'flat-shaker': ['slab', 'shaker'],
  'beaded-flat-beaded-shaker': ['beaded-flat', 'beaded-shaker'],
  'flat-beaded-shaker': ['slab', 'beaded-shaker'],
};
export function isCombinationFace(face?: string): face is CombinationFace {
  return Object.prototype.hasOwnProperty.call(combinationProfiles, face ?? '');
}
/** Highest physical row wins, with a tolerance for fitted/arched coordinates.
 * A single row uses the top profile. Explicit face overrides always win. */
export function resolveFaceRows<
  T extends {top: number; faceStyle?: AtomicFace; eligible?: boolean},
>(rows: T[], face?: RoomElement['face']): (AtomicFace | undefined)[] {
  const top = Math.max(
    ...rows.filter((r) => r.eligible !== false).map((r) => r.top),
  );
  return rows.map(
    (r) =>
      r.faceStyle ??
      (isCombinationFace(face)
        ? combinationProfiles[face][
            r.eligible !== false && Math.abs(r.top - top) < 1e-5 ? 0 : 1
          ]
        : face),
  );
}
export function resolvePartFaces<T extends CabinetPart>(
  parts: T[],
  face?: RoomElement['face'],
): T[] {
  const fronts = parts.filter((p) => p.kind === 'door' || p.kind === 'drawer');
  const styles = resolveFaceRows(
    fronts.map((p) => ({
      top: p.y + p.height,
      faceStyle:
        p.faceStyle ??
        (p.kind === 'drawer' && face === 'shaker-glass' ? 'shaker' : undefined),
      eligible: p.z <= 0 && p.door?.mechanism !== 'tambour',
    })),
    face,
  );
  const resolved = new Map(fronts.map((p, i) => [p, styles[i]]));
  return parts.map((p) =>
    resolved.has(p) ? {...p, faceStyle: resolved.get(p)} : p,
  );
}
