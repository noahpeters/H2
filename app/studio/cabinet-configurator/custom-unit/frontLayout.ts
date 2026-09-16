import {drawerBounds, expandDrawerArray} from './drawerArrays';
import type {CabinetPart, CustomUnitDefinition} from './model';
import type {Overlay} from '../overlay';

type Opening = NonNullable<CabinetPart['drawerArray']>['opening'];

/** Recover the opening from either legacy opening-sized doors or overlay fronts.
 * Only a board touching this front can define its edge; paired doors retain
 * their shared meeting edge. Stored composition dimensions remain unchanged.
 */
function frontOpening(unit: CustomUnitDefinition, part: CabinetPart): Opening {
  const edge = (axis: 'x' | 'y', size: 'width' | 'height', before: boolean) => {
    const value =
      part[axis] + (before ? -unit.reveal : part[size] + unit.reveal);
    const other = axis === 'x' ? 'y' : 'x';
    const otherSize = axis === 'x' ? 'height' : 'width';
    const center = part[other] + part[otherSize] / 2;
    const candidates = (unit.parts ?? [])
      .filter(
        (board) =>
          ['carcass', 'divider', 'shelf', 'panel'].includes(board.kind) &&
          board.profileMode !== 'independent' &&
          board[size] <= 0.75 &&
          center > board[other] &&
          center < board[other] + board[otherSize],
      )
      .map((board) => board[axis] + (before ? board[size] : 0))
      .filter((candidate) => Math.abs(candidate - value) <= 0.75 + 1e-6)
      .sort((a, b) => Math.abs(a - value) - Math.abs(b - value));
    return candidates[0] ?? value;
  };
  const x = edge('x', 'width', true),
    y = edge('y', 'height', true);
  return {
    x,
    y,
    width: edge('x', 'width', false) - x,
    height: edge('y', 'height', false) - y,
  };
}

/** One room-owned exterior-front layout for both doors and drawers. Interior
 * drawers and tambour mechanisms keep their required internal clearances.
 */
export function roomFrontParts(
  unit: CustomUnitDefinition,
  overlay: Overlay,
): (CabinetPart & {arrayId?: string})[] {
  return (unit.parts ?? []).flatMap((part) => {
    if (
      !['door', 'drawer'].includes(part.kind) ||
      part.z >= 0 ||
      part.drawerArray?.face === 'internal' ||
      part.door?.mechanism === 'tambour'
    )
      return expandDrawerArray(part, unit.reveal);
    const opening = part.drawerArray?.opening ?? frontOpening(unit, part);
    const bounds = drawerBounds(unit, opening, 'external', overlay);
    const projected = {
      ...part,
      ...bounds,
      z: overlay === 'inset' ? 0 : -part.depth,
    };
    if (part.drawerArray) {
      const array = part.drawerArray;
      const available =
        bounds.height - (array.heights.length - 1) * unit.reveal;
      const total = array.heights.reduce((sum, height) => sum + height, 0);
      projected.drawerArray = {
        ...array,
        heights: array.heights.map((height) => (height * available) / total),
      };
    }
    return expandDrawerArray(projected, unit.reveal);
  });
}
