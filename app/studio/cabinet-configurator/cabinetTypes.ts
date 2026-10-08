import {
  customCabinetElement,
  type CustomCabinetLibraryItem,
} from './custom-unit/library';
import {cabinetCompositionEnvelope} from './cabinetEnvelope';
import {fitDefinition} from './custom-unit/designConfigurations';
import {coreCabinetChoices} from './coreCabinets';
import {
  applyConfiguration,
  type DesignConfiguration,
} from './custom-unit/designConfigurations';
import type {RoomElement, Room} from './model';
export const CABINET_CATEGORIES = ['Base', 'Wall', 'Tall'] as const;
export type CabinetCategory = (typeof CABINET_CATEGORIES)[number];
export type CabinetTypeChoice = {
  id: string;
  label: string;
  category: CabinetCategory;
  item: RoomElement;
  configuration?: DesignConfiguration;
};
export function cabinetCategory(item: RoomElement): CabinetCategory {
  return item.kind === 'wall-cabinet'
    ? 'Wall'
    : item.kind === 'tall'
      ? 'Tall'
      : 'Base';
}
export function cabinetTypes(
  configurations: DesignConfiguration[] = [],
  elements: RoomElement[] = [],
  library: CustomCabinetLibraryItem[] = [],
): CabinetTypeChoice[] {
  const standards = coreCabinetChoices();
  return [
    ...standards,
    ...library
      .filter((c) => c.status === 'published')
      .map((c) => {
        const item = customCabinetElement(c, 'preview');
        return {
          id: `library:${c.id}`,
          label: c.name,
          category: cabinetCategory(item),
          item,
        };
      }),
    ...elements
      .filter(
        (e, index) =>
          e.customCabinet &&
          e.customCabinet.scope !== 'design' &&
          !library.some(
            (c) =>
              c.status === 'published' && c.id === e.customCabinet!.libraryId,
          ) &&
          elements.findIndex(
            (other) =>
              other.customCabinet?.scope !== 'design' &&
              other.customCabinet?.libraryId === e.customCabinet!.libraryId,
          ) === index,
      )
      .map((item) => ({
        id: `library:${item.customCabinet!.libraryId}`,
        label: item.customCabinet!.definition.name,
        category: cabinetCategory(item),
        item,
      })),
    ...configurations.flatMap((configuration) => {
      const template = standards.find(
        (c) =>
          configuration.category ===
          (c.item.storage
            ? `${c.item.kind}:storage:${c.item.storage.type}`
            : c.item.configuration === 'corner'
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
        ...(configuration.template ?? source ?? template.item),
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
  if (item.customCabinet)
    return item.customCabinet.scope === 'design'
      ? item.customCabinet.libraryId
      : `library:${item.customCabinet.libraryId}`;
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
  if (item.kind !== choice.item.kind)
    throw new Error('Choose a type from the same cabinet category.');
  const next = {
    ...item,
    kind: choice.item.kind,
    configuration: choice.item.configuration,
    tallConfiguration: choice.item.tallConfiguration,
    storage: choice.item.storage ? {...choice.item.storage} : undefined,
    customCabinet:
      choice.item.customCabinet?.scope !== 'design' && choice.item.customCabinet
        ? {
            ...choice.item.customCabinet,
            definition: fitDefinition(
              choice.item.customCabinet.definition,
              cabinetCompositionEnvelope(item, room),
            ),
          }
        : undefined,
    sink: choice.item.sink,
  };
  return choice.configuration
    ? applyConfiguration(next, choice.configuration, room)
    : next;
}
