import type {Room, Wall} from './model';
import {roomPoints, roomSegments, roomWall, wallPoint} from './roomOutline';

export const DEFAULT_WALL_THICKNESS = 4.5;
export const MIN_WALL_THICKNESS = 1;
export const MAX_WALL_THICKNESS = 24;
export const wallThickness = (room: Room) =>
  room.wallThickness ?? DEFAULT_WALL_THICKNESS;
export const isPartition = (room: Room, id: Wall) =>
  room.partitions?.some((p) => p.id === id) ?? false;

/** Perimeter coordinates are finished interior faces; partitions are centerlines. */
export const wallFaceOffset = (room: Room, id: Wall) =>
  isPartition(room, id) ? wallThickness(room) / 2 : 0;

/** Depth along placeOnWall's local Z axis, in inches. */
export function localWallDepth(room: Room, id: Wall) {
  const t = wallThickness(room);
  if (isPartition(room, id)) return {min: -t / 2, max: t / 2};
  const s = roomWall(room, id);
  const inward = s.horizontal ? s.nz : -s.nx;
  return {min: inward > 0 ? -t : 0, max: inward > 0 ? 0 : t};
}

/** Shared solid footprint for plan, 3D, collision and opening cuts.
 * Orthogonal perimeter corners meet at an exterior miter without changing room size.
 */
export function wallFootprint(
  room: Room,
  id: Wall,
  start = 0,
  end = roomWall(room, id).length,
) {
  const s = roomWall(room, id);
  const t = wallThickness(room);
  const a = wallPoint(room, id, 0);
  const b = wallPoint(room, id, s.length);
  let footprint: {x: number; z: number}[];
  if (isPartition(room, id))
    footprint = [
      {x: a.x + (s.nx * t) / 2, z: a.z + (s.nz * t) / 2},
      {x: b.x + (s.nx * t) / 2, z: b.z + (s.nz * t) / 2},
      {x: b.x - (s.nx * t) / 2, z: b.z - (s.nz * t) / 2},
      {x: a.x - (s.nx * t) / 2, z: a.z - (s.nz * t) / 2},
    ];
  else {
    const edges = roomSegments(room).slice(0, roomPoints(room).length);
    const index = edges.findIndex((edge) => edge.id === id);
    const previous = edges[(index + edges.length - 1) % edges.length];
    const next = edges[(index + 1) % edges.length];
    const outside = (p: {x: number; z: number}) => {
      const neighbor =
        p.x === s.a.x && p.z === s.a.z
          ? previous
          : p.x === s.b.x && p.z === s.b.z
            ? next
            : undefined;
      // Only extend at actual segment endpoints, not at subdivisions around apertures.
      return {
        x: p.x - s.nx * t - (neighbor ? neighbor.nx * t : 0),
        z: p.z - s.nz * t - (neighbor ? neighbor.nz * t : 0),
      };
    };
    footprint = [a, b, outside(b), outside(a)];
  }
  // Clip the complete mitered polygon at aperture subdivisions. Constructing a
  // separate miter at each cut can invert narrow pieces beside concave corners.
  const axis = s.horizontal ? 'x' : 'z';
  const origin = s[axis];
  const clip = (points: typeof footprint, value: number, greater: boolean) => {
    const result: typeof footprint = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const insideA = greater ? a[axis] >= value : a[axis] <= value;
      const insideB = greater ? b[axis] >= value : b[axis] <= value;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const ratio = (value - a[axis]) / (b[axis] - a[axis]);
        result.push({
          x: a.x + ratio * (b.x - a.x),
          z: a.z + ratio * (b.z - a.z),
        });
      }
    }
    return result;
  };
  if (start > 0) footprint = clip(footprint, origin + start, true);
  if (end < s.length) footprint = clip(footprint, origin + end, false);
  return footprint;
}

export function wallBounds(room: Room, id: Wall) {
  const points = wallFootprint(room, id);
  return {
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.z)),
    bottom: Math.max(...points.map((p) => p.z)),
  };
}
