import {simpleArchProfile, insetArchProfile} from '../simpleArch';
import {cabinetOpenings} from './openingPlacement';
import {customUnitLayoutParts} from './layoutParts';
import {cabinetFaceFrame} from '../faceFrame';
import {drawerBounds, expandDrawerArray} from './drawerArrays';
import type {CabinetPart, CustomUnitDefinition} from './model';
import type {Overlay} from '../overlay';

export type RoomFrontPart = CabinetPart & {
  arrayId?: string;
  roomOpening?: Opening;
  outline?: Array<{x: number; y: number}>;
  faceFrame?: 'left' | 'right' | 'interior' | 'rail';
};
type Opening = NonNullable<CabinetPart['drawerArray']>['opening'];

/** Recover the opening from either legacy opening-sized doors or overlay fronts.
 * Only a board touching this front can define its edge; paired doors retain
 * their shared meeting edge. Stored composition dimensions remain unchanged.
 */
export function frontOpening(
  unit: CustomUnitDefinition,
  part: CabinetPart,
): Opening {
  const edge = (axis: 'x' | 'y', size: 'width' | 'height', before: boolean) => {
    const value =
      part[axis] + (before ? -unit.reveal : part[size] + unit.reveal);
    const other = axis === 'x' ? 'y' : 'x';
    const otherSize = axis === 'x' ? 'height' : 'width';
    const center = part[other] + part[otherSize] / 2;
    const candidates = (unit.parts ?? [])
      .filter(
        (board) =>
          ['carcass', 'divider', 'shelf', 'panel'].includes(board.kind) &&
          board.profileMode !== 'independent' &&
          board[size] <= 0.75 &&
          center > board[other] &&
          center < board[other] + board[otherSize],
      )
      .map((board) => board[axis] + (before ? board[size] : 0))
      .filter((candidate) => Math.abs(candidate - value) <= 0.75 + 1e-6)
      .sort((a, b) => Math.abs(a - value) - Math.abs(b - value));
    return candidates[0] ?? value;
  };
  const x = edge('x', 'width', true),
    y = edge('y', 'height', true);
  return {
    x,
    y,
    width: edge('x', 'width', false) - x,
    height: edge('y', 'height', false) - y,
  };
}

/** One room-owned exterior-front layout for both doors and drawers. Interior
 * drawers and tambour mechanisms keep their required internal clearances.
 */
export function roomFrontParts(
  unit: CustomUnitDefinition,
  overlay: Overlay,
  joined: {left?: boolean; right?: boolean} = {},
): RoomFrontPart[] {
  const eligible = new Set(cabinetArchChoices(unit).map((c) => c.id));
  const exteriorParts = new Set<CabinetPart>();
  const projectedParts = (unit.parts ?? []).flatMap((part) => {
    if (
      !['door', 'drawer'].includes(part.kind) ||
      part.z > 0 ||
      part.drawerArray?.face === 'internal' ||
      part.door?.mechanism === 'tambour'
    )
      return expandDrawerArray(part, unit.reveal).map((p) => ({
        ...p,
        arch: eligible.has(`door:${p.id}`) ? p.arch : undefined,
      }));
    const opening = part.drawerArray?.opening ?? frontOpening(unit, part);
    const bounds = drawerBounds(unit, opening, 'external', 'full-overlay');
    const projected = {
      ...part,
      arch: eligible.has(`door:${part.id}`) ? part.arch : undefined,
      ...bounds,
      z: -part.depth,
    };
    if (part.drawerArray) {
      const array = part.drawerArray;
      const available =
        bounds.height - (array.heights.length - 1) * unit.reveal;
      const total = array.heights.reduce((sum, height) => sum + height, 0);
      projected.drawerArray = {
        ...array,
        heights: array.heights.map((height) => (height * available) / total),
      };
    }
    const expanded = expandDrawerArray(projected, unit.reveal);
    expanded.forEach((part) => exteriorParts.add(part));
    return expanded;
  });
  const selectedArches = new Set(
    (unit.archedOpenings ?? []).filter((id) => eligible.has(id)),
  );
  projectedParts.forEach((p) => {
    if (p.arch === 'simple' && eligible.has(`door:${p.id}`))
      selectedArches.add(`door:${p.id}`);
  });
  if (overlay === 'full-overlay' && !selectedArches.size) return projectedParts;
  const exterior = projectedParts.filter((part) => exteriorParts.has(part));
  const physicalOpenings = cabinetOpenings(unit);
  const openCells = cabinetArchChoices(unit)
    .filter((c) => c.id.startsWith('section:') && selectedArches.has(c.id))
    .map((c) => ({
      ...physicalOpenings[Number(c.id.split(':').at(-1))],
      id: c.id,
    }));
  // Open cabinetry already has physical side boards and shelf edges. An arch
  // adds a shaped top rail only; it must not introduce a wider replacement frame.
  if (!exterior.length) {
    return [...projectedParts, ...openCells.map((arch) => archRail(arch, 0))];
  }
  if (overlay === 'full-overlay') {
    const doorArches = cabinetArchChoices(unit).filter(
      (c) => c.id.startsWith('door:') && selectedArches.has(c.id),
    );
    return [
      ...projectedParts.map((part) => {
        const opening = doorArches.find((c) => c.id === `door:${part.id}`);
        return opening
          ? {
              ...part,
              roomOpening: opening,
              outline: insetArchProfile(
                opening.width,
                opening.height,
                part.x - opening.x,
                128,
              ),
            }
          : part;
      }),
      ...[...openCells, ...doorArches].map((arch) => archRail(arch, 0)),
    ];
  }
  const frame = cabinetFaceFrame(
    [...exterior, ...openCells],
    {x: 0, y: 0, width: unit.width, height: unit.height},
    joined,
  );
  const openings = new Map(
    exterior.map((part, i) => [part, frame.openings[i]]),
  );
  const arches = [
    ...exterior.map((p, i) => ({id: `door:${p.id}`, ...frame.openings[i]})),
    ...openCells.map((c, i) => ({
      id: c.id,
      ...frame.openings[exterior.length + i],
    })),
  ].filter((c) => selectedArches.has(c.id));
  const result: RoomFrontPart[] = projectedParts.map((part) => {
    const opening = openings.get(part);
    if (!opening) return part;
    const overlap = overlay === 'partial-overlay' ? frame.width / 2 : 0;
    return {
      ...part,
      x: opening.x - overlap + unit.reveal,
      y: opening.y - overlap + unit.reveal,
      width: opening.width + 2 * overlap - 2 * unit.reveal,
      height: opening.height + 2 * overlap - 2 * unit.reveal,
      z: overlay === 'inset' ? -0.75 : -0.75 - part.depth,
      roomOpening: opening,
      outline: selectedArches.has(`door:${part.id}`)
        ? insetArchProfile(opening.width, opening.height, unit.reveal - overlap)
        : undefined,
    };
  });
  for (const [i, r] of frame.stiles.entries())
    result.push({
      id: `room-frame-stile-${i}`,
      name: 'Face frame stile',
      kind: 'panel',
      ...r,
      z: -0.75,
      depth: 0.75,
      faceFrame: i === 0 ? 'left' : i === 1 ? 'right' : 'interior',
      materialApplication: {grainAxis: 'y'},
    });
  const rails = frame.rails.flatMap((rail) => {
    let spans = [rail];
    for (const arch of arches) {
      if (Math.abs(rail.y - arch.y - arch.height) > 0.01) continue;
      spans = spans.flatMap((r) => {
        const start = Math.max(r.x, arch.x),
          end = Math.min(r.x + r.width, arch.x + arch.width);
        if (end <= start) return [r];
        return [
          r.x < start ? {...r, width: start - r.x} : undefined,
          end < r.x + r.width
            ? {...r, x: end, width: r.x + r.width - end}
            : undefined,
        ].filter((r): r is typeof rail => !!r);
      });
    }
    return spans;
  });
  for (const [i, r] of rails.entries())
    result.push({
      id: `room-frame-rail-${i}`,
      name: 'Face frame rail',
      kind: 'panel',
      ...r,
      z: -0.75,
      depth: 0.75,
      faceFrame: 'rail',
      materialApplication: {grainAxis: 'x'},
    });
  for (const arch of arches) result.push(archRail(arch, frame.width));
  return result;
}

