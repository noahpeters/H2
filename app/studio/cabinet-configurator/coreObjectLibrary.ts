import {coreCabinetChoices} from './coreCabinets';
import {
  CORE_APPLIANCES,
  CORE_FIXTURES,
  CORE_SINKS,
  DOOR_TYPES,
} from './coreObjectCatalog';
import type {RoomElement, Opening} from './model';
import type {
  ObjectDefinition,
  ObjectDimensions,
  ObjectLibrary,
  ProceduralObjectAsset,
} from './objectLibrary';

export const CABINITRON_CORE: ObjectLibrary = {
  id: 'cabinitron-core',
  name: 'Cabinitron Core',
  scope: 'core',
  tenantId: null,
  visibility: 'public',
};
const zero = () => ({x: 0, y: 0, z: 0});
function coreObject(
  key: string,
  name: string,
  category: string,
  dimensions: ObjectDimensions,
  mountingPlane: ObjectDefinition['mountingPlane'],
): ObjectDefinition {
  return {
    id: `core:${key}`,
    libraryId: CABINITRON_CORE.id,
    tenantId: null,
    name,
    category,
    manufacturer: null,
    collection: null,
    sku: null,
    source: 'Cabinitron procedural geometry',
    sourceUrl: null,
    sourceFormat: 'procedural',
    canonicalAssetId: null,
    proceduralAssetId: `core-geometry:${key}`,
    dimensions: {
      width: dimensions.width,
      depth: dimensions.depth,
      height: dimensions.height,
    },
    // Existing renderers use bounding-box center, rather than bottom center.
    insertionOrigin: zero(),
    mountingPlane,
    mountingPoints: [],
    clearanceEnvelope: null,
    defaultOrientation: zero(),
    configurableDimensions: ['width', 'depth', 'height'],
    finishes: [],
    tags: [category],
    visibility: 'public',
  };
}

/** Catalog objects are reusable definitions, never room-instance dimensions/positions. */
export const CORE_OBJECTS: readonly ObjectDefinition[] = [
  ...coreCabinetChoices().map(({id, label, item}) =>
    coreObject(
      `cabinet:${id}`,
      label,
      'cabinet',
      item,
      item.kind === 'wall-cabinet' ? 'wall' : 'floor',
    ),
  ),
  ...Object.entries(CORE_APPLIANCES).map(([kind, entry]) =>
    coreObject(
      `appliance:${kind}`,
      entry.label,
      'appliance',
      entry,
      entry.elevation ? 'wall' : 'floor',
    ),
  ),
  ...Object.entries(CORE_FIXTURES).map(([kind, entry]) =>
    coreObject(
      `fixture:${kind}`,
      entry.label,
      'fixture',
      entry,
      kind === 'mirror' ? 'wall' : 'floor',
    ),
  ),
  ...Object.entries(CORE_SINKS).map(([kind, entry]) => {
    const object = coreObject(
      `sink:${kind}`,
      entry.label,
      'sink',
      entry,
      'countertop',
    );
    object.configurableDimensions = ['width', 'depth'];
    // Sink attachment coordinates are centered at the countertop plane.
    object.insertionOrigin = {x: 0, y: entry.height / 2, z: 0};
    return object;
  }),
  coreObject(
    'panel',
    'Finish panel',
    'panel',
    {width: 0.75, depth: 24, height: 34.5},
    'floor',
  ),
  coreObject(
    'pull',
    'Cabinet pull',
    'hardware',
    {width: 0.35, depth: 0.875, height: 4},
    'front',
  ),
  coreObject(
    'range-hood',
    'Range hood',
    'appliance',
    {width: 30, depth: 22, height: 4},
    'wall',
  ),
  ...DOOR_TYPES.map(([kind, label]) =>
    coreObject(
      `opening:${kind}`,
      label,
      'opening',
      {
        width: ['double-swing', 'sliding-glass', 'sliding-closet'].includes(
          kind,
        )
          ? 72
          : 30,
        depth: 4.5,
        height: 80,
      },
      'wall',
    ),
  ),
  coreObject(
    'opening:window',
    'Window',
    'opening',
    {width: 42, depth: 4.5, height: 38},
    'wall',
  ),
  coreObject(
    'opening:opening',
    'Doorless opening',
    'opening',
    {width: 96, depth: 4.5, height: 80},
    'wall',
  ),
  coreObject(
    'island',
    'Island countertop',
    'island',
    {width: 72, depth: 42, height: 1.5},
    'floor',
  ),
];

export const CORE_OBJECT_ASSETS: readonly ProceduralObjectAsset[] =
  CORE_OBJECTS.map((object) => {
    const key = object.id.slice('core:'.length);
    const generator: ProceduralObjectAsset['generator'] = key.startsWith(
      'cabinet:',
    )
      ? 'cabinet'
      : key.startsWith('fixture:')
        ? 'fixture'
        : key.startsWith('sink:')
          ? 'sink'
          : key.startsWith('appliance:')
            ? 'appliance'
            : key.startsWith('opening:')
              ? 'opening'
              : (key as 'panel' | 'pull' | 'range-hood' | 'island');
    return {
      id: object.proceduralAssetId!,
      tenantId: null,
      format: 'procedural',
      generator,
      variant: key,
    };
  });

const byId = new Map(CORE_OBJECTS.map((object) => [object.id, object]));
export function coreObjectById(id: string): ObjectDefinition | undefined {
  return byId.get(id);
}

/** Legacy and new rooms resolve alike, without persisting redundant type identity. */
export function coreObjectForElement(
  item: RoomElement,
): ObjectDefinition | undefined {
  if (item.customCabinet || item.kind === 'object') return undefined;
  const key =
    item.kind === 'fixture'
      ? `fixture:${item.fixtureKind ?? 'glass-shower'}`
      : item.kind === 'appliance'
        ? `appliance:${item.applianceKind ?? 'dishwasher'}`
        : item.kind === 'panel'
          ? 'panel'
          : `cabinet:${
              item.storage
                ? `open:${item.storage.type}`
                : item.kind === 'base'
                  ? item.configuration === 'corner'
                    ? 'corner'
                    : `base:${item.configuration ?? 'single-door'}`
                  : item.kind === 'tall'
                    ? `tall:${item.tallConfiguration ?? 'standard'}`
                    : 'wall'
            }`;
  return coreObjectById(`core:${key}`);
}

export function coreObjectForOpening(
  opening: Opening,
): ObjectDefinition | undefined {
  return coreObjectById(
    `core:opening:${opening.kind === 'door' ? (opening.doorType ?? 'swing') : opening.kind}`,
  );
}

/** Lightweight renderer reference: full metadata remains in the catalog. */
export function coreObjectReference(object: ObjectDefinition | undefined) {
  return object
    ? {libraryId: object.libraryId, objectId: object.id}
    : undefined;
}
