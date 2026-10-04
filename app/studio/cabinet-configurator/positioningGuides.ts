import {
  canonicalCoordinate,
  coordinateUnits,
  snappingDistance,
  intervalsOverlap,
} from './positioningPrecision';
import type {Study} from './CabinetConfigurator';
import {bounds, moveIsland} from './model';
import {roomSegments, wallPoint, roomWall} from './roomOutline';
import {isPartition, wallBounds} from './wallDimensions';
import {islandCountertopOutline, islandWorldBounds} from './islandFootprint';

export type GuideTarget = {
  kind: 'element' | 'island' | 'opening' | 'wall';
  id: string;
};
type Box = {left: number; right: number; top: number; bottom: number};
type Reference = Box & {kind: GuideTarget['kind']; id: string};
export type PositioningGuide = {
  kind: 'alignment' | 'distance';
  axis: 'x' | 'z';
  from: number;
  to: number;
  at: number;
  distance?: number;
};

function references(study: Study): Reference[] {
  return [
    ...study.elements
      .filter((e) => e.placement.mode !== 'hosted')
      .map((e) => ({
        ...bounds(e, study.room),
        kind: 'element' as const,
        id: e.id,
      })),
    ...study.islands.map((i) => ({
      ...islandWorldBounds(
        i,
        islandCountertopOutline(i, study.elements, study.room),
      ),
      kind: 'island' as const,
      id: i.id,
    })),
    ...study.openings.map((o) => {
      const a = wallPoint(study.room, o.wall, o.offset);
      const b = wallPoint(study.room, o.wall, o.offset + o.width);
      return {
        left: Math.min(a.x, b.x),
        right: Math.max(a.x, b.x),
        top: Math.min(a.z, b.z),
        bottom: Math.max(a.z, b.z),
        kind: 'opening' as const,
        id: o.id,
      };
    }),
    ...roomSegments(study.room).map((s) => ({
      ...(isPartition(study.room, s.id)
        ? wallBounds(study.room, s.id)
        : {
            left: Math.min(s.a.x, s.b.x),
            right: Math.max(s.a.x, s.b.x),
            top: Math.min(s.a.z, s.b.z),
            bottom: Math.max(s.a.z, s.b.z),
          }),
      kind: 'wall' as const,
      id: s.id,
    })),
  ];
}

/** Temporary plan aids in inches. Report geometry without changing placement or snapping. */
export function positioningGuides(
  study: Study,
  target: GuideTarget | null,
  tolerance = snappingDistance(study.room),
): PositioningGuide[] {
  if (!target) return [];
  const all = references(study);
  const active = all.find((r) => r.kind === target.kind && r.id === target.id);
  if (!active) return [];
  const ownIsland =
    target.kind === 'island'
      ? target.id
      : study.elements.find((e) => e.id === target.id)?.islandId;
  const others = all.filter(
    (r) =>
      r !== active &&
      !(
        ownIsland &&
        ((r.kind === 'island' && r.id === ownIsland) ||
          (target.kind === 'island' &&
            r.kind === 'element' &&
            study.elements.find((e) => e.id === r.id)?.islandId === ownIsland))
      ) &&
      !(
        target.kind === 'wall' &&
        r.kind === 'opening' &&
        study.openings.find((o) => o.id === r.id)?.wall === target.id
      ),
  );
  const guides: PositioningGuide[] = [];
  for (const axis of ['x', 'z'] as const) {
    const min = axis === 'x' ? 'left' : 'top';
    const max = axis === 'x' ? 'right' : 'bottom';
    const crossMin = axis === 'x' ? 'top' : 'left';
    const crossMax = axis === 'x' ? 'bottom' : 'right';
    const anchors = (box: Box) => [
      box[min],
      (box[min] + box[max]) / 2,
      box[max],
    ];
    const item =
      target.kind === 'element'
        ? study.elements.find((e) => e.id === target.id)
        : undefined;
    const allowed =
      item?.placement.mode !== 'wall' ||
      roomWall(study.room, item.placement.wall).horizontal === (axis === 'x');
    const axisTolerance = allowed ? tolerance : 0;
    const correction = nearestAlignment(active, others, axis, axisTolerance);
    // One line per edge or center, extended through every matching reference.
    for (const anchor of [...new Set(anchors(active))]) {
      let best: {anchor: number; box: Reference; delta: number} | undefined;
      for (const box of others)
        for (const otherAnchor of anchors(box)) {
          const delta = Math.abs(anchor - otherAnchor);
          if (
            delta <= axisTolerance &&
            coordinateUnits(otherAnchor - anchor) ===
              coordinateUnits(correction ?? Infinity) &&
            (!best ||
              delta < best.delta ||
              (delta === best.delta &&
                Math.abs(box[crossMin] - active[crossMin]) <
                  Math.abs(best.box[crossMin] - active[crossMin])))
          )
            best = {anchor: otherAnchor, box, delta};
        }
      if (best) {
        const matched = others.filter((box) =>
          anchors(box).some(
            (value) => coordinateUnits(value) === coordinateUnits(best!.anchor),
          ),
        );
        guides.push({
          kind: 'alignment',
          axis: axis === 'x' ? 'z' : 'x',
          at: best.anchor,
          from:
            Math.min(active[crossMin], ...matched.map((box) => box[crossMin])) -
            8,
          to:
            Math.max(active[crossMax], ...matched.map((box) => box[crossMax])) +
            8,
        });
      }
    }
    // Nearest clear gap on each side, only where the projected footprints overlap.
    for (const side of ['before', 'after'] as const) {
      let best:
        | {box: Reference; gap: number; low: number; high: number}
        | undefined;
      for (const box of others) {
        const low = Math.max(active[crossMin], box[crossMin]);
        const high = Math.min(active[crossMax], box[crossMax]);
        const gap =
          side === 'before' ? active[min] - box[max] : box[min] - active[max];
        // Connected walls must not mask an opposing clearance, but a separated
        // perpendicular wall is useful when extending a partition's endpoint.
        if (
          target.kind === 'wall' &&
          box.kind === 'wall' &&
          (active.left === active.right) !== (box.left === box.right) &&
          gap <= 0.01
        )
          continue;
        if (high < low || gap < -0.01 || (best && gap >= best.gap)) continue;
        best = {box, gap: Math.max(0, gap), low, high};
      }
      if (best && best.gap > 0.01)
        guides.push({
          kind: 'distance',
          axis,
          from: side === 'before' ? best.box[max] : active[max],
          to: side === 'before' ? active[min] : best.box[min],
          at: (best.low + best.high) / 2,
          distance: best.gap,
        });
    }
  }
  return guides;
}

