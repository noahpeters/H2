export type Wall = 'back' | 'left' | 'right';
export type CabinetType = 'base' | 'wall' | 'tall';
export type Face = 'shaker' | 'slab';
export type View = 'plan' | 'split' | 'three';

export type Cabinet = {
  id: string;
  type: CabinetType;
  wall: Wall;
  offset: number;
  width: number;
  depth: number;
  height: number;
  elevation?: number;
  face: Face;
};

export type Opening = {
  id: string;
  kind: 'door' | 'window';
  wall: Wall;
  offset: number;
  width: number;
  height: number;
  sill?: number;
};

export type ApplianceKind =
  | 'refrigerator'
  | 'dishwasher'
  | 'range'
  | 'wall-oven'
  | 'microwave'
  | 'coffee-maker';
export type AppliancePlacement = 'floor' | 'built-in' | 'wall' | 'countertop';

export type Appliance = {
  id: string;
  kind: ApplianceKind;
  placement: AppliancePlacement;
  wall: Wall;
  offset: number;
  width: number;
  depth: number;
  height: number;
  elevation: number;
  hostCabinetId?: string;
};

export type Study = {
  room: {
    width: number;
    depth: number;
    height: number;
    floor: 'oak' | 'walnut' | 'concrete';
    walls: 'plaster' | 'white' | 'green';
  };
  openings: Opening[];
  cabinets: Cabinet[];
  appliances: Appliance[];
  selected: string | null;
  countertop: boolean;
  view: View;
};

export const APPLIANCE_CATALOG: Record<
  ApplianceKind,
  Omit<Appliance, 'id' | 'wall' | 'offset' | 'hostCabinetId'>
> = {
  refrigerator: {
    kind: 'refrigerator',
    placement: 'floor',
    width: 36,
    depth: 30,
    height: 70,
    elevation: 0,
  },
  dishwasher: {
    kind: 'dishwasher',
    placement: 'floor',
    width: 24,
    depth: 24,
    height: 34.5,
    elevation: 0,
  },
  range: {
    kind: 'range',
    placement: 'floor',
    width: 30,
    depth: 27,
    height: 36,
    elevation: 0,
  },
  'wall-oven': {
    kind: 'wall-oven',
    placement: 'built-in',
    width: 30,
    depth: 24,
    height: 30,
    elevation: 42,
  },
  microwave: {
    kind: 'microwave',
    placement: 'wall',
    width: 30,
    depth: 16,
    height: 17,
    elevation: 54,
  },
  'coffee-maker': {
    kind: 'coffee-maker',
    placement: 'countertop',
    width: 10,
    depth: 12,
    height: 14,
    elevation: 36,
  },
};

export const APPLIANCE_LABELS: Record<ApplianceKind, string> = {
  refrigerator: 'Refrigerator',
  dishwasher: 'Dishwasher',
  range: 'Freestanding range',
  'wall-oven': 'Wall oven',
  microwave: 'Microwave',
  'coffee-maker': 'Coffee maker',
};

export function initialStudy(): Study {
  return {
    room: {width: 144, depth: 120, height: 96, floor: 'oak', walls: 'plaster'},
    openings: [
      {
        id: 'starter-door',
        kind: 'door',
        wall: 'back',
        offset: 18,
        width: 32,
        height: 80,
      },
      {
        id: 'starter-window',
        kind: 'window',
        wall: 'right',
        offset: 28,
        width: 42,
        height: 38,
        sill: 42,
      },
    ],
    cabinets: [
      {
        id: 'starter-base-30',
        type: 'base',
        wall: 'back',
        offset: 56,
        width: 30,
        depth: 24,
        height: 34.5,
        face: 'shaker',
      },
      {
        id: 'starter-base-24',
        type: 'base',
        wall: 'back',
        offset: 86,
        width: 24,
        depth: 24,
        height: 34.5,
        face: 'slab',
      },
      {
        id: 'starter-wall-30',
        type: 'wall',
        wall: 'back',
        offset: 56,
        width: 30,
        depth: 12,
        height: 30,
        elevation: 54,
        face: 'shaker',
      },
      {
        id: 'starter-tall-24',
        type: 'tall',
        wall: 'left',
        offset: 18,
        width: 24,
        depth: 24,
        height: 84,
        face: 'slab',
      },
    ],
    appliances: [],
    selected: null,
    countertop: true,
    view: 'split',
  };
}

