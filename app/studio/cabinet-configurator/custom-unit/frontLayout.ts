import {hasCabinetArch, clipCabinetArch, type CabinetArch} from './cabinetArch';
import {cabinetOpenings} from './openingPlacement';
import {customUnitLayoutParts} from './layoutParts';
import {cabinetFaceFrame} from '../faceFrame';
import {drawerBounds, expandDrawerArray} from './drawerArrays';
import type {CabinetPart, CustomUnitDefinition} from './model';
import type {Overlay} from '../overlay';

export type RoomFrontPart = CabinetPart & {
  cabinetArch?: CabinetArch;
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
  joined: {
    left?: boolean;
    right?: boolean;
    leftExtension?: number;
    rightExtension?: number;
  } = {},
): RoomFrontPart[] {
  if (hasCabinetArch(unit)) {
    const baseline = roomFrontParts(
      {
        ...unit,
        frontArch: undefined,
        archedOpenings: undefined,
        parts: unit.parts?.map((part) => ({...part, arch: undefined})),
      },
      overlay,
      joined,
    );
    const framed = baseline.some((part) => part.faceFrame);
    const margin = framed ? 1.5 : 0.75;
    const left = framed
      ? baseline.find((part) => part.faceFrame === 'left')!
      : undefined;
    const right = framed
      ? baseline.find((part) => part.faceFrame === 'right')!
      : undefined;
    const start = left ? left.x + left.width : margin;
    const end = right ? right.x : unit.width - margin;
    const radius = (end - start) / 2;
    // A semicircle is sized from cabinet width, even when it crosses shelves.
    const arch = {
      center: (start + end) / 2,
      radius,
      spring: unit.height - margin - radius,
    };
    const offset =
      overlay === 'inset'
        ? unit.reveal
        : overlay === 'partial-overlay'
          ? unit.reveal - margin / 2
          : unit.reveal - margin;
    const doorArch = {...arch, radius: radius - offset};
    const result: RoomFrontPart[] = baseline
      .filter(
        (part) =>
          !(part.faceFrame === 'rail' && part.y >= unit.height - margin - 1e-6),
      )
      .flatMap((part) => {
        if (
          !['door', 'drawer'].includes(part.kind) ||
          part.z > 0 ||
          part.drawerArray?.face === 'internal' ||
          part.door?.mechanism === 'tambour'
        )
          return [part];
        const outline = clipCabinetArch(doorArch, part);
        if (outline.length < 3) return [];
        if (
          outline.length === 4 &&
          outline.every(
            (point) =>
              (Math.abs(point.x) < 1e-8 ||
                Math.abs(point.x - part.width) < 1e-8) &&
              (Math.abs(point.y) < 1e-8 ||
                Math.abs(point.y - part.height) < 1e-8),
          )
        )
          return [
            {
              ...part,
              z: overlay === 'full-overlay' ? -0.75 - part.depth : part.z,
            },
          ];
        return [
          {
            ...part,
            z: overlay === 'full-overlay' ? -0.75 - part.depth : part.z,
            outline,
            cabinetArch: doorArch,
          },
        ];
      });
    const outline = [
      {x: 0, y: radius + margin},
      {x: 2 * radius, y: radius + margin},
    ];
    for (let i = 0; i <= 128; i++) {
      const angle = (i * Math.PI) / 128;
      outline.push({
        x: radius + radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      });
    }
    result.push({
      id: 'room-frame-cabinet-arch',
      name: 'Arched face frame rail',
      kind: 'panel',
      x: start,
      y: arch.spring,
      z: -0.75,
      width: 2 * radius,
      height: radius + margin,
      depth: 0.75,
      outline,
      faceFrame: 'rail',
      materialApplication: {grainAxis: 'x'},
    });
    return result;
  }
  const exteriorParts = new Set<CabinetPart>();
  const projectedParts = (unit.parts ?? []).flatMap((part) => {
    if (
      !['door', 'drawer'].includes(part.kind) ||
      part.z > 0 ||
      part.drawerArray?.face === 'internal' ||
      part.door?.mechanism === 'tambour'
    )
      return expandDrawerArray(part, unit.reveal);
    const opening = part.drawerArray?.opening ?? frontOpening(unit, part);
    const bounds = drawerBounds(unit, opening, 'external', 'full-overlay');
    const projected = {
      ...part,
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
  if (overlay === 'full-overlay') return projectedParts;
  const exterior = projectedParts.filter((part) => exteriorParts.has(part));
  const frame = cabinetFaceFrame(
    exterior,
    {x: 0, y: 0, width: unit.width, height: unit.height},
    joined,
  );
  const openings = new Map(
    exterior.map((part, i) => [part, frame.openings[i]]),
  );
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
  for (const [i, r] of frame.rails.entries())
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
