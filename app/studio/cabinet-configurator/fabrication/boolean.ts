import type {Vec3, FabricationPart} from './model';
const EPS = 1e-7;
const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3;
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3;
const scale = (a: Vec3, t: number): Vec3 => a.map((v) => v * t) as Vec3;
const dot = (a: Vec3, b: Vec3) => a.reduce((n, v, i) => n + v * b[i], 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
type Polygon = {points: Vec3[]; normal: Vec3; distance: number};
function polygon(points: Vec3[]): Polygon | null {
  for (let i = 1; i < points.length - 1; i++) {
    const n = cross(sub(points[i], points[0]), sub(points[i + 1], points[0]));
    const length = Math.sqrt(dot(n, n));
    if (length > EPS) {
      const normal = scale(n, 1 / length);
      return {points, normal, distance: dot(normal, points[0])};
    }
  }
  return null;
}
function split(
  p: Polygon,
  plane: Polygon,
  cf: Polygon[],
  cb: Polygon[],
  front: Polygon[],
  back: Polygon[],
) {
  const kinds = p.points.map((v) => {
    const t = dot(plane.normal, v) - plane.distance;
    return t < -EPS ? 2 : t > EPS ? 1 : 0;
  });
  const kind = kinds.reduce<number>((a, b) => a | b, 0);
  if (kind === 0) (dot(p.normal, plane.normal) > 0 ? cf : cb).push(p);
  else if (kind === 1) front.push(p);
  else if (kind === 2) back.push(p);
  else {
    const f: Vec3[] = [],
      b: Vec3[] = [];
    p.points.forEach((v, i) => {
      const j = (i + 1) % p.points.length,
        w = p.points[j],
        a = kinds[i],
        c = kinds[j];
      if (a !== 2) f.push(v);
      if (a !== 1) b.push(v);
      if ((a | c) === 3) {
        const d = sub(w, v);
        const t =
          (plane.distance - dot(plane.normal, v)) / dot(plane.normal, d);
        const n = add(v, scale(d, t));
        f.push(n);
        b.push(n);
      }
    });
    const fp = polygon(f),
      bp = polygon(b);
    if (fp) front.push(fp);
    if (bp) back.push(bp);
  }
}
class Tree {
  plane?: Polygon;
  polygons: Polygon[] = [];
  front?: Tree;
  back?: Tree;
  constructor(polygons: Polygon[] = []) {
    this.build(polygons);
  }
  build(polygons: Polygon[]) {
    if (!polygons.length) return;
    this.plane ??= polygons[0];
    const f: Polygon[] = [],
      b: Polygon[] = [];
    for (const p of polygons)
      split(p, this.plane, this.polygons, this.polygons, f, b);
    if (f.length) {
      (this.front ??= new Tree()).build(f);
    }
    if (b.length) {
      (this.back ??= new Tree()).build(b);
    }
  }
  invert() {
    this.polygons = this.polygons.map((p) => ({
      ...p,
      points: [...p.points].reverse(),
      normal: scale(p.normal, -1),
      distance: -p.distance,
    }));
    if (this.plane)
      this.plane = {
        ...this.plane,
        normal: scale(this.plane.normal, -1),
        distance: -this.plane.distance,
      };
    this.front?.invert();
    this.back?.invert();
    [this.front, this.back] = [this.back, this.front];
  }
  clip(polygons: Polygon[]): Polygon[] {
    if (!this.plane) return polygons;
    let f: Polygon[] = [],
      b: Polygon[] = [];
    for (const p of polygons) split(p, this.plane, f, b, f, b);
    if (this.front) f = this.front.clip(f);
    b = this.back ? this.back.clip(b) : [];
    return [...f, ...b];
  }
  clipTo(tree: Tree) {
    this.polygons = tree.clip(this.polygons);
    this.front?.clipTo(tree);
    this.back?.clipTo(tree);
  }
  all(): Polygon[] {
    return [
      ...this.polygons,
      ...(this.front?.all() ?? []),
      ...(this.back?.all() ?? []),
    ];
  }
}
function box(
  origin: Vec3,
  size: Vec3,
  basis: [Vec3, Vec3, Vec3] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
) {
  const vertices = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ].map((v) =>
    v.reduce((p, n, a) => add(p, scale(basis[a], n * size[a])), origin),
  );
  return [
    [0, 4, 7, 3],
    [1, 2, 6, 5],
    [0, 1, 5, 4],
    [3, 7, 6, 2],
    [0, 3, 2, 1],
    [4, 5, 6, 7],
  ].map((face) => polygon(face.map((i) => vertices[i]))!);
}
function subtract(a: Polygon[], b: Polygon[]) {
  const left = new Tree(a),
    right = new Tree(b);
  left.invert();
  left.clipTo(right);
  right.clipTo(left);
  right.invert();
  right.clipTo(left);
  right.invert();
  left.build(right.all());
  left.invert();
  return left.all();
}
/** Machine a tilted shelf housing into a side, in its original stock coordinates. */
export function angledHousing(
  receiver: FabricationPart,
  donors: FabricationPart[],
) {
  let polygons = receiver.mesh
    ? receiver.mesh.faces
        .map((face) => polygon(face.map((i) => receiver.mesh!.vertices[i]))!)
        .filter(Boolean)
    : box([0, 0, 0], receiver.size);
  for (const p of receiver.pockets)
    polygons = subtract(polygons, box(p.origin, p.size));
  for (const donor of donors)
    polygons = subtract(
      polygons,
      box(sub(donor.origin, receiver.origin), donor.size, donor.basis),
    );
  const vertices: Vec3[] = [],
    index = new Map<string, number>();
  const vertex = (p: Vec3) => {
    const key = p.map((v) => v.toFixed(7)).join(',');
    if (!index.has(key)) {
      index.set(key, vertices.length);
      vertices.push(p);
    }
    return index.get(key)!;
  };
  const faces = polygons.map((p) => p.points.map(vertex));
  // Boolean splits introduce T-junctions; include every vertex on an edge in
  // both adjacent polygons before sending it to SketchUp's EntitiesBuilder.
  const stitched = faces.map((face) =>
    face.flatMap((id, i) => {
      const a = vertices[id],
        b = vertices[face[(i + 1) % face.length]],
        d = sub(b, a),
        length = dot(d, d);
      if (length < EPS) return [];
      const along = vertices
        .map((p, j) => ({j, t: dot(sub(p, a), d) / length}))
        .filter(
          ({j, t}) =>
            t >= -EPS &&
            t < 1 - EPS &&
            Math.sqrt(
              dot(
                sub(vertices[j], add(a, scale(d, t))),
                sub(vertices[j], add(a, scale(d, t))),
              ),
            ) < EPS,
        )
        .sort((a, b) => a.t - b.t);
      return along.map((v) => v.j);
    }),
  );
  receiver.mesh = {vertices, faces: stitched};
  receiver.pockets = [];
}
