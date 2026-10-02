import type {Island, RoomElement} from './model';

/** The same outline is used by the plan, countertop, snapping, and grouping. */
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

export function islandWorldBounds(island: Island) {
  const b = islandOutline(island),
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
