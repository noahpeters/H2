export type HardwareFaceStyle =
  | 'shaker'
  | 'shaker-glass'
  | 'slab'
  | 'vertical-slat';
export const shakerFrameWidth = (width: number, height: number) =>
  Math.min(2, width / 5, height / 4);

export type PullLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  edge: 'top' | 'bottom';
};

/** Place the entire hardware footprint inside its front's stile or rail. Inches. */
export function frontPullLayout({
  width,
  height,
  absoluteTop,
  faceStyle,
  hingeSide = 'left',
  horizontal = false,
  drawer = false,
  edge,
}: {
  width: number;
  height: number;
  absoluteTop: number;
  faceStyle: HardwareFaceStyle;
  hingeSide?: 'left' | 'right';
  horizontal?: boolean;
  drawer?: boolean;
  edge?: 'top' | 'bottom';
}): PullLayout {
  const framed = faceStyle === 'shaker' || faceStyle === 'shaker-glass';
  const rail = shakerFrameWidth(width, height);
  const clearance = Math.min(0.25, rail / 4);
  const selectedEdge = edge ?? (absoluteTop <= 35 ? 'top' : 'bottom');
  const gripWidth = horizontal
    ? Math.max(
        0.01,
        Math.min(
          6,
          width * 0.5,
          framed ? width - 2 * rail - 2 * clearance : width - 0.5,
        ),
      )
    : Math.min(0.35, framed ? rail - 2 * clearance : width / 2);
  const gripHeight = horizontal
    ? Math.min(0.35, framed ? rail - 2 * clearance : height / 2)
    : Math.min(4, height * 0.5);
  const x = horizontal
    ? 0
    : (hingeSide === 'left' ? 1 : -1) *
      (width / 2 -
        Math.min(
          width / 2,
          framed ? rail / 2 : Math.max(4, gripWidth / 2 + clearance),
        ));
  const margin = framed
    ? horizontal
      ? rail / 2
      : Math.max(rail / 2, gripHeight / 2 + clearance)
    : Math.min(height / 2, Math.max(4, gripHeight / 2 + clearance));
  const y =
    drawer && !framed
      ? 0
      : (selectedEdge === 'top' ? 1 : -1) * (height / 2 - margin);
  return {x, y, width: gripWidth, height: gripHeight, edge: selectedEdge};
}

export function doorHandlePosition(options: {
  width: number;
  height: number;
  absoluteTop: number;
  faceStyle: HardwareFaceStyle;
  hingeSide: 'left' | 'right';
}) {
  const {x, y, edge} = frontPullLayout(options);
  return {x, y, edge};
}
