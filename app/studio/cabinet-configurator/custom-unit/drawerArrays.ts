import type {CabinetPart, CustomUnitDefinition} from './model';

type Opening = NonNullable<CabinetPart['drawerArray']>['opening'];
type Face = NonNullable<CabinetPart['drawerArray']>['face'];
export const MIN_DRAWER_HEIGHT = 2;

/** Exterior fronts overlay the carcass; interior fronts clear the opening. */
export function drawerBounds(
  unit: CustomUnitDefinition,
  opening: Opening,
  face: Face,
) {
  const r = unit.reveal;
  const overlay = (
    start: number,
    end: number,
    limit: number,
    axis: 'x' | 'y',
    size: 'width' | 'height',
  ) => {
    const boards = unit.parts?.filter(
      (p) =>
        ['carcass', 'divider', 'shelf', 'panel'].includes(p.kind) &&
        p[size] <= 0.75 &&
        p.profileMode !== 'independent',
    );
    const thickness = (edge: number, before: boolean) => {
      if (!boards) return 0.375;
      const board = boards.find(
        (p) => Math.abs(p[axis] + (before ? p[size] : 0) - edge) < 1e-6,
      );
      return board ? board[size] / 2 : 0;
    };
    return [
      start <= 0.75 + 1e-6 ? start : thickness(start, true),
      end >= limit - 0.75 - 1e-6 ? limit - end : thickness(end, false),
    ];
  };
  const [left, right] =
    face === 'external'
      ? overlay(opening.x, opening.x + opening.width, unit.width, 'x', 'width')
      : [0, 0];
  const [bottom, top] =
    face === 'external'
      ? overlay(
          opening.y,
          opening.y + opening.height,
          unit.height,
          'y',
          'height',
        )
      : [0, 0];
  return {
    x: opening.x - left + r,
    y: opening.y - bottom + r,
    width: opening.width + left + right - 2 * r,
    height: opening.height + bottom + top - 2 * r,
  };
}

export function equalDrawerHeights(
  height: number,
  reveal: number,
  count?: number,
) {
  const n = count ?? Math.max(1, Math.floor((height + reveal) / (6 + reveal)));
  if (!Number.isInteger(n) || n < 1 || n > 100)
    throw new Error('Choose a whole drawer count from 1 to 100.');
  const size = (height - (n - 1) * reveal) / n;
  if (size < MIN_DRAWER_HEIGHT - 1e-8)
    throw new Error('Every drawer must be at least 2 inches high.');
  return Array<number>(n).fill(size);
}

/** Keep the edited front exact; balance remaining space from the bottom upward. */
export function setDrawerHeight(
  part: CabinetPart,
  reveal: number,
  index: number,
  height: number,
): CabinetPart {
  const array = part.drawerArray!;
  const n = array.heights.length;
  const available = part.height - (n - 1) * reveal;
  if (
    !Number.isFinite(height) ||
    height < 2 ||
    height > available - 2 * (n - 1) + 1e-8
  )
    throw new Error(
      'Drawer heights must fit the opening and be at least 2 inches.',
    );
  if (n === 1 && Math.abs(height - available) > 1e-8)
    throw new Error('A single drawer fills the opening.');
  const heights = [...array.heights];
  let delta = height - heights[index];
  heights[index] = height;
  for (let i = 0; i < n && Math.abs(delta) > 1e-8; i++) {
    if (i === index) continue;
    const adjustment = delta < 0 ? delta : Math.min(delta, heights[i] - 2);
    heights[i] -= adjustment;
    delta -= adjustment;
  }
  return {...part, drawerArray: {...array, heights}};
}

export function refitDrawerArray(
  unit: CustomUnitDefinition,
  part: CabinetPart,
): CabinetPart {
  const array = part.drawerArray!;
  const bounds = drawerBounds(unit, array.opening, array.face);
  const available = bounds.height - (array.heights.length - 1) * unit.reveal;
  const total = array.heights.reduce((sum, h) => sum + h, 0);
  const minimum = array.heights.length * MIN_DRAWER_HEIGHT;
  const heights =
    Math.abs(available - total) < 1e-8
      ? array.heights
      : array.heights.map((h) =>
          total > minimum
            ? MIN_DRAWER_HEIGHT +
              ((h - MIN_DRAWER_HEIGHT) * (available - minimum)) /
                (total - minimum)
            : available / array.heights.length,
        );
  return {
    ...part,
    ...bounds,
    drawerArray: {
      ...array,
      heights,
    },
  };
}

/** Expand for rendering/takeoff, retaining the array ID for selection and interaction. */
export function expandDrawerArray(
  part: CabinetPart,
  reveal: number,
): (CabinetPart & {arrayId?: string})[] {
  if (!part.drawerArray) return [part];
  let y = part.y;
  return part.drawerArray.heights.map((height, index) => {
    const drawer = {
      ...part,
      id: `${part.id}-drawer-${index}`,
      arrayId: part.id,
      drawerArray: undefined,
      y,
      height,
    };
    y += height + reveal;
    return drawer;
  });
}

export function drawerArrayErrors(
  unit: CustomUnitDefinition,
  part: CabinetPart,
): string[] {
  const array = part.drawerArray;
  if (!array) return [];
  if (
    part.kind !== 'drawer' ||
    !['internal', 'external'].includes(array.face) ||
    !array.opening ||
    !['x', 'y', 'width', 'height'].every((k) =>
      Number.isFinite(array.opening[k as keyof Opening]),
    ) ||
    array.opening.x < 0 ||
    array.opening.y < 0 ||
    array.opening.width <= 0 ||
    array.opening.height <= 0 ||
    array.opening.x + array.opening.width > unit.width + 1e-6 ||
    array.opening.y + array.opening.height > unit.height + 1e-6 ||
    !Array.isArray(array.heights) ||
    !array.heights.length ||
    array.heights.length > 100 ||
    array.heights.some((h) => !Number.isFinite(h) || h < 2 - 1e-8)
  )
    return [
      'Invalid drawer array: every drawer must be at least 2 inches and fit its opening.',
    ];
  const expected = drawerBounds(unit, array.opening, array.face);
  if (
    (['x', 'y', 'width', 'height'] as const).some(
      (key) => Math.abs(part[key] - expected[key]) > 1e-6,
    ) ||
    Math.abs(
      array.heights.reduce((sum, h) => sum + h, 0) +
        (array.heights.length - 1) * unit.reveal -
        part.height,
    ) > 1e-6
  )
    return ['Drawer arrays must fill their opening with consistent reveals.'];
  return [];
}
