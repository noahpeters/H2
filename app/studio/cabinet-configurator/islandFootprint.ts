import type {Island, Room, RoomElement} from './model';

/** Island body and seating area used for snapping and grouping. */
export function islandOutline(island: Island) {
  return {
    left:
      -island.width / 2 - (island.seatingSide === 'west' ? island.overhang : 0),
    right:
      island.width / 2 + (island.seatingSide === 'east' ? island.overhang : 0),
    top:
      -island.depth / 2 -
      (island.seatingSide === 'north' ? island.overhang : 0),
    bottom:
      island.depth / 2 + (island.seatingSide === 'south' ? island.overhang : 0),
  };
}

export const DEFAULT_ISLAND_COUNTERTOP_OVERHANG = 0.125;

/** Finished cabinet/frame coverage, separate from the body used for placement.
 * Seating keeps its own reach; the small edge allowance applies elsewhere.
 */
export function islandCountertopOutline(
  island: Island,
  elements: RoomElement[],
  room?: Pick<Room, 'overlay' | 'islandCountertopOverhang'>,
) {
  const edge =
    room?.islandCountertopOverhang ?? DEFAULT_ISLAND_COUNTERTOP_OVERHANG;
  const body = {
    left: -island.width / 2,
    right: island.width / 2,
    top: -island.depth / 2,
    bottom: island.depth / 2,
  };
  for (const item of elements) {
    if (
      item.islandId !== island.id ||
      item.kind !== 'base' ||
      item.placement.mode !== 'floor'
    )
      continue;
    const frame =
      room?.overlay === 'inset' || room?.overlay === 'partial-overlay'
        ? 0.75
        : 0;
    // Face frames project from the local front (+z), not every cabinet side.
    const footprint = islandElementFootprint(
      {
        ...item,
        depth: item.depth + frame,
        placement: {
          ...item.placement,
          x:
            item.placement.x -
            (frame / 2) * Math.sin((item.placement.rotation * Math.PI) / 180),
          z:
            item.placement.z +
            (frame / 2) * Math.cos((item.placement.rotation * Math.PI) / 180),
        },
      },
      island,
    )!;
    body.left = Math.min(body.left, ...footprint.map((p) => p.x));
    body.right = Math.max(body.right, ...footprint.map((p) => p.x));
    body.top = Math.min(body.top, ...footprint.map((p) => p.z));
    body.bottom = Math.max(body.bottom, ...footprint.map((p) => p.z));
  }
  const seating = islandOutline(island);
  return {
    left: Math.min(seating.left, body.left - edge),
    right: Math.max(seating.right, body.right + edge),
    top: Math.min(seating.top, body.top - edge),
    bottom: Math.max(seating.bottom, body.bottom + edge),
  };
}

export function islandElementFootprint(item: RoomElement, island: Island) {
  if (item.placement.mode !== 'floor' || item.kind === 'fixture') return null;
  const p = item.placement;
  const angle = (island.rotation * Math.PI) / 180;
  const dx = p.x - island.x,
    dz = p.z - island.z;
  const x = dx * Math.cos(angle) + dz * Math.sin(angle);
  const z = -dx * Math.sin(angle) + dz * Math.cos(angle);
  const relative = ((p.rotation - island.rotation) * Math.PI) / 180;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sz]) => {
    const a = (sx * item.width) / 2,
      b = (sz * item.depth) / 2;
    return {
      x: x + a * Math.cos(relative) - b * Math.sin(relative),
      z: z + a * Math.sin(relative) + b * Math.cos(relative),
    };
  });
}
const epsilon = 1e-7;
export function islandContainsElement(item: RoomElement, island: Island) {
  const points = islandElementFootprint(item, island),
    b = islandOutline(island);
  return (
    !!points &&
    points.every(
      (p) =>
        p.x >= b.left - epsilon &&
        p.x <= b.right + epsilon &&
        p.z >= b.top - epsilon &&
        p.z <= b.bottom + epsilon,
    )
  );
}

/** Keep membership until the two footprints are separated, including rotated corners. */
export function islandOverlapsElement(item: RoomElement, island: Island) {
  const points = islandElementFootprint(item, island);
  if (!points) return false;
  const b = islandOutline(island);
  const outline = [
    {x: b.left, z: b.top},
    {x: b.right, z: b.top},
    {x: b.right, z: b.bottom},
    {x: b.left, z: b.bottom},
  ];
  const axes = [
    {x: 1, z: 0},
    {x: 0, z: 1},
    ...points
      .slice(0, 2)
      .map((p, i) => ({x: -(points[i + 1].z - p.z), z: points[i + 1].x - p.x})),
  ];
  return axes.every((axis) => {
    const project = (polygon: typeof points) =>
      polygon.map((p) => p.x * axis.x + p.z * axis.z);
    const a = project(points),
      c = project(outline);
    const tolerance = epsilon * Math.hypot(axis.x, axis.z);
    return (
      Math.max(...a) >= Math.min(...c) - tolerance &&
      Math.max(...c) >= Math.min(...a) - tolerance
    );
  });
}

export function islandWorldBounds(
  island: Island,
  outline = islandOutline(island),
) {
  const b = outline,
    angle = (island.rotation * Math.PI) / 180;
  const points = [
    [b.left, b.top],
    [b.right, b.top],
    [b.right, b.bottom],
    [b.left, b.bottom],
  ].map(([x, z]) => ({
    x: island.x + x * Math.cos(angle) - z * Math.sin(angle),
    z: island.z + x * Math.sin(angle) + z * Math.cos(angle),
  }));
  return {
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.z)),
    bottom: Math.max(...points.map((p) => p.z)),
  };
}