/** Stable opening choices shared by the editor, renderer and fabrication resolver. */
export function cabinetOpeningChoices(unit: CustomUnitDefinition) {
  const parts = customUnitLayoutParts(unit) as CabinetPart[];
  const doors = parts.filter(
    (p) => p.kind === 'door' && p.z <= 0 && p.door?.mechanism !== 'tambour',
  );
  const cells = doors.map((p) => ({
    id: `door:${p.id}`,
    ...frontOpening({...unit, parts}, p),
  }));
  for (const [index, opening] of cabinetOpenings(unit).entries()) {
    if (
      doors.some(
        (p) =>
          p.x < opening.x + opening.width &&
          p.x + p.width > opening.x &&
          p.y < opening.y + opening.height &&
          p.y + p.height > opening.y,
      )
    )
      continue;
    cells.push({
      ...opening,
      x: opening.x - 0.375,
      y: opening.y - 0.375,
      width: opening.width + 0.75,
      height: opening.height + 0.75,
      id: `section:${unit.root.id}:${index}`,
    });
  }
  return cells;
}

/** Arch choices are limited to the uppermost row of physical front openings. */
export function cabinetArchChoices(unit: CustomUnitDefinition) {
  const choices = cabinetOpeningChoices(unit);
  const top = Math.max(...choices.map((c) => c.y + c.height));
  return choices.filter(
    (c) => Math.abs(c.y + c.height - top) < 0.01 && c.height >= c.width / 2,
  );
}

function archRail(
  arch: {id: string; x: number; y: number; width: number; height: number},
  topRail: number,
): RoomFrontPart {
  const profile = simpleArchProfile(arch.width, arch.height, 128);
  const outerTop = arch.height + topRail;
  return {
    id: `room-frame-arch-${arch.id}`,
    name: 'Arched face frame rail',
    kind: 'panel',
    x: arch.x,
    y: arch.y + profile.spring,
    z: -0.75,
    width: arch.width,
    height: outerTop - profile.spring,
    depth: 0.75,
    outline: [
      {x: 0, y: outerTop - profile.spring},
      {x: arch.width, y: outerTop - profile.spring},
      ...profile.points
        .slice(2)
        .map((p) => ({x: p.x, y: p.y - profile.spring})),
      {x: 0, y: 0},
    ],
    faceFrame: 'rail',
    materialApplication: {grainAxis: 'x'},
  };
}
