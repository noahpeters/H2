import type {Study} from './CabinetConfigurator';
import {bounds} from './model';
import {roomSegments, wallPoint} from './roomOutline';
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
      left: Math.min(s.a.x, s.b.x),
      right: Math.max(s.a.x, s.b.x),
      top: Math.min(s.a.z, s.b.z),
      bottom: Math.max(s.a.z, s.b.z),
      kind: 'wall' as const,
      id: s.id,
    })),
  ];
}

/** Temporary plan aids in inches. Report geometry without changing placement or snapping. */
export function positioningGuides(
  study: Study,
  target: GuideTarget | null,
  tolerance = 2,
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
    // One line per edge or center, extended through every matching reference.
    for (const anchor of [...new Set(anchors(active))]) {
      let best: {anchor: number; box: Reference; delta: number} | undefined;
      for (const box of others)
        for (const otherAnchor of anchors(box)) {
          const delta = Math.abs(anchor - otherAnchor);
          if (
            delta <= tolerance &&
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
          anchors(box).some((value) => Math.abs(value - best!.anchor) < 1e-7),
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
