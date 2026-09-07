import {CABINET_MATERIALS, CABINET_PAINTS} from './materials';
import {validStorage, type OpenStorage} from './openStorage';
import type {KitchenElement, Room} from './model';

export const CREATION_PREFERENCES_KEY =
  'from-trees:configurator-creation-preferences';

type Profile = Partial<
  Pick<
    KitchenElement,
    | 'width'
    | 'depth'
    | 'height'
    | 'face'
    | 'hinge'
    | 'applianceFront'
    | 'rangeHood'
    | 'configuration'
    | 'tallConfiguration'
    | 'material'
    | 'paintColor'
  >
> & {elevation?: number; storage?: OpenStorage};

export type CreationPreferences = {
  version: 1;
  sharedCabinet?: Pick<Profile, 'face' | 'hinge' | 'material' | 'paintColor'>;
  scopes: Record<string, Profile>;
};

export const emptyCreationPreferences = (): CreationPreferences => ({
  version: 1,
  scopes: {},
});

function scopeFor(item: KitchenElement) {
  if (item.storage) return `storage:${item.storage.type}`;
  if (item.kind === 'appliance')
    return `appliance:${item.applianceKind ?? 'unknown'}`;
  return `cabinet:${item.kind}`;
}

const faces: KitchenElement['face'][] = [
  'shaker',
  'slab',
  'shaker-glass',
  'inset-shaker',
];
const baseConfigurations = [
  'corner',
  'single-door',
  'pullout',
  'door-drawer',
  'three-drawer',
  'microwave-drawer',
  'sink',
] as const;

function validNumber(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

/** Capture editable defaults only; placement, ids and relationships never enter this store. */
export function rememberCreationPreferences(
  preferences: CreationPreferences,
  item: KitchenElement,
): CreationPreferences {
  const next: CreationPreferences = {
    version: 1,
    sharedCabinet: preferences.sharedCabinet,
    scopes: {...preferences.scopes},
  };
  if (item.kind !== 'appliance') {
    next.sharedCabinet = {
      face: item.face,
      hinge: item.hinge,
      material: item.material,
      paintColor: item.paintColor,
    };
  }

  // Specialty tall units are usually singletons. They may establish the room's
  // finish, but must not replace the last ordinary tall-cabinet profile.
  if (
    item.kind === 'tall' &&
    !item.storage &&
    item.tallConfiguration &&
    item.tallConfiguration !== 'standard'
  )
    return next;

  next.scopes[scopeFor(item)] = {
    width: item.width,
    depth: item.depth,
    height: item.height,
    face: item.face,
    hinge: item.hinge,
    applianceFront: item.applianceFront,
    rangeHood: item.rangeHood,
    configuration: item.configuration,
    tallConfiguration: item.tallConfiguration,
    material: item.material,
    paintColor: item.paintColor,
    elevation:
      item.placement.mode === 'wall' ? item.placement.elevation : undefined,
    storage: item.storage ? {...item.storage} : undefined,
  };
  return next;
}

/** Apply only values that remain valid for the exact element scope and room. */
export function applyCreationPreferences(
  item: KitchenElement,
  preferences: CreationPreferences,
  room: Room,
): KitchenElement {
  const scoped = preferences.scopes[scopeFor(item)] ?? {};
  const shared =
    item.kind === 'appliance' ? {} : (preferences.sharedCabinet ?? {});
  const next: KitchenElement = {...item, placement: {...item.placement}};
  const profile = {...shared, ...scoped};

  if (
    validNumber(profile.width, item.storage ? 12 : 6, item.storage ? 96 : 120)
  )
    next.width = profile.width;
  if (validNumber(profile.depth, 4, 60)) next.depth = profile.depth;
  const minimumHeight = item.kind === 'tall' ? 12 : item.storage ? 12 : 1;
  if (validNumber(profile.height, minimumHeight, room.height))
    next.height = profile.height;
  if (profile.face && faces.includes(profile.face)) {
    // Glass fronts are only offered on wall cabinets.
    if (profile.face !== 'shaker-glass' || item.kind === 'wall-cabinet')
      next.face = profile.face;
  }
  if (profile.hinge === 'left' || profile.hinge === 'right')
    next.hinge = profile.hinge;
  if (profile.material && Object.hasOwn(CABINET_MATERIALS, profile.material))
    next.material = profile.material;
  if (profile.paintColor && Object.hasOwn(CABINET_PAINTS, profile.paintColor))
    next.paintColor = profile.paintColor;
  if (
    item.kind === 'base' &&
    profile.configuration &&
    baseConfigurations.includes(profile.configuration)
  )
    next.configuration = profile.configuration;
  if (item.kind === 'tall' && !item.storage)
    next.tallConfiguration = 'standard';
  if (
    item.kind === 'appliance' &&
    (profile.applianceFront === 'stainless' ||
      profile.applianceFront === 'shaker' ||
      profile.applianceFront === 'slab')
  )
    next.applianceFront = profile.applianceFront;
  if (item.kind === 'appliance' && typeof profile.rangeHood === 'boolean')
    next.rangeHood = profile.rangeHood;
  if (
    item.storage &&
    profile.storage &&
    validStorage(profile.storage) &&
    profile.storage.type === item.storage.type
  )
    next.storage = {...profile.storage};
  if (
    next.placement.mode === 'wall' &&
    validNumber(profile.elevation, 0, room.height - next.height)
  )
    next.placement.elevation = profile.elevation;
  return next;
}

export function loadCreationPreferences(
  storage: Pick<Storage, 'getItem'> | undefined,
) {
  if (!storage) return emptyCreationPreferences();
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(CREATION_PREFERENCES_KEY) ?? 'null',
    );
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as CreationPreferences).version === 1 &&
      (parsed as CreationPreferences).scopes &&
      typeof (parsed as CreationPreferences).scopes === 'object'
    )
      return parsed as CreationPreferences;
  } catch {
    // Invalid or unavailable browser storage simply restores catalog defaults.
  }
  return emptyCreationPreferences();
}

export function saveCreationPreferences(
  storage: Pick<Storage, 'setItem'> | undefined,
  preferences: CreationPreferences,
) {
  try {
    storage?.setItem(CREATION_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Creation remains functional when storage is disabled or full.
  }
}
