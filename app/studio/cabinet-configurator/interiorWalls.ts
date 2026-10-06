import type {Partition, Room} from './model';
import {wallThickness, wallFootprint} from './wallDimensions';
import {quantizePosition} from './positioningPrecision';
import {pointInRoom, roomSegments} from './roomOutline';
type Point = {x: number; z: number};
const minimum = 6;
const epsilon = 0.01;
const distance = (p: Point, s: ReturnType<typeof roomSegments>[number]) => {
  const along = Math.max(
    0,
    Math.min(s.length, (p.x - s.a.x) * s.tx + (p.z - s.a.z) * s.tz),
  );
  return Math.hypot(p.x - s.a.x - along * s.tx, p.z - s.a.z - along * s.tz);
};
export function partitionEnds(p: Partition) {
  const radians =
    ((p.angle ?? (p.orientation === 'horizontal' ? 0 : 90)) * Math.PI) / 180;
  return {
    start: {x: p.x, z: p.z},
    end: {
      x: p.x + Math.cos(radians) * p.length,
      z: p.z + Math.sin(radians) * p.length,
    },
  };
}
function fromEnds(wall: Partition, a: Point, b: Point): Partition {
  // Retain the original positive-axis convention, including after an endpoint passes the other.
  if (b.x < a.x - epsilon || (Math.abs(b.x - a.x) < epsilon && b.z < a.z))
    [a, b] = [b, a];
  const dx = b.x - a.x,
    dz = b.z - a.z;
  return {
    ...wall,
    x: a.x,
    z: a.z,
    length: Math.hypot(dx, dz),
    orientation: Math.abs(dz) < epsilon ? 'horizontal' : 'vertical',
    angle: (Math.atan2(dz, dx) * 180) / Math.PI,
  };
}
const cross = (a: Point, b: Point) => a.x * b.z - a.z * b.x;
/** Parameters where a finite line meets the room boundary. */
function boundaryCuts(room: Room, a: Point, b: Point) {
  const d = {x: b.x - a.x, z: b.z - a.z};
  return roomSegments({...room, partitions: []}).flatMap((s) => {
    const e = {x: s.b.x - s.a.x, z: s.b.z - s.a.z};
    const denominator = cross(d, e);
    if (Math.abs(denominator) < 1e-7) return [];
    const q = {x: s.a.x - a.x, z: s.a.z - a.z};
    const t = cross(q, e) / denominator,
      u = cross(q, d) / denominator;
    return t > 0 && t < 1 && u >= 0 && u <= 1 ? [t] : [];
  });
}
function lineInRoom(
  room: Room,
  a: Point,
  b: Point,
  supports: ReturnType<typeof roomSegments> = [],
) {
  const cuts = [0, ...boundaryCuts(room, a, b), 1].sort((x, y) => x - y);
  return [0, 1, ...cuts.slice(1).map((t, i) => (t + cuts[i]) / 2)].every(
    (t) =>
      pointInRoom(room, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) ||
      supports.some(
        (s) =>
          distance({x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t}, s) <=
          wallThickness(room, s.id) + epsilon,
      ),
  );
}
const without = (room: Room, id: string) => ({
  ...room,
  partitions: room.partitions?.filter((p) => p.id !== id),
});
function intersections(room: Room, horizontal: boolean, across: number) {
  return roomSegments(room)
    .flatMap((s) => {
      const start = horizontal ? s.a.z : s.a.x,
        finish = horizontal ? s.b.z : s.b.x;
      if (Math.abs(finish - start) < epsilon) return [];
      const t = (across - start) / (finish - start);
      return t >= 0 && t <= 1
        ? [
            horizontal
              ? s.a.x + (s.b.x - s.a.x) * t
              : s.a.z + (s.b.z - s.a.z) * t,
          ]
        : [];
    })
    .sort((a, b) => a - b);
}
export function wallFits(room: Room, p: Partition) {
  if (!Number.isFinite(p.length) || p.length < minimum) return false;
  const candidateRoom = {
    ...without(room, p.id),
    partitions: [...(without(room, p.id).partitions ?? []), p],
  };
  const footprint = wallFootprint(candidateRoom, p.id);
  const {start: a, end: b} = partitionEnds(p);
  if (!lineInRoom(room, a, b)) return false;
  // A connected cap may meet the supporting perimeter's solid wall stock.
  const supports = roomSegments({...room, partitions: []}).filter(
    (s) => distance(a, s) < epsilon || distance(b, s) < epsilon,
  );
  if (
    !footprint.every((a, i) =>
      lineInRoom(room, a, footprint[(i + 1) % footprint.length], supports),
    )
  )
    return false;
  const tx = (b.x - a.x) / p.length,
    tz = (b.z - a.z) / p.length;
  return !roomSegments(without(room, p.id)).some((s) => {
    if (Math.abs(tx * s.tz - tz * s.tx) > epsilon) return false;
    const separation = Math.abs((s.a.x - a.x) * -tz + (s.a.z - a.z) * tx);
    const clearance =
      (wallThickness(room, p.id) +
        (room.partitions?.some((w) => w.id === s.id)
          ? wallThickness(room, s.id)
          : 0)) /
      2;
    const offsets = [s.a, s.b].map((v) => (v.x - a.x) * tx + (v.z - a.z) * tz);
    return (
      separation < clearance - epsilon &&
      Math.max(0, Math.min(...offsets)) <
        Math.min(p.length, Math.max(...offsets)) - epsilon
    );
  });
}
/** Span only the connected space containing the cursor, stopping at its first walls. */
export function previewInteriorWall(
  room: Room,
  cursor: Point,
): Partition | null {
  if (!pointInRoom(room, cursor.x, cursor.z)) return null;
  const nearest = roomSegments(room).sort(
    (a, b) => distance(cursor, a) - distance(cursor, b),
  )[0];
  const horizontal = !nearest.horizontal;
  const across = Math.round(horizontal ? cursor.z : cursor.x);
  const along = horizontal ? cursor.x : cursor.z;
  const hits = intersections(room, horizontal, across);
  const start = hits.filter((v) => v < along - epsilon).at(-1);
  const end = hits.find((v) => v > along + epsilon);
  if (start === undefined || end === undefined) return null;
  const p: Partition = {
    id: 'segment-preview',
    x: horizontal ? start : across,
    z: horizontal ? across : start,
    length: end - start,
    orientation: horizontal ? 'horizontal' : 'vertical',
  };
  return wallFits(room, p) ? p : null;
}
function snap(value: number, values: number[], tolerance: number) {
  const nearest = values
    .filter((v) => Math.abs(v - value) <= tolerance)
    .sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0];
  return nearest ?? Math.round(value);
}
export function resizeInteriorWall(
  room: Room,
  wall: Partition,
  end: 'start' | 'end',
  cursor: Point,
  tolerance = 4,
  free = false,
): Partition {
  if (free || wall.angle !== undefined) {
    const ends = partitionEnds(wall);
    const fixed = ends[end === 'start' ? 'end' : 'start'];
    let moved = {
      x: quantizePosition(cursor.x, room),
      z: quantizePosition(cursor.z, room),
    };
    if (!free) {
      const current = ends[end];
      const dx = current.x - fixed.x,
        dz = current.z - fixed.z;
      const length = Math.hypot(dx, dz);
      const ux = dx / length,
        uz = dz / length;
      const hits = roomSegments(without(room, wall.id)).flatMap((s) => {
        const e = {x: s.b.x - s.a.x, z: s.b.z - s.a.z};
        const denominator = cross({x: ux, z: uz}, e);
        if (Math.abs(denominator) < 1e-7) return [];
        const q = {x: s.a.x - fixed.x, z: s.a.z - fixed.z};
        const along = cross(q, e) / denominator,
          onSupport = cross(q, {x: ux, z: uz}) / denominator;
        return along >= minimum && onSupport >= 0 && onSupport <= 1
          ? [along]
          : [];
      });
      const along = Math.max(
        minimum,
        snap(
          ((cursor.x - fixed.x) * dx + (cursor.z - fixed.z) * dz) / length,
          hits,
          tolerance,
        ),
      );
      moved = {
        x: fixed.x + (dx * along) / length,
        z: fixed.z + (dz * along) / length,
      };
    } else if (tolerance > 0) {
      const nearest = roomSegments(without(room, wall.id))
        .map((s) => {
          const along = Math.max(
            0,
            Math.min(
              s.length,
              (moved.x - s.a.x) * s.tx + (moved.z - s.a.z) * s.tz,
            ),
          );
          return {x: s.a.x + along * s.tx, z: s.a.z + along * s.tz};
        })
        .sort(
          (a, b) =>
            Math.hypot(a.x - moved.x, a.z - moved.z) -
            Math.hypot(b.x - moved.x, b.z - moved.z),
        )[0];
      if (
        nearest &&
        Math.hypot(nearest.x - moved.x, nearest.z - moved.z) <= tolerance
      )
        moved = nearest;
    }
    const next =
      end === 'start'
        ? fromEnds(wall, moved, fixed)
        : fromEnds(wall, fixed, moved);
    return wallFits(room, next) ? next : wall;
  }
  const horizontal = wall.orientation === 'horizontal',
    axis = horizontal ? 'x' : 'z';
  const start = wall[axis],
    finish = start + wall.length;
  const coordinate = snap(
    cursor[axis],
    intersections(
      without(room, wall.id),
      horizontal,
      horizontal ? wall.z : wall.x,
    ),
    tolerance,
  );
  const nextStart =
    end === 'start' ? Math.min(coordinate, finish - minimum) : start;
  const nextEnd =
    end === 'end' ? Math.max(coordinate, start + minimum) : finish;
  const next = {...wall, [axis]: nextStart, length: nextEnd - nextStart};
  return wallFits(room, next) ? next : wall;
}
/** Move perpendicular to the wall. Attached ends follow their supporting walls; detached ends stay free. */
export function moveInteriorWall(
  room: Room,
  wall: Partition,
  position: number | Point,
  tolerance = 4,
): Partition {
  if (typeof position !== 'number') {
    const next = {
      ...wall,
      x: quantizePosition(position.x, room),
      z: quantizePosition(position.z, room),
    };
    return wallFits(room, next) ? next : wall;
  }
  const horizontal = wall.orientation === 'horizontal',
    axis = horizontal ? 'x' : 'z',
    cross = horizontal ? 'z' : 'x';
  const others = roomSegments(without(room, wall.id));
  const nextPosition = snap(
    position,
    others.flatMap((s) => [s.a[cross], s.b[cross]]),
    tolerance,
  );
  const ends = [wall[axis], wall[axis] + wall.length].map((value) => {
    const support = others.find(
      (s) =>
        s.horizontal !== horizontal &&
        Math.abs((horizontal ? s.x : s.z) - value) < epsilon &&
        distance(
          {x: horizontal ? value : wall.x, z: horizontal ? wall.z : value},
          s,
        ) < epsilon,
    );
    if (!support) return value;
    // Stop moving against a support that no longer reaches the new position.
    return (nextPosition >= support.a[cross] - epsilon &&
      nextPosition <= support.b[cross] + epsilon) ||
      (nextPosition >= support.b[cross] - epsilon &&
        nextPosition <= support.a[cross] + epsilon)
      ? value
      : null;
  });
  if (ends.some((v) => v === null)) return wall;
  const next = {...wall, [cross]: nextPosition};
  return wallFits(room, next) ? next : wall;
}
