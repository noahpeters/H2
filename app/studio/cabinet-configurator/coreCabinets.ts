import type {CabinetTypeChoice} from './cabinetTypes';
import type {RoomElement} from './model';
import {BASE_CABINET_TYPES} from './baseCabinetTypes';
import {OPEN_STORAGE, createOpenStorage, type StorageKind} from './openStorage';
const base: RoomElement = {
  id: 'preview',
  kind: 'base',
  width: 30,
  height: 34.5,
  depth: 24,
  face: 'shaker',
  placement: {mode: 'wall', wall: 'back', offset: 0, elevation: 0},
};
export function coreCabinetChoices(): CabinetTypeChoice[] {
  return [
    ...BASE_CABINET_TYPES.map(([kind, label]) => ({
      id: `base:${kind}`,
      label,
      category: 'Base' as const,
      item: {
        ...base,
        configuration: kind,
        width: kind === 'farmhouse-sink' ? 36 : 30,
      },
    })),
    {
      id: 'wall',
      label: 'Standard wall cabinet',
      category: 'Wall',
      item: {
        ...base,
        kind: 'wall-cabinet',
        height: 30,
        depth: 12,
        placement: {...base.placement, elevation: 54},
      },
    },
    ...(
      [
        ['standard', 'Standard cabinet'],
        ['one-oven', '1 oven · drawers below'],
        ['two-oven', '2 ovens · drawers below'],
        ['coffee-maker', 'Coffee maker · counter height'],
      ] as const
    ).map(([kind, label]) => ({
      id: `tall:${kind}`,
      label,
      category: 'Tall' as const,
      item: {
        ...base,
        kind: 'tall' as const,
        height: kind === 'two-oven' ? 90 : 84,
        tallConfiguration: kind,
      },
    })),
    {
      id: 'corner',
      label: 'L-shaped corner base',
      category: 'Base',
      item: {...base, configuration: 'corner', width: 36, depth: 36},
    },
    ...Object.entries(OPEN_STORAGE).map(([kind, label]) => ({
      id: `open:${kind}`,
      label,
      category:
        createOpenStorage(kind as StorageKind, 'preview').kind ===
        'wall-cabinet'
          ? ('Wall' as const)
          : ('Tall' as const),
      item: createOpenStorage(kind as StorageKind, 'preview'),
    })),
  ];
}
