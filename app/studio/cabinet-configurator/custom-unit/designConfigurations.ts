import {cabinetCompositionEnvelope} from '../cabinetEnvelope';
import type {KitchenElement, Room} from '../model';
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
};
export const configurationCategory = (item: KitchenElement) =>
  item.storage
    ? `${item.kind}:storage:${item.storage.type}`
    : item.kind === 'base' && item.configuration === 'corner'
      ? 'base:corner'
      : item.kind;
export function compatibleConfiguration(
  item: KitchenElement,
  configuration: DesignConfiguration,
) {
  return (
    item.kind !== 'appliance' &&
    configurationCategory(item) === configuration.category
  );
}

/** Fit composition to an instance without changing the instance envelope. */
export function fitDefinition(
  source: CustomUnitDefinition,
  envelope: Pick<KitchenElement, 'width' | 'height' | 'depth'>,
): CustomUnitDefinition {
  const result = structuredClone(source);
  for (const [field, axis] of [
    ['width', 'x'],
    ['height', 'y'],
    ['depth', 'z'],
  ] as const) {
    const ratio = envelope[field] / source[field];
    result.parts?.forEach((part) => {
      const size = part[field] > 0.75 ? part[field] * ratio : part[field];
      part[axis] =
        Math.abs(part[axis] + part[field] - source[field]) < 0.001
          ? envelope[field] - size
          : part[axis] * ratio;
      part[field] = size;
    });
    result[field] = envelope[field];
  }
  return result;
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
  item: KitchenElement,
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
  item: KitchenElement,
  configuration: DesignConfiguration,
  room?: Pick<Room, 'toeKick'>,
): KitchenElement {
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
export function saveConfiguration(
  configurations: DesignConfiguration[],
  item: KitchenElement,
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
  };
  return {
    configurations: [
      ...configurations.filter((c) => c.id !== configuration.id),
      configuration,
    ],
    item: applyConfiguration(item, configuration, room),
  };
}
