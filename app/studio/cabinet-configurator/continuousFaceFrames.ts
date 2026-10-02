import {wallToFloor, type Room, type RoomElement} from './model';
import {cabinetToeKick} from './cabinetEnvelope';

export type FrameNeighbors = {left?: string; right?: string};
/** Matching front planes and stock heights define straight, buildable frame runs. */
export function continuousFrameNeighbors(elements: RoomElement[], room: Room) {
  const neighbors = new Map<string, FrameNeighbors>();
  if (
    !room.continuousFaceFrames ||
    !['inset', 'partial-overlay'].includes(room.overlay ?? 'full-overlay')
  )
    return neighbors;
  const eligible = elements.filter(
    (e) =>
      ['base', 'tall', 'wall-cabinet'].includes(e.kind) &&
      !e.customCabinet &&
      e.configuration !== 'corner' &&
      (!e.storage || e.storage.doors || e.storage.drawers),
  );
  const close = (a: number, b: number) => Math.abs(a - b) < 0.0001;
  const finish = (e: RoomElement) =>
    JSON.stringify([
      e.materialId,
      e.material,
      e.materialDefinition,
      e.paintColor,
      e.flatGrain,
    ]);
  for (let i = 0; i < eligible.length; i++)
    for (let k = i + 1; k < eligible.length; k++) {
      const a = eligible[i],
        b = eligible[k],
        ta = wallToFloor(a, room),
        tb = wallToFloor(b, room);
      const toeA = cabinetToeKick(a, room).height,
        toeB = cabinetToeKick(b, room).height;
      if (
        !close((((ta.rotation - tb.rotation) % 360) + 360) % 360, 0) ||
        !close(a.depth, b.depth) ||
        !close(a.height - toeA, b.height - toeB) ||
        !close(
          (a.placement.elevation ?? 0) + toeA,
          (b.placement.elevation ?? 0) + toeB,
        ) ||
        finish(a) !== finish(b)
      )
        continue;
      const fA = Math.min(1.5, a.width / 6, (a.height - toeA) / 6),
        fB = Math.min(1.5, b.width / 6, (b.height - toeB) / 6);
      if (!close(fA, fB)) continue;
      const angle = (ta.rotation * Math.PI) / 180,
        dx = tb.x - ta.x,
        dz = tb.z - ta.z;
      const along = dx * Math.cos(angle) + dz * Math.sin(angle),
        across = -dx * Math.sin(angle) + dz * Math.cos(angle);
      if (!close(across, 0) || !close(Math.abs(along), (a.width + b.width) / 2))
        continue;
      const left = along > 0 ? a : b,
        right = left === a ? b : a;
      neighbors.set(left.id, {...neighbors.get(left.id), right: right.id});
      neighbors.set(right.id, {...neighbors.get(right.id), left: left.id});
    }
  return neighbors;
}
