import type {CabinetPart, CustomUnitDefinition} from './model';

export type ArchPoint = {x: number; y: number};
export type CabinetArch = {center: number; radius: number; spring: number};

/** Old opening flags load as one cabinet-wide arch. */
export function hasCabinetArch(unit: CustomUnitDefinition) {
  return (
    unit.frontArch === 'simple' ||
    Boolean(unit.archedOpenings?.length) ||
    Boolean(
      unit.parts?.some(
        (part) => part.kind === 'door' && part.arch === 'simple',
      ),
    )
  );
}

/** Clip one shared circular opening to a front's rectangle. Never restart the
 * circle at a shelf, divider, or the meeting stile of paired doors. */
export function clipCabinetArch(
  arch: CabinetArch,
  box: Pick<CabinetPart, 'x' | 'y' | 'width' | 'height'>,
  inset = 0,
): ArchPoint[] {
  const radius = arch.radius - inset;
  if (radius <= 0 || box.width <= 0 || box.height <= 0) return [];
  let points: ArchPoint[] = [
    {x: arch.center - radius, y: Math.min(0, box.y)},
    {x: arch.center + radius, y: Math.min(0, box.y)},
  ];
  for (let i = 0; i <= 128; i++) {
    const angle = (i * Math.PI) / 128;
    points.push({
      x: arch.center + radius * Math.cos(angle),
      y: arch.spring + radius * Math.sin(angle),
    });
  }
  for (const [axis, bound, sign] of [
    ['x', box.x, 1],
    ['x', box.x + box.width, -1],
    ['y', box.y, 1],
    ['y', box.y + box.height, -1],
  ] as const) {
    const clipped: ArchPoint[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const da = (a[axis] - bound) * sign,
        db = (b[axis] - bound) * sign;
      if (da >= -1e-9) clipped.push(a);
      if (da < 0 !== db < 0) {
        const t = da / (da - db);
        clipped.push({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t});
      }
    }
    points = clipped;
  }
  return points
    .map((point) => ({x: point.x - box.x, y: point.y - box.y}))
    .filter(
      (point, i, all) =>
        Math.hypot(
          point.x - all[(i + all.length - 1) % all.length].x,
          point.y - all[(i + all.length - 1) % all.length].y,
        ) > 1e-8,
    );
}

export function cabinetArchPane(
  part: CabinetPart & {cabinetArch?: CabinetArch},
  rail: number,
) {
  if (!part.cabinetArch) return [];
  const box = {
    x: part.x + rail,
    y: part.y + rail,
    width: part.width - 2 * rail,
    height: part.height - 2 * rail,
  };
  return clipCabinetArch(part.cabinetArch, box, rail).map((point) => ({
    x: point.x + rail,
    y: point.y + rail,
  }));
}
