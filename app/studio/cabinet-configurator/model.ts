export type Wall = 'back' | 'left' | 'right' | 'front';
export const WALLS: Wall[] = ['back', 'left', 'right', 'front'];
export const horizontalWall = (wall: Wall) =>
  wall === 'back' || wall === 'front';
export type BaseConfiguration =
  | 'single-door'
  | 'door-drawer'
  | 'three-drawer'
  | 'sink';
export type Opening = {
  id: string;
  kind: 'door' | 'window';
  wall: Wall;
  offset: number;
  width: number;
  height: number;
  sill?: number;
};
export type PlacementMode = 'wall' | 'floor' | 'hosted';
export type ElementKind = 'base' | 'wall-cabinet' | 'tall' | 'appliance';
export type ApplianceKind =
  | 'refrigerator'
  | 'dishwasher'
  | 'range'
  | 'wall-oven'
  | 'microwave'
  | 'coffee-maker';
export type SeatingSide = 'none' | 'north' | 'south' | 'east' | 'west';

export type Placement =
  | {mode: 'wall'; wall: Wall; offset: number; elevation: number}
  | {mode: 'floor'; x: number; z: number; rotation: number}
  | {
      mode: 'hosted';
      hostId: string;
      x: number;
      z: number;
      elevation: number;
      rotation: number;
    };

export type KitchenElement = {
  id: string;
  kind: ElementKind;
  width: number;
  depth: number;
  height: number;
  face: 'shaker' | 'slab';
  applianceKind?: ApplianceKind;
  configuration?: BaseConfiguration;
  placement: Placement;
  islandId?: string;
};

export const APPLIANCE_CATALOG: Record<
  ApplianceKind,
  Pick<KitchenElement, 'width' | 'depth' | 'height'> & {
    label: string;
    elevation: number;
  }
> = {
  refrigerator: {
    label: 'Refrigerator',
    width: 36,
    depth: 30,
    height: 70,
    elevation: 0,
  },
  dishwasher: {
    label: 'Dishwasher',
    width: 24,
    depth: 24,
    height: 34.5,
    elevation: 0,
  },
  range: {
    label: 'Freestanding range',
    width: 30,
    depth: 27,
    height: 36,
    elevation: 0,
  },
  'wall-oven': {
    label: 'Wall oven',
    width: 30,
    depth: 24,
    height: 30,
    elevation: 42,
  },
  microwave: {
    label: 'Microwave',
    width: 30,
    depth: 16,
    height: 17,
    elevation: 54,
  },
  'coffee-maker': {
    label: 'Coffee maker',
    width: 10,
    depth: 12,
    height: 14,
    elevation: 36,
  },
};

export function createKitchenAppliance(
  applianceKind: ApplianceKind,
  id: string,
): KitchenElement {
  const appliance = APPLIANCE_CATALOG[applianceKind];
  return {
    id,
    kind: 'appliance',
    applianceKind,
    width: appliance.width,
    depth: appliance.depth,
    height: appliance.height,
    face: 'slab',
    placement: {
      mode: 'wall',
      wall: 'back',
      offset: 6,
      elevation: appliance.elevation,
    },
  };
}

export type Island = {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  overhang: number;
  seatingSide: SeatingSide;
};
export type Room = {
  width: number;
  depth: number;
  height: number;
  floor: 'oak' | 'walnut' | 'concrete';
  walls: 'plaster' | 'white' | 'green';
};

export type LegacyCabinet = Omit<KitchenElement, 'kind' | 'placement'> & {
  type: 'base' | 'wall' | 'tall';
  wall: Wall;
  offset: number;
  elevation?: number;
};

export function snapAngle(value: number) {
  if (!Number.isFinite(value)) return 0;
  return (((Math.round(value / 90) * 90) % 360) + 360) % 360;
}

export function migrateElement(
  value: KitchenElement | LegacyCabinet,
): KitchenElement {
  if ('placement' in value) return {...value, placement: {...value.placement}};
  const {
    type,
    wall,
    offset,
    elevation = type === 'wall' ? 54 : 0,
    ...rest
  } = value;
  return {
    ...rest,
    kind: type === 'wall' ? 'wall-cabinet' : type,
    placement: {mode: 'wall', wall, offset, elevation},
  };
}