export function normalizeStudy(value: Study): Study {
  return {
    ...value,
    appliances: Array.isArray(value.appliances) ? value.appliances : [],
  };
}

export function wallLength(study: Study, wall: Wall) {
  return wall === 'back' ? study.room.width : study.room.depth;
}

const overlaps = (
  a: {offset: number; width: number},
  b: {offset: number; width: number},
) => a.offset < b.offset + b.width && a.offset + a.width > b.offset;
const vertical = (item: {elevation?: number; height: number}) => ({
  bottom: item.elevation ?? 0,
  top: (item.elevation ?? 0) + item.height,
});
const overlapsVertically = (
  a: {elevation?: number; height: number},
  b: {elevation?: number; height: number},
) => {
  const av = vertical(a);
  const bv = vertical(b);
  return av.bottom < bv.top && av.top > bv.bottom;
};

/** Returns every cabinet/appliance that needs fit attention. Hosted appliances may overlap their selected cabinet. */
export function problemIds(study: Study) {
  const problems = new Set<string>();
  const items = [...study.cabinets, ...study.appliances];
  for (const item of items) {
    if (
      item.offset < 0 ||
      item.offset + item.width > wallLength(study, item.wall) ||
      (item.elevation ?? 0) < 0 ||
      (item.elevation ?? 0) + item.height > study.room.height
    )
      problems.add(item.id);
    for (const opening of study.openings.filter(
      (entry) => entry.wall === item.wall,
    )) {
      const openingVolume = {
        offset: opening.offset,
        width: opening.width,
        elevation: opening.kind === 'window' ? (opening.sill ?? 42) : 0,
        height: opening.height,
      };
      if (
        overlaps(item, openingVolume) &&
        overlapsVertically(item, openingVolume)
      )
        problems.add(item.id);
    }
    for (const other of items.filter(
      (entry) => entry.id !== item.id && entry.wall === item.wall,
    )) {
      const hosted =
        ('hostCabinetId' in item && item.hostCabinetId === other.id) ||
        ('hostCabinetId' in other && other.hostCabinetId === item.id);
      if (!hosted && overlaps(item, other) && overlapsVertically(item, other))
        problems.add(item.id);
    }
    if (
      'placement' in item &&
      (item.placement === 'countertop' || item.placement === 'built-in')
    ) {
      const host = study.cabinets.find(
        (cabinet) => cabinet.id === item.hostCabinetId,
      );
      if (
        !host ||
        host.wall !== item.wall ||
        item.offset < host.offset ||
        item.offset + item.width > host.offset + host.width
      )
        problems.add(item.id);
      if (
        item.placement === 'countertop' &&
        host &&
        item.elevation < host.height
      )
        problems.add(item.id);
    }
  }
  return problems;
}

export function createAppliance(
  kind: ApplianceKind,
  study: Study,
  id: string,
): Appliance {
  const defaults = APPLIANCE_CATALOG[kind];
  const hostTypes =
    kind === 'coffee-maker'
      ? ['base']
      : kind === 'wall-oven'
        ? ['tall', 'base']
        : [];
  const host = hostTypes
    .map((type) => study.cabinets.find((cabinet) => cabinet.type === type))
    .find(Boolean);
  if (host) {
    const width = Math.min(defaults.width, host.width);
    return {
      ...defaults,
      width,
      id,
      wall: host.wall,
      offset: host.offset + (host.width - width) / 2,
      hostCabinetId: host.id,
      elevation:
        kind === 'coffee-maker'
          ? host.height + (study.countertop ? 1.5 : 0)
          : defaults.elevation,
    };
  }
  return {...defaults, id, wall: 'back', offset: 6};
}
