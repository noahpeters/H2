import {ShapeUtils, Vector2} from 'three';
import type {FabricationPart, Vec3} from './model';
import {cabinetProfilePoint, edgeSetback} from '../custom-unit/curves';
import type {CabinetPart, CustomUnitDefinition} from '../custom-unit/model';

/** Closed boundary of stock minus machining, sampled before applying the same
 * profile function used by the designer. Shared vertices preserve closed joints. */
export function shapedStock(
  part: FabricationPart,
  definition: CustomUnitDefinition,
  source: CabinetPart,
) {
  const grid = part.size.map((size, axis) => {
    const positions = [
      0,
      size,
      ...part.pockets.flatMap((p) => [
        p.origin[axis],
        p.origin[axis] + p.size[axis],
      ]),
    ];
    if (axis !== 2)
      for (let i = 1; i < 32; i++) positions.push((size * i) / 32);
    return [
      ...new Set(
        positions.map((v) => Math.max(0, Math.min(size, v)).toFixed(8)),
      ),
    ]
      .map(Number)
      .sort((a, b) => a - b);
  });
  const filled = new Set<string>();
  for (let x = 0; x < grid[0].length - 1; x++)
    for (let z = 0; z < grid[1].length - 1; z++)
      for (let y = 0; y < grid[2].length - 1; y++) {
        const indices = [x, z, y];
        const center = indices.map((i, a) => (grid[a][i] + grid[a][i + 1]) / 2);
        if (
          !part.pockets.some((p) =>
            center.every(
              (v, a) =>
                v > p.origin[a] - 1e-8 && v < p.origin[a] + p.size[a] + 1e-8,
            ),
          )
        )
          filled.add(indices.join(','));
      }
  const vertices: Vec3[] = [],
    faces: number[][] = [],
    ids = new Map<string, number>();
  const vertex = (indices: number[]) => {
    const key = indices.join(',');
    if (ids.has(key)) return ids.get(key)!;
    const position = indices.map((i, a) => grid[a][i] + part.origin[a]) as Vec3;
    const follows =
      source.profileMode !== 'independent' &&
      Boolean(definition.profile || definition.curve);
    const edges =
      follows || source.profileMode === 'cabinet' ? undefined : source.edges;
    const shape =
      follows || source.profileMode === 'cabinet' ? undefined : source.shape;
    let x = position[0],
      z = position[1];
    if (shape === 'round-left' || shape === 'round-right') {
      const v = (z - source.z - source.depth / 2) / (source.depth / 2);
      const reach = Math.sqrt(Math.max(0, 1 - v * v));
      const localX = x - source.x;
      x =
        source.x +
        (shape === 'round-right'
          ? localX * reach
          : source.width - (source.width - localX) * reach);
    }
    if (edges) {
      const front = source.kind === 'door' || source.kind === 'drawer';
      z +=
        edgeSetback(x - source.x, source.width, edges) *
        (front ? 1 : 1 - (z - source.z) / source.depth);
    }
    const mapped = cabinetProfilePoint(definition, source, x, z);
    ids.set(key, vertices.length);
    vertices.push([mapped[0], mapped[1], position[2]]);
    return vertices.length - 1;
  };
  const sides = [
    [
      [-1, 0, 0],
      [
        [0, 0, 0],
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 0],
      ],
    ],
    [
      [1, 0, 0],
      [
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
        [1, 0, 1],
      ],
    ],
    [
      [0, -1, 0],
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ],
    ],
    [
      [0, 1, 0],
      [
        [0, 1, 0],
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
      ],
    ],
    [
      [0, 0, -1],
      [
        [0, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [1, 0, 0],
      ],
    ],
    [
      [0, 0, 1],
      [
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
      ],
    ],
  ];
  for (const key of filled) {
    const indices = key.split(',').map(Number);
    for (const [offset, corners] of sides) {
      if (
        filled.has(indices.map((v, a) => v + (offset as number[])[a]).join(','))
      )
        continue;
      const face = (corners as number[][]).map((corner) =>
        vertex(corner.map((v, a) => v + indices[a])),
      );
      // Quads can become non-planar under a curve; use a consistent diagonal.
      faces.push([face[0], face[1], face[2]], [face[0], face[2], face[3]]);
    }
  }
  const lo = [0, 1, 2].map((a) =>
    Math.min(...vertices.map((v) => v[a])),
  ) as Vec3;
  const hi = [0, 1, 2].map((a) =>
    Math.max(...vertices.map((v) => v[a])),
  ) as Vec3;
  part.origin = lo;
  part.size = hi.map((v, a) => v - lo[a]) as Vec3;
  part.mesh = {
    vertices: vertices.map((v) => v.map((n, a) => n - lo[a]) as Vec3),
    faces,
  };
  part.pockets = [];
}

/** Extrude the same authoritative polygon used by the cabinet preview. */
export function outlinedStock(
  part: FabricationPart,
  outline: Array<{x: number; y: number}>,
) {
  const points = outline
    .filter(
      (p, i) =>
        !i || Math.hypot(p.x - outline[i - 1].x, p.y - outline[i - 1].y) > 1e-8,
    )
    .map((p) => new Vector2(p.x, p.y));
  if (points[0].distanceTo(points[points.length - 1]) < 1e-8) points.pop();
  const n = points.length;
  const vertices: Vec3[] = [0, part.size[1]].flatMap((z) =>
    points.map((p) => [p.x, z, p.y] as Vec3),
  );
  const faces = ShapeUtils.triangulateShape(points, []).flatMap(([a, b, c]) => [
    [a, c, b],
    [a + n, b + n, c + n],
  ]);
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    faces.push([i, next, next + n], [i, next + n, i + n]);
  }
  part.mesh = {vertices, faces};
}
