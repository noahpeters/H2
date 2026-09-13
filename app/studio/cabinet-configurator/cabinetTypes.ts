import {BASE_CABINET_TYPES} from './baseCabinetTypes';
import {OPEN_STORAGE, createOpenStorage, type StorageKind} from './openStorage';
import {
  applyConfiguration,
  type DesignConfiguration,
} from './custom-unit/designConfigurations';
import type {RoomElement, Room} from './model';
export const CABINET_CATEGORIES = [
  'Base',
  'Wall',
  'Tall',
  'Corner',
  'Open',
] as const;
export type CabinetCategory = (typeof CABINET_CATEGORIES)[number];
export type CabinetTypeChoice = {
  id: string;
  label: string;
  category: CabinetCategory;
  item: RoomElement;
  configuration?: DesignConfiguration;
};
export function cabinetCategory(item: RoomElement): CabinetCategory {
  return item.storage
    ? 'Open'
    : item.configuration === 'corner'
      ? 'Corner'
      : item.kind === 'wall-cabinet'
        ? 'Wall'
        : item.kind === 'tall'
          ? 'Tall'
          : 'Base';
}
const base: RoomElement = {
  id: 'preview',
  kind: 'base',
  width: 30,
  height: 34.5,
  depth: 24,
  face: 'shaker',
  placement: {mode: 'wall', wall: 'back', offset: 0, elevation: 0},
};
export function cabinetTypes(
  configurations: DesignConfiguration[] = [],
  elements: RoomElement[] = [],
): CabinetTypeChoice[] {
  const standards: CabinetTypeChoice[] = [
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
      category: 'Corner',
      item: {...base, configuration: 'corner', width: 36, depth: 36},
    },
    ...Object.entries(OPEN_STORAGE).map(([kind, label]) => ({
      id: `open:${kind}`,
      label,
      category: 'Open' as const,
      item: createOpenStorage(kind as StorageKind, 'preview'),
    })),
  ];
  return [
    ...standards,
    ...configurations.flatMap((configuration) => {
      const template = standards.find(
        (c) =>
          configuration.category ===
          (c.item.storage
            ? `${c.item.kind}:storage:${c.item.storage.type}`
            : c.category === 'Corner'
              ? 'base:corner'
              : c.item.kind),
      );
      if (!template) return [];
      const source = elements.find(
        (e) =>
          e.customCabinet?.scope === 'design' &&
          e.customCabinet.libraryId === configuration.id,
      );
      const item = {
        ...(source ?? template.item),
        id: 'preview',
        customCabinet: {
          scope: 'design' as const,
          libraryId: configuration.id,
          libraryVersion: configuration.version,
          definition: configuration.definition,
        },
      };
      return [
        {
          id: configuration.id,
          label: configuration.name,
          category: template.category,
          item,
          configuration,
        },
      ];
    }),
  ];
}
export function selectedCabinetType(item: RoomElement) {
  if (item.customCabinet) return item.customCabinet.libraryId;
  if (item.storage) return `open:${item.storage.type}`;
  if (item.configuration === 'corner') return 'corner';
  if (item.kind === 'base')
    return `base:${item.configuration ?? 'single-door'}`;
  return item.kind === 'tall'
    ? `tall:${item.tallConfiguration ?? 'standard'}`
    : 'wall';
}
export function applyCabinetType(
  item: RoomElement,
  choice: CabinetTypeChoice,
  room: Room,
): RoomElement {
  const next = {
    ...item,
    kind: choice.item.kind,
    configuration: choice.item.configuration,
    tallConfiguration: choice.item.tallConfiguration,
    storage: choice.item.storage ? {...choice.item.storage} : undefined,
    customCabinet: undefined,
    sink: choice.item.sink,
  };
  return choice.configuration
    ? applyConfiguration(next, choice.configuration, room)
    : next;
}
