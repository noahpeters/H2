import {drawerBounds, equalDrawerHeights} from './drawerArrays';
import {editableParts} from './partEditing';
import type {CabinetPart, CustomUnitDefinition} from './model';

export type PlacementKind =
  | CabinetPart['kind']
  | 'drawer-array'
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
/** Drawers can sit behind doors; exterior fronts still reserve their elevation. */
export function placementOpenings(
  unit: CustomUnitDefinition,
  kind: PlacementKind,
): CabinetOpening[] {
  if (kind === 'drawer-array')
    return placementOpenings(unit, 'drawer').filter(
      (space) => space.height >= 2 + 2 * unit.reveal,
    );
  let spaces = cabinetOpenings(unit);
  if (kind !== 'door' && kind !== 'drawer') return spaces;
  for (const front of editableParts(unit).filter((part) =>
    kind === 'drawer'
      ? part.kind === 'drawer'
      : part.kind === 'door' || (part.kind === 'drawer' && part.z < 0),
  )) {
    spaces = spaces.flatMap((space) => {
      const left = Math.max(space.x, front.x);
      const right = Math.min(space.x + space.width, front.x + front.width);
      const bottom = Math.max(space.y, front.y);
      const top = Math.min(space.y + space.height, front.y + front.height);
      if (left >= right || bottom >= top) return [space];
      return [
        [space.x, space.y, space.width, bottom - space.y],
        [space.x, top, space.width, space.y + space.height - top],
        [space.x, bottom, left - space.x, top - bottom],
        [right, bottom, space.x + space.width - right, top - bottom],
      ]
        .filter(
          ([, , width, height]) =>
            width > 2 * unit.reveal && height > 2 * unit.reveal,
        )
        .map(([x, y, width, height]) => ({
          ...space,
          id: `${x}:${y}:${width}:${height}`,
          x,
          y,
          width,
          height,
        }));
    });
  }
  return spaces;
}

export function partInOpening(
  unit: CustomUnitDefinition,
  kind: PlacementKind,
  opening: CabinetOpening,
  x = opening.x + opening.width / 2,
  y = opening.y + opening.height / 2,
  snap = 0.0625,
): CabinetPart {
  if (kind === 'drawer-array') {
    const template = partInOpening(unit, 'drawer', opening);
    const face = template.z >= 0 ? 'internal' : 'external';
    const bounds = drawerBounds(unit, opening, face);
    return {
      ...template,
      ...bounds,
      name: 'Drawer array',
      drawerArray: {
        face,
        opening: {
          x: opening.x,
          y: opening.y,
          width: opening.width,
          height: opening.height,
        },
        heights: equalDrawerHeights(bounds.height, unit.reveal),
      },
    };
  }
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
  const frontHeight =
    kind === 'drawer'
      ? Math.min(8, opening.height - 2 * r)
      : opening.height - 2 * r;
  const coveringDoors =
    kind === 'drawer'
      ? editableParts(unit).filter(
          (part) =>
            part.kind === 'door' &&
            part.x < opening.x + opening.width &&
            part.x + part.width > opening.x &&
            part.y < opening.y + opening.height &&
            part.y + part.height > opening.y,
        )
      : [];
  const drawerSetback = coveringDoors.length
    ? Math.max(0.5, ...coveringDoors.map((door) => door.z + door.depth + 0.5))
    : -t;
  return {
    id: 'placement-preview',
    kind,
    ...(kind === 'drawer' && coveringDoors.length
      ? {name: 'Interior drawer'}
      : {}),
    profileMode: 'cabinet',
    x: vertical
      ? Math.max(
          opening.x,
          Math.min(opening.x + opening.width - t, snapTo(x - t / 2)),
        )
      : opening.x + (front ? r : 0),
    y: front
      ? kind === 'drawer'
        ? Math.max(
            opening.y + r,
            Math.min(
              opening.y + opening.height - r - frontHeight,
              snapTo(y - frontHeight / 2),
            ),
          )
        : opening.y + r
      : vertical
        ? opening.y
        : Math.max(
            opening.y,
            Math.min(opening.y + opening.height - t, snapTo(y - t / 2)),
          ),
    z:
      kind === 'drawer'
        ? drawerSetback
        : front
          ? -t
          : kind === 'rod'
            ? unit.depth / 2
            : 0.5,
    width: vertical ? t : opening.width - (front ? 2 * r : 0),
    height: front ? frontHeight : vertical ? opening.height : t,
    depth: front || kind === 'rod' ? t : Math.max(t, opening.depth - 1.25),
  };
}
