import {reflowDrawerArrays} from './drawerArrayEditing';
import {refitDrawerArray} from './drawerArrays';
import {cabinetCompositionEnvelope} from '../cabinetEnvelope';
import type {RoomElement, Room} from '../model';
import {
  createCustomUnit,
  customUnitId,
  validateCustomUnit,
  type CustomUnitDefinition,
  type CustomUnitNode,
  type SectionType,
} from './model';

export type DesignConfiguration = {
  id: string;
  version: number;
  name: string;
  category: string;
  definition: CustomUnitDefinition;
  /** Catalog template independent of any placed instance. */
  template?: RoomElement;
};
export const configurationCategory = (item: RoomElement) =>
  item.storage
    ? `${item.kind}:storage:${item.storage.type}`
    : item.kind === 'base' && item.configuration === 'corner'
      ? 'base:corner'
      : item.kind;
export function compatibleConfiguration(
  item: RoomElement,
  configuration: DesignConfiguration,
) {
  return (
    item.kind !== 'appliance' &&
    item.kind !== 'fixture' &&
    configurationCategory(item) === configuration.category
  );
}

/** Fit composition to an instance without changing the instance envelope. */
export function fitDefinition(
  source: CustomUnitDefinition,
  envelope: Pick<RoomElement, 'width' | 'height' | 'depth'>,
): CustomUnitDefinition {
  const result = structuredClone(source);
  for (const [field, axis] of [
    ['width', 'x'],
    ['height', 'y'],
    ['depth', 'z'],
  ] as const) {
    const ratio = envelope[field] / source[field];
    result.parts?.forEach((part) => {
      if (part.drawerArray && axis !== 'z') {
        part.drawerArray.opening[axis] *= ratio;
        part.drawerArray.opening[field] *= ratio;
      }
      const size = part[field] > 0.75 ? part[field] * ratio : part[field];
      part[axis] =
        Math.abs(part[axis] + part[field] - source[field]) < 0.001
          ? envelope[field] - size
          : part[axis] * ratio;
      part[field] = size;
    });
    result[field] = envelope[field];
  }
  result.parts = result.parts?.map((part) =>
    part.drawerArray ? refitDrawerArray(result, part) : part,
  );
  return reflowDrawerArrays(result);
}
const section = (
  sectionType: SectionType,
  properties?: {drawerCount?: number; shelfCount?: number; doorCount?: 1 | 2},
): CustomUnitNode => ({
  id: customUnitId(),
  type: 'section',
  sectionType,
  properties,
});
export function configurationTemplate(
  item: RoomElement,
  room?: Pick<Room, 'toeKick'>,
): CustomUnitDefinition {
  const envelope = cabinetCompositionEnvelope(item, room);
  if (item.customCabinet)
    return fitDefinition(item.customCabinet.definition, envelope);
  let root = section('doors', {doorCount: item.width > 24 ? 2 : 1});
  if (item.storage)
    root = section(
      item.storage.doors
        ? 'doors'
        : item.storage.drawers
          ? 'drawer-stack'
          : 'shelves',
      {shelfCount: item.storage.shelves, drawerCount: item.storage.drawers},
    );
  else if (item.configuration === 'three-drawer')
    root = section('drawer-stack', {drawerCount: 3});
  else if (item.configuration === 'door-drawer')
    root = {
      id: customUnitId(),
      type: 'division',
      axis: 'horizontal',
      weights: [4, 1],
      children: [root, section('drawers', {drawerCount: 1})],
    };
  else if (
    item.configuration === 'microwave-drawer' ||
    (item.tallConfiguration && item.tallConfiguration !== 'standard')
  )
    root = {
      id: customUnitId(),
      type: 'division',
      axis: 'horizontal',
      weights: [1, 2, 1],
      children: [root, section('open'), section('doors')],
    };
  return createCustomUnit({
    ...envelope,
    name: `Custom ${item.storage?.type ?? item.tallConfiguration ?? item.configuration ?? item.kind}`.replaceAll(
      '-',
      ' ',
    ),
    root,
  });
}
export function applyConfiguration(
  item: RoomElement,
  configuration: DesignConfiguration,
  room?: Pick<Room, 'toeKick'>,
): RoomElement {
  if (!compatibleConfiguration(item, configuration))
    throw new Error(
      'This configuration is not compatible with this cabinet category.',
    );
  const definition = fitDefinition(
    configuration.definition,
    cabinetCompositionEnvelope(item, room),
  );
  const errors = validateCustomUnit(definition);
  if (errors.length) throw new Error(errors.join('\n'));
  return {
    ...item,
    customCabinet: {
      scope: 'design',
      libraryId: configuration.id,
      libraryVersion: configuration.version,
      definition,
    },
  };
}
export function cabinetTypeTemplate(item: RoomElement): RoomElement {
  return {
    ...structuredClone(item),
    id: 'preview',
    customCabinet: undefined,
    islandId: undefined,
    placement: {
      mode: 'wall',
      wall: 'back',
      offset: 0,
      elevation:
        item.kind === 'wall-cabinet' ? (item.placement.elevation ?? 54) : 0,
    },
  };
}
export function saveConfiguration(
  configurations: DesignConfiguration[],
  item: RoomElement,
  definition: CustomUnitDefinition,
  room?: Pick<Room, 'toeKick'>,
) {
  const name = definition.name.trim();
  if (!name || name.length > 100)
    throw new Error('Enter a configuration name of 1–100 characters.');
  const fitted = fitDefinition(
    {...definition, name},
    cabinetCompositionEnvelope(item, room),
  );
  const errors = validateCustomUnit(fitted);
  if (errors.length) throw new Error(errors.join('\n'));
  const previous =
    item.customCabinet?.scope === 'design'
      ? configurations.find((c) => c.id === item.customCabinet?.libraryId)
      : undefined;
  const configuration: DesignConfiguration = {
    id: previous?.id ?? customUnitId('configuration'),
    version: (previous?.version ?? 0) + 1,
    name,
    category: configurationCategory(item),
    definition: fitted,
    template: cabinetTypeTemplate(item),
  };
  return {
    configurations: [
      ...configurations.filter((c) => c.id !== configuration.id),
      configuration,
    ],
    item: applyConfiguration(item, configuration, room),
  };
}