export function wallToFloor(
  element: KitchenElement,
  room: Room,
): Extract<Placement, {mode: 'floor'}> {
  if (element.placement.mode !== 'wall')
    return element.placement.mode === 'floor'
      ? element.placement
      : {
          mode: 'floor',
          x: element.placement.x,
          z: element.placement.z,
          rotation: element.placement.rotation,
        };
  const {wall, offset} = element.placement;
  if (wall === 'front')
    return {
      mode: 'floor',
      x: offset + element.width / 2,
      z: room.depth - element.depth / 2,
      rotation: 180,
    };
  if (wall === 'back')
    return {
      mode: 'floor',
      x: offset + element.width / 2,
      z: element.depth / 2,
      rotation: 0,
    };
  if (wall === 'left')
    return {
      mode: 'floor',
      x: element.depth / 2,
      z: offset + element.width / 2,
      rotation: 90,
    };
  return {
    mode: 'floor',
    x: room.width - element.depth / 2,
    z: offset + element.width / 2,
    rotation: 270,
  };
}

export function rotatedSize(element: KitchenElement) {
  const rotation =
    element.placement.mode === 'wall'
      ? horizontalWall(element.placement.wall)
        ? 0
        : 90
      : element.placement.rotation;
  const radians = (rotation * Math.PI) / 180;
  return {
    width:
      Math.abs(element.width * Math.cos(radians)) +
      Math.abs(element.depth * Math.sin(radians)),
    depth:
      Math.abs(element.width * Math.sin(radians)) +
      Math.abs(element.depth * Math.cos(radians)),
  };
}

export function elementCenter(element: KitchenElement, room: Room) {
  if (element.placement.mode !== 'wall')
    return {x: element.placement.x, z: element.placement.z};
  return wallToFloor(element, room);
}

export function bounds(element: KitchenElement, room: Room) {
  const center = elementCenter(element, room);
  const size = rotatedSize(element);
  return {
    left: center.x - size.width / 2,
    right: center.x + size.width / 2,
    top: center.z - size.depth / 2,
    bottom: center.z + size.depth / 2,
  };
}

export function validateLayout(elements: KitchenElement[], room: Room) {
  const warnings = new Map<string, string[]>();
  const add = (id: string, message: string) =>
    warnings.set(id, [...(warnings.get(id) ?? []), message]);
  elements.forEach((element, index) => {
    const box = bounds(element, room);
    if (
      box.left < 0 ||
      box.top < 0 ||
      box.right > room.width ||
      box.bottom > room.depth
    )
      add(element.id, 'Outside room bounds');
    elements.slice(index + 1).forEach((other) => {
      if (
        element.placement.mode === 'wall' &&
        other.placement.mode === 'wall' &&
        (element.kind === 'wall-cabinet') !== (other.kind === 'wall-cabinet')
      )
        return;
      const second = bounds(other, room);
      if (
        box.left < second.right &&
        box.right > second.left &&
        box.top < second.bottom &&
        box.bottom > second.top
      ) {
        add(element.id, 'Overlaps another element');
        add(other.id, 'Overlaps another element');
      }
    });
  });
  return warnings;
}

export function moveIsland(
  island: Island,
  elements: KitchenElement[],
  next: Pick<Island, 'x' | 'z' | 'rotation'>,
) {
  const delta = ((next.rotation - island.rotation) * Math.PI) / 180;
  return elements.map((element) => {
    if (element.islandId !== island.id || element.placement.mode !== 'floor')
      return element;
    const dx = element.placement.x - island.x,
      dz = element.placement.z - island.z;
    return {
      ...element,
      placement: {
        mode: 'floor' as const,
        x: next.x + dx * Math.cos(delta) - dz * Math.sin(delta),
        z: next.z + dx * Math.sin(delta) + dz * Math.cos(delta),
        rotation: snapAngle(
          element.placement.rotation + next.rotation - island.rotation,
        ),
      },
    };
  });
}

export function aisleClearance(island: Island, room: Room) {
  const halfWidth =
    (Math.abs(island.width * Math.cos((island.rotation * Math.PI) / 180)) +
      Math.abs(island.depth * Math.sin((island.rotation * Math.PI) / 180))) /
    2;
  const halfDepth =
    (Math.abs(island.width * Math.sin((island.rotation * Math.PI) / 180)) +
      Math.abs(island.depth * Math.cos((island.rotation * Math.PI) / 180))) /
    2;
  return {
    left: island.x - halfWidth,
    right: room.width - island.x - halfWidth,
    top: island.z - halfDepth,
    bottom: room.depth - island.z - halfDepth,
  };
}
