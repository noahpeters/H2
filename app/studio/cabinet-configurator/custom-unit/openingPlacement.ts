import {editableParts} from './partEditing';
import type {CabinetPart, CustomUnitDefinition} from './model';

export type PlacementKind =
  | CabinetPart['kind']
  | 'back-panel'
  | 'side-panel'
  | 'left-end-shelf'
  | 'right-end-shelf';

export type CabinetOpening = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
};
/** Physical openings, derived from the current boards rather than the original split tree. */
export function cabinetOpenings(unit: CustomUnitDefinition): CabinetOpening[] {
  const boards = editableParts(unit).filter(
    (p) =>
      ['carcass', 'divider', 'shelf', 'panel'].includes(p.kind) &&
      p.profileMode !== 'independent',
  );
  const vertical = boards.filter((p) => p.width < Math.min(p.height, p.depth));
  const horizontal = boards.filter(
    (p) => p.height < Math.min(p.width, p.depth),
  );
  const xs = [
    ...new Set([
      0,
      unit.width,
      ...vertical.flatMap((p) => [p.x, p.x + p.width]),
    ]),
  ]
    .filter((x) => x >= 0 && x <= unit.width)
    .sort((a, b) => a - b);
  const ys = [
    ...new Set([
      0,
      unit.height,
      ...horizontal.flatMap((p) => [p.y, p.y + p.height]),
    ]),
  ]
    .filter((y) => y >= 0 && y <= unit.height)
    .sort((a, b) => a - b);
  const found = new Map<string, CabinetOpening>();
  for (let i = 1; i < xs.length; i++)
    for (let j = 1; j < ys.length; j++) {
      const x = (xs[i - 1] + xs[i]) / 2,
        y = (ys[j - 1] + ys[j]) / 2;
      const walls = vertical.filter((p) => y >= p.y && y <= p.y + p.height);
      const shelves = horizontal.filter((p) => x >= p.x && x <= p.x + p.width);
      if (
        [...walls, ...shelves].some(
          (p) => x > p.x && x < p.x + p.width && y > p.y && y < p.y + p.height,
        )
      )
        continue;
      const left = Math.max(
        0,
        ...walls.filter((p) => p.x + p.width <= x).map((p) => p.x + p.width),
      );
      const right = Math.min(
        unit.width,
        ...walls.filter((p) => p.x >= x).map((p) => p.x),
      );
      const bottom = Math.max(
        0,
        ...shelves
          .filter((p) => p.y + p.height <= y)
          .map((p) => p.y + p.height),
      );
      const top = Math.min(
        unit.height,
        ...shelves.filter((p) => p.y >= y).map((p) => p.y),
      );
      if (right - left < 1 || top - bottom < 1) continue;
      const id = `${left}:${bottom}:${right}:${top}`;
      found.set(id, {
        id,
        x: left,
        y: bottom,
        width: right - left,
        height: top - bottom,
        depth: unit.depth,
      });
    }
  return [...found.values()];
}
export function partInOpening(
  unit: CustomUnitDefinition,
  kind: PlacementKind,
  opening: CabinetOpening,
  x = opening.x + opening.width / 2,
  y = opening.y + opening.height / 2,
  snap = 0.0625,
): CabinetPart {
  if (kind === 'back-panel' || kind === 'side-panel')
    return {
      id: 'placement-preview',
      kind: 'panel',
      profileMode: 'cabinet',
      x: kind === 'back-panel' ? opening.x : opening.x + opening.width - 0.75,
      y: opening.y,
      z: kind === 'back-panel' ? unit.depth - 0.5 : 0,
      width: kind === 'back-panel' ? opening.width : 0.75,
      height: opening.height,
      depth: kind === 'back-panel' ? 0.5 : unit.depth,
    };
  if (kind === 'left-end-shelf' || kind === 'right-end-shelf')
    return {
      id: 'placement-preview',
      kind: 'shelf',
      profileMode: 'independent',
      shape: kind === 'left-end-shelf' ? 'round-left' : 'round-right',
      x:
        kind === 'left-end-shelf'
          ? opening.x - unit.depth / 2
          : opening.x + opening.width,
      y: Math.max(opening.y, Math.min(opening.y + opening.height - 0.75, y)),
      z: 0,
      width: unit.depth / 2,
      height: 0.75,
      depth: unit.depth,
    };
  const t = 0.75,
    r = unit.reveal;
  const snapTo = (v: number) => (snap ? Math.round(v / snap) * snap : v);
  const front = kind === 'door' || kind === 'drawer';
  const vertical = kind === 'divider';
  return {
    id: 'placement-preview',
    kind,
    profileMode: 'cabinet',
    x: vertical
      ? Math.max(
          opening.x,
          Math.min(opening.x + opening.width - t, snapTo(x - t / 2)),
        )
      : opening.x + (front ? r : 0),
    y: front
      ? opening.y + r
      : vertical
        ? opening.y
        : Math.max(
            opening.y,
            Math.min(opening.y + opening.height - t, snapTo(y - t / 2)),
          ),
    z: front ? -t : kind === 'rod' ? unit.depth / 2 : 0.5,
    width: vertical ? t : opening.width - (front ? 2 * r : 0),
    height: front ? opening.height - 2 * r : vertical ? opening.height : t,
    depth: front || kind === 'rod' ? t : Math.max(t, opening.depth - 1.25),
  };
}
