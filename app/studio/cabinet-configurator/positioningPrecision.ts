import type {Room, RoomElement} from './model';

export const POSITIONING_RESOLUTIONS = [1 / 16, 1 / 8, 1] as const;
export type PositioningResolution = (typeof POSITIONING_RESOLUTIONS)[number];
export const DEFAULT_POSITIONING_RESOLUTION = 1 / 8;

export function positioningResolution(
  room: Pick<Room, 'positioningResolution'>,
) {
  return POSITIONING_RESOLUTIONS.includes(
    room.positioningResolution as PositioningResolution,
  )
    ? room.positioningResolution!
    : DEFAULT_POSITIONING_RESOLUTION;
}

/** Alignment attraction is measured in room inches, independently of zoom. */
export const snappingDistance = (room: Pick<Room, 'positioningResolution'>) =>
  2 * positioningResolution(room);

// Coordinates and derived faces share integer comparison units. This only removes
// floating-point noise; it never rounds geometry to the user's (much larger) grid.
const UNITS_PER_INCH = 10_000_000;
export const coordinateUnits = (value: number) =>
  Math.round(value * UNITS_PER_INCH);
export const canonicalCoordinate = (value: number) =>
  coordinateUnits(value) / UNITS_PER_INCH;
export function quantizePosition(
  value: number,
  room: Pick<Room, 'positioningResolution'>,
) {
  const step = positioningResolution(room);
  return canonicalCoordinate(Math.round(value / step) * step);
}
export function intervalsOverlap(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
) {
  return (
    coordinateUnits(aMin) < coordinateUnits(bMax) &&
    coordinateUnits(aMax) > coordinateUnits(bMin)
  );
}
export function quantizeElementPosition(
  item: RoomElement,
  room: Room,
  previous?: RoomElement,
) {
  const p = item.placement;
  const old = previous?.placement;
  for (const axis of ['x', 'z', 'offset', 'elevation'] as const) {
    if (!(axis in p)) continue;
    const value = (p as unknown as Record<string, number>)[axis];
    if (!Number.isFinite(value)) continue;
    if (
      !old ||
      old.mode !== p.mode ||
      value !== (old as unknown as Record<string, number>)[axis]
    )
      (p as unknown as Record<string, number>)[axis] = quantizePosition(
        value,
        room,
      );
  }
}
