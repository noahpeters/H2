import type {RoomElement, Room} from './model';

export const DEFAULT_TOE_KICK = {height: 4, setback: 3} as const;

/** Room-owned support space, outside every floor cabinet's editable composition. */
export function cabinetToeKick(
  item: RoomElement,
  room?: Pick<Room, 'toeKick'>,
) {
  if (item.kind !== 'base' && item.kind !== 'tall')
    return {height: 0, setback: 0};
  const settings = room?.toeKick ?? DEFAULT_TOE_KICK;
  return {
    height: Math.min(settings.height, item.height / 3),
    setback: Math.min(settings.setback, Math.max(0, item.depth - 0.75)),
  };
}

export function cabinetCompositionEnvelope(
  item: RoomElement,
  room?: Pick<Room, 'toeKick'>,
) {
  return {
    width: item.width,
    height: item.height - cabinetToeKick(item, room).height,
    depth: item.depth,
  };
}