export function guideDistanceLabel(inches: number) {
  return `${Number(inches.toFixed(1))}″`;
}

/** Select one compatible translation per axis, shared by visible guides and commit.
 * Stable reference order breaks equal-distance ties; conflicting lines are hidden. */
function nearestAlignment(
  active: Box,
  others: Box[],
  axis: 'x' | 'z',
  tolerance: number,
) {
  const anchors = (box: Box) =>
    axis === 'x'
      ? [box.left, (box.left + box.right) / 2, box.right]
      : [box.top, (box.top + box.bottom) / 2, box.bottom];
  let best: number | undefined;
  for (const anchor of anchors(active))
    for (const box of others)
      for (const other of anchors(box)) {
        const delta = canonicalCoordinate(other - anchor);
        if (
          Math.abs(delta) <= tolerance &&
          (best === undefined || Math.abs(delta) < Math.abs(best))
        )
          best = delta;
      }
  return best;
}

/** Commit the same edge/face/center alignment displayed in the plan. Exact
 * reference geometry wins over grid rounding, including fractional-size parts. */
export function commitPositioningGuides(study: Study, target: GuideTarget) {
  const guides = positioningGuides(study, target);
  const all = references(study);
  const active = all.find((r) => r.kind === target.kind && r.id === target.id);
  if (!active) return;
  const delta = (axis: 'x' | 'z') => {
    const anchors =
      axis === 'x'
        ? [active.left, (active.left + active.right) / 2, active.right]
        : [active.top, (active.top + active.bottom) / 2, active.bottom];
    const lines = guides.filter(
      (g) => g.kind === 'alignment' && g.axis === (axis === 'x' ? 'z' : 'x'),
    );
    return (
      lines
        .flatMap((g) => anchors.map((a) => canonicalCoordinate(g.at - a)))
        .sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0
    );
  };
  if (target.kind === 'island') {
    const island = study.islands.find((i) => i.id === target.id)!;
    const next = {
      x: canonicalCoordinate(island.x + delta('x')),
      z: canonicalCoordinate(island.z + delta('z')),
      rotation: island.rotation,
    };
    study.elements = moveIsland(island, study.elements, next);
    Object.assign(island, next);
  } else if (target.kind === 'element') {
    const item = study.elements.find((e) => e.id === target.id)!;
    const p = item.placement;
    if (p.mode === 'floor') {
      const dx = delta('x'),
        dz = delta('z');
      if (dx) p.x = canonicalCoordinate(p.x + dx);
      if (dz) p.z = canonicalCoordinate(p.z + dz);
    } else if (p.mode === 'wall') {
      const wall = roomWall(study.room, p.wall);
      p.offset = canonicalCoordinate(
        p.offset + delta(wall.horizontal ? 'x' : 'z'),
      );
    }
  }
}

export type ElevationGuide = {
  at: number;
  delta: number;
  alignment: 'bottom' | 'center' | 'top';
};
export function elevationGuide(
  study: Study,
  id: string,
): ElevationGuide | undefined {
  const item = study.elements.find((e) => e.id === id);
  if (
    !item ||
    item.placement.mode === 'hosted' ||
    item.kind === 'base' ||
    item.kind === 'tall'
  )
    return;
  const box = bounds(item, study.room);
  const bottom = item.placement.elevation ?? 0;
  let best: ElevationGuide | undefined;
  for (const other of study.elements) {
    if (other.id === id || other.placement.mode === 'hosted') continue;
    const b = bounds(other, study.room);
    if (
      !intervalsOverlap(box.left, box.right, b.left, b.right) ||
      !intervalsOverlap(box.top, box.bottom, b.top, b.bottom)
    )
      continue;
    const otherBottom = other.placement.elevation ?? 0;
    for (const [anchor, alignment] of [
      [bottom, 'bottom'],
      [bottom + item.height / 2, 'center'],
      [bottom + item.height, 'top'],
    ] as const)
      for (const at of [
        otherBottom,
        otherBottom + other.height / 2,
        otherBottom + other.height,
      ]) {
        const delta = canonicalCoordinate(at - anchor);
        const nextBottom = bottom + delta;
        if (
          Math.abs(delta) <= snappingDistance(study.room) &&
          nextBottom >= 0 &&
          nextBottom + item.height <= study.room.height &&
          (!best || Math.abs(delta) < Math.abs(best.delta))
        )
          best = {at, delta, alignment};
      }
  }
  return best;
}
export function commitElevationGuide(study: Study, id: string) {
  const guide = elevationGuide(study, id);
  const item = study.elements.find((e) => e.id === id);
  if (guide && item)
    item.placement.elevation = canonicalCoordinate(
      (item.placement.elevation ?? 0) + guide.delta,
    );
}
