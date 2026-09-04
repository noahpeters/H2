import { bases, type BaseSlug, type ShapeSlug } from "./catalog";

export type SpriteCell = { x: number; y: number; width: number; height: number };
export type SpriteMatrix = { columns: number; rows: number; cells: SpriteCell[][] };

function createMatrix(columns: number, rows = 3): SpriteMatrix {
  return {
    columns,
    rows,
    cells: Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => ({
        x: column / columns,
        y: row / rows,
        width: 1 / columns,
        height: 1 / rows,
      })),
    ),
  };
}

// Every sheet owns a matrix entry. Individual cells can be overridden later
// without changing the configurator or requiring uniform source dimensions.
export const spriteMatrices: Record<string, SpriteMatrix> = Object.fromEntries(
  (["rectangle", "circle", "oval"] as ShapeSlug[]).flatMap((shape) =>
    bases.map((base) => [`${shape}/${base.slug}`, createMatrix(shape === "circle" ? 3 : 4)]),
  ),
);

export function spriteCell(shape: ShapeSlug, base: BaseSlug, column: number, row: number) {
  const matrix = spriteMatrices[`${shape}/${base}`];
  return matrix.cells[row][column];
}

export function backgroundForCell(cell: SpriteCell) {
  return {
    backgroundSize: `${100 / cell.width}% ${100 / cell.height}%`,
    backgroundPosition: `${cell.x === 0 ? 0 : (cell.x / (1 - cell.width)) * 100}% ${cell.y === 0 ? 0 : (cell.y / (1 - cell.height)) * 100}%`,
  };
}
