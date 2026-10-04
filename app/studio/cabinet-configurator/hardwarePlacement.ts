export type HardwareFaceStyle =
  | 'shaker'
  | 'shaker-glass'
  | 'slab'
  | 'vertical-slat';

const SLAB_EDGE_MARGIN = 4;

/**
 * Locate a side-hinged door pull from the door itself, rather than from the
 * cabinet category. Coordinates and elevations are in inches.
 *
 * Framed fronts put the pull on the centreline of their rail/stile. Flat
 * fronts keep a four-inch edge margin. This leaves the policy in one place
 * for both standard and custom cabinets.
 */
export function doorHandlePosition({
  width,
  height,
  absoluteTop,
  faceStyle,
  hingeSide,
}: {
  width: number;
  height: number;
  absoluteTop: number;
  faceStyle: HardwareFaceStyle;
  hingeSide: 'left' | 'right';
}) {
  const framed = faceStyle === 'shaker' || faceStyle === 'shaker-glass';
  const railWidth = Math.min(2, width / 5, height / 4);
  const verticalMargin = Math.min(
    framed ? railWidth / 2 : SLAB_EDGE_MARGIN,
    height / 2,
  );
  const horizontalMargin = Math.min(
    framed ? railWidth / 2 : SLAB_EDGE_MARGIN,
    width / 2,
  );
  const useTop = absoluteTop <= 35;

  return {
    x: (hingeSide === 'left' ? 1 : -1) * (width / 2 - horizontalMargin),
    y: (useTop ? 1 : -1) * (height / 2 - verticalMargin),
    edge: useTop ? ('top' as const) : ('bottom' as const),
  };
}
