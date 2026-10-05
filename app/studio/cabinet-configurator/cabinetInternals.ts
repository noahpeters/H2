import type {Room, RoomElement} from './model';
import type {MaterialSelection} from './materials';
import {cabinetCompositionEnvelope} from './cabinetEnvelope';
import {fitDefinition} from './custom-unit/designConfigurations';
import {placementOpenings} from './custom-unit/openingPlacement';
import {customUnitLayoutParts} from './custom-unit/layoutParts';
import type {CabinetPart} from './custom-unit/model';

export type InternalRoom = Pick<Room, 'useMapleInternals' | 'toeKick'>;

/** Open or glass-front interiors remain the cabinet's selected finish. Opening
 * doors temporarily does not change stock; this describes the saved design. */
export function exposedCabinetInterior(item: RoomElement, room?: InternalRoom) {
  if (item.customCabinet) {
    const unit = fitDefinition(
      item.customCabinet.definition,
      cabinetCompositionEnvelope(item, room),
    );
    if (placementOpenings(unit, 'door').length > 0) return true;
    return customUnitLayoutParts(unit).some(
      (part) =>
        part.kind === 'door' &&
        (part.faceStyle ?? item.face) === 'shaker-glass',
    );
  }
  return Boolean(
    (item.storage &&
      (!item.storage.doors || item.storage.type === 'floating-shelves')) ||
    ((item.kind === 'wall-cabinet' || item.storage) &&
      item.face === 'shaker-glass') ||
    (item.kind === 'tall' && item.tallConfiguration === 'coffee-maker'),
  );
}

export function cabinetInteriorSelection(
  item: RoomElement,
  room?: InternalRoom,
): MaterialSelection {
  return room?.useMapleInternals &&
    ['base', 'wall-cabinet', 'tall'].includes(item.kind) &&
    !exposedCabinetInterior(item, room)
    ? {material: 'maple', flatGrain: item.flatGrain}
    : item;
}

export function drawerBoxSelection(
  item: MaterialSelection,
  useMapleInternals = false,
): MaterialSelection {
  return useMapleInternals
    ? {material: 'maple', flatGrain: item.flatGrain}
    : item;
}

/** Frames, fronts, rods and separately shaped exterior attachments retain their finish. */
export function internalCustomPart(part: CabinetPart & {faceFrame?: string}) {
  return (
    !part.faceFrame &&
    part.profileMode !== 'independent' &&
    ['carcass', 'divider', 'shelf', 'panel'].includes(part.kind)
  );
}
