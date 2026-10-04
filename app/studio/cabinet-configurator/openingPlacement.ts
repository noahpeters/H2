import type {Room, Wall} from './model';
import {roomSegments} from './roomOutline';

/** Project the desired opening center onto a wall that can contain its width. */
export function placeOpening(
  room: Room,
  opening: {wall: Wall; width: number; offset: number},
  x: number,
  z: number,
) {
  let best = {wall: opening.wall, offset: opening.offset};
  let distance = Infinity;
  const segments = roomSegments(room).sort(
    (a, b) => Number(b.id === opening.wall) - Number(a.id === opening.wall),
  );
  for (const wall of segments) {
    if (wall.length < opening.width) continue;
    const dx = x - wall.a.x,
      dz = z - wall.a.z,
      along = wall.horizontal
        ? x - wall.x
        : wall.tx === 0
          ? z - wall.z
          : dx * wall.tx + dz * wall.tz;
    const offset = Math.max(
      0,
      Math.min(
        Math.floor(wall.length - opening.width),
        Math.round(along - opening.width / 2),
      ),
    );
    const center = wallPointAt(wall, offset + opening.width / 2);
    const centerX = center.x;
    const centerZ = center.z;
    const next = Math.hypot(x - centerX, z - centerZ);
    if (next < distance) {
      distance = next;
      best = {wall: wall.id, offset};
    }
  }
  return best;
}

function wallPointAt(
  wall: ReturnType<typeof roomSegments>[number],
  offset: number,
) {
  if (wall.horizontal) return {x: wall.x + offset, z: wall.z};
  if (wall.tx === 0) return {x: wall.x, z: wall.z + offset};
  return {x: wall.a.x + wall.tx * offset, z: wall.a.z + wall.tz * offset};
}
