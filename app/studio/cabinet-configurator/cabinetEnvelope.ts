import type {KitchenElement, Room} from './model';

export const DEFAULT_TOE_KICK = {height: 4, setback: 3} as const;

/** Room-owned support space, outside every base cabinet's editable composition. */
export function baseToeKick(
  item: KitchenElement,
  room?: Pick<Room, 'toeKick'>,
) {
  if (item.kind !== 'base') return {height: 0, setback: 0};
  const settings = room?.toeKick ?? DEFAULT_TOE_KICK;
  return {
    height: Math.min(settings.height, item.height / 3),
    setback: Math.min(settings.setback, Math.max(0, item.depth - 0.75)),
  };
}

export function cabinetCompositionEnvelope(
  item: KitchenElement,
  room?: Pick<Room, 'toeKick'>,
) {
  return {
    width: item.width,
    height: item.height - baseToeKick(item, room).height,
    depth: item.depth,
  };
}
