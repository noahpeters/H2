import {cabinetToeKick} from './cabinetEnvelope';
import {wallToFloor, type Room, type RoomElement} from './model';

export type ToeKickRun = {width: number; x: number; hidden?: boolean};

/** One uninterrupted support panel for each touching, straight cabinet run. */
export function continuousToeKicks(elements: RoomElement[], room: Room) {
  const result = new Map<string, ToeKickRun>();
  const eligible = elements.filter(
    (item) =>
      ['base', 'tall'].includes(item.kind) &&
      item.configuration !== 'corner' &&
      !item.customCabinet?.definition.curve &&
      !item.customCabinet?.definition.profile &&
      item.storage?.type !== 'floating-shelves',
  );
  const close = (a: number, b: number) => Math.abs(a - b) < 0.0001;
  const finish = (item: RoomElement) =>
    JSON.stringify([
      item.materialId,
      item.material,
      item.materialDefinition,
      item.paintColor,
      item.flatGrain,
    ]);
  const remaining = new Set(eligible);
  for (const owner of eligible) {
    if (!remaining.delete(owner)) continue;
    const origin = wallToFloor(owner, room);
    const angle = (origin.rotation * Math.PI) / 180;
    const toe = cabinetToeKick(owner, room);
    let left = -owner.width / 2,
      right = owner.width / 2;
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of remaining) {
        const position = wallToFloor(item, room);
        const support = cabinetToeKick(item, room);
        const dx = position.x - origin.x,
          dz = position.z - origin.z;
        const x = dx * Math.cos(angle) + dz * Math.sin(angle);
        const across = -dx * Math.sin(angle) + dz * Math.cos(angle);
        if (
          !close(
            (((position.rotation - origin.rotation) % 360) + 360) % 360,
            0,
          ) ||
          !close(across, 0) ||
          !close(item.depth, owner.depth) ||
          !close(support.height, toe.height) ||
          !close(support.setback, toe.setback) ||
          !close(
            item.placement.elevation ?? 0,
            owner.placement.elevation ?? 0,
          ) ||
          finish(item) !== finish(owner) ||
          (!close(x - item.width / 2, right) &&
            !close(x + item.width / 2, left))
        )
          continue;
        left = Math.min(left, x - item.width / 2);
        right = Math.max(right, x + item.width / 2);
        result.set(item.id, {width: item.width, x: 0, hidden: true});
        remaining.delete(item);
        changed = true;
      }
    }
    result.set(owner.id, {width: right - left, x: (right + left) / 2});
  }
  return result;
}
