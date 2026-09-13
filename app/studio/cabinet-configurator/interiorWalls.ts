import type {Partition, Room} from './model';
import {boxInRoom, pointInRoom, roomSegments, roomPoints} from './roomOutline';
type Point = {x: number; z: number};
const minimum = 6;
const epsilon = 0.01;
const distance = (p: Point, s: ReturnType<typeof roomSegments>[number]) =>
  Math.hypot(
    p.x - Math.max(s.x, Math.min(s.x + (s.horizontal ? s.length : 0), p.x)),
    p.z - Math.max(s.z, Math.min(s.z + (s.horizontal ? 0 : s.length), p.z)),
  );
const without = (room: Room, id: string) => ({
  ...room,
  partitions: room.partitions?.filter((p) => p.id !== id),
});
function intersections(room: Room, horizontal: boolean, across: number) {
  return roomSegments(room)
    .filter(
      (s) =>
        s.horizontal !== horizontal &&
        across >= (horizontal ? s.z : s.x) - epsilon &&
        across <= (horizontal ? s.z : s.x) + s.length + epsilon,
    )
    .map((s) => (horizontal ? s.x : s.z))
    .sort((a, b) => a - b);
}
export function wallFits(room: Room, p: Partition) {
  const horizontal = p.orientation === 'horizontal',
    axis = horizontal ? 'x' : 'z';
  const start = p[axis],
    end = start + p.length;
  const breaks = [
    start,
    ...roomPoints(room)
      .map((point) => point[axis])
      .filter((v) => v > start && v < end),
    end,
  ].sort((a, b) => a - b);
  return (
    p.length >= minimum &&
    boxInRoom(room, {
      left: p.x,
      right: p.x + (horizontal ? p.length : 0),
      top: p.z,
      bottom: p.z + (horizontal ? 0 : p.length),
    }) &&
    breaks
      .slice(1)
      .every((v, i) =>
        pointInRoom(
          room,
          horizontal ? (v + breaks[i]) / 2 : p.x,
          horizontal ? p.z : (v + breaks[i]) / 2,
        ),
      ) &&
    !roomSegments(without(room, p.id)).some(
      (s) =>
        s.horizontal === horizontal &&
        Math.abs((horizontal ? s.z : s.x) - (horizontal ? p.z : p.x)) <
          epsilon &&
        Math.max(start, horizontal ? s.x : s.z) <
          Math.min(end, (horizontal ? s.x : s.z) + s.length) - epsilon,
    )
  );
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
): Partition {
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
  position: number,
  tolerance = 4,
): Partition {
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
