import type {Overlay} from './overlay';

export const STANDARD_FRONT_THICKNESS = 0.75;
/** Closed fronts sit outside the carcass; inset stock shares the frame plane. */
export function standardFrontCenter(depth: number, overlay?: Overlay) {
  return (
    depth / 2 +
    STANDARD_FRONT_THICKNESS / 2 +
    (overlay === 'partial-overlay' ? STANDARD_FRONT_THICKNESS : 0)
  );
}
/** Finished outer plane in inches. Handles and the recessed center are excluded. */
export function standardFrontSurface(depth: number, overlay?: Overlay) {
  return standardFrontCenter(depth, overlay) + STANDARD_FRONT_THICKNESS / 2;
}
