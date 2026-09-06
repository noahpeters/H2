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
    const along = wall.horizontal ? x - wall.x : z - wall.z;
    const offset = Math.max(
      0,
      Math.min(
        Math.floor(wall.length - opening.width),
        Math.round(along - opening.width / 2),
      ),
    );
    const centerX = wall.x + (wall.horizontal ? offset + opening.width / 2 : 0);
    const centerZ = wall.z + (wall.horizontal ? 0 : offset + opening.width / 2);
    const next = Math.hypot(x - centerX, z - centerZ);
    if (next < distance) {
      distance = next;
      best = {wall: wall.id, offset};
    }
  }
  return best;
}
