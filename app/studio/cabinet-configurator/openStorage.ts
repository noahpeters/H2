import type {KitchenElement} from './model';
export const OPEN_STORAGE = {
  shelving: 'Adjustable shelving',
  'single-hang': 'Single-hang wardrobe',
  'double-hang': 'Double-hang wardrobe',
  drawers: 'Drawer tower',
  combination: 'Shelf-and-hang combination',
  shoes: 'Shoe storage',
  overhead: 'Overhead storage',
} as const;
export type StorageKind = keyof typeof OPEN_STORAGE;
export type OpenStorage = {
  type: StorageKind;
  shelves: number;
  drawers: number;
  rodHeight: number;
  lowerRodHeight: number;
  shelfSpacing: number;
  dividerPercent: number;
  doors: boolean;
  back: boolean;
  angled: boolean;
};
export function storageDefaults(type: StorageKind): OpenStorage {
  return {
    type,
    shelves:
      type === 'shoes'
        ? 8
        : type === 'shelving' || type === 'combination'
          ? 5
          : type === 'drawers' || type === 'overhead'
            ? 2
            : 1,
    drawers: type === 'drawers' ? 4 : 0,
    rodHeight: 68,
    lowerRodHeight: 36,
    shelfSpacing: 0,
    dividerPercent: 40,
    doors: false,
    back: true,
    angled: type === 'shoes',
  };
}
export function createOpenStorage(
  type: StorageKind,
  id: string,
): KitchenElement {
  return {
    id,
    kind: type === 'overhead' ? 'wall-cabinet' : 'tall',
    width: type === 'combination' ? 48 : 30,
    depth:
      type === 'shoes'
        ? 16
        : type === 'shelving' || type === 'overhead'
          ? 16
          : 24,
    height: type === 'overhead' ? 24 : 84,
    face: 'slab',
    storage: storageDefaults(type),
    placement: {
      mode: 'wall',
      wall: 'back',
      offset: 12,
      elevation: type === 'overhead' ? 72 : 0,
    },
  };
}
export function validStorage(value: unknown): value is OpenStorage {
  if (!value || typeof value !== 'object') return false;
  const s = value as OpenStorage;
  const range = (n: number, low: number, high: number) =>
    Number.isFinite(n) && n >= low && n <= high;
  return (
    Object.hasOwn(OPEN_STORAGE, s.type) &&
    Number.isInteger(s.shelves) &&
    range(s.shelves, 0, 20) &&
    Number.isInteger(s.drawers) &&
    (s.type === 'drawers' ? range(s.drawers, 1, 10) : s.drawers === 0) &&
    range(s.rodHeight, 6, 120) &&
    range(s.lowerRodHeight, 6, 120) &&
    range(s.shelfSpacing, 0, 36) &&
    range(s.dividerPercent, 20, 80) &&
    [s.doors, s.back, s.angled].every((v) => typeof v === 'boolean')
  );
}
/** Shared physical layout, inches relative to the cabinet bottom. */
export function storageLayout(item: KitchenElement) {
  const s = item.storage!;
  const toe = item.kind === 'wall-cabinet' ? 0 : 4;
  const low = toe + 0.75,
    high = item.height - 0.75;
  const usable = high - low;
  const inner = item.width - 1.5;
  const divider =
    s.type === 'combination' ? (inner * s.dividerPercent) / 100 : 0;
  const shelfWidth = divider ? divider - 0.375 : inner;
  const shelfX = divider ? -inner / 2 + shelfWidth / 2 : 0;
  const rodWidth = divider ? inner - divider - 0.375 : inner;
  const rodX = divider ? inner / 2 - rodWidth / 2 : 0;
  const drawers =
    s.type === 'drawers' ? Math.min(s.drawers, Math.floor(usable / 6)) : 0;
  const drawerZone = drawers
    ? Math.min(drawers * 8, usable * (s.shelves ? 0.65 : 1))
    : 0;
  const doubleRod = s.type === 'double-hang' && usable >= 12;
  const upperRod = Math.max(
    low + (doubleRod ? 8 : 3),
    Math.min(high - 4, s.rodHeight),
  );
  const rods = ['single-hang', 'double-hang', 'combination'].includes(s.type)
    ? [
        upperRod,
        ...(doubleRod
          ? [
              Math.max(
                low + 2,
                Math.min(high - 8, s.lowerRodHeight, upperRod - 6),
              ),
            ]
          : []),
      ]
    : [];
  const shoeRise =
    s.type === 'shoes' && s.angled
      ? ((item.depth - 0.75) / 2) * Math.sin((12 * Math.PI) / 180) + 1
      : 0;
  const shelfLow = low + drawerZone + shoeRise;
  const shelfHigh = high - shoeRise;
  const minGap = Math.max(3, shoeRise * 2);
  const count = Math.min(
    s.shelves,
    Math.max(0, Math.floor((shelfHigh - shelfLow) / minGap) - 1),
  );
  const hanging = s.type === 'single-hang' || s.type === 'double-hang';
  const shelfYs = hanging
    ? s.shelves
      ? [Math.min(high - 1, rods[0] + 2)]
      : []
    : Array.from(
        {length: count},
        (_, i) =>
          shelfLow +
          (i + 1) *
            Math.min(
              s.shelfSpacing ? Math.max(minGap, s.shelfSpacing) : Infinity,
              (shelfHigh - shelfLow) / (count + 1),
            ),
      );
  return {
    toe,
    low,
    high,
    inner,
    divider,
    shelfWidth,
    shelfX,
    rodWidth,
    rodX,
    drawers,
    drawerZone,
    rods,
    shelfYs,
  };
}
