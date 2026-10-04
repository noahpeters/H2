import type {Room, RoomElement} from './model';

/** Standard finished thickness for a standalone room panel, in inches. */
export const DEFAULT_PANEL_THICKNESS = 0.75;

/**
 * Panels deliberately use the same placement model as every other room object.
 * `width` is their thickness and `depth` is the visible panel span, so a wall
 * placement is perpendicular to the wall face and a run placement follows the
 * run's end plane without any cabinet ownership relationship.
 */
export function createRoomPanel(id: string, room: Room): RoomElement {
  return {
    id,
    kind: 'panel',
    width: DEFAULT_PANEL_THICKNESS,
    depth: 24,
    height: room.height,
    face: 'slab',
    placement: {
      mode: 'wall',
      wall: 'back',
      offset: 0,
      elevation: 0,
    },
  };
}
