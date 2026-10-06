import * as THREE from 'three';

/** Physical profile dimensions in inches, measured from the front face. */
export const SHAKER_PANEL_SETBACK = 5 / 16;
export const SHAKER_BEAD_WIDTH = 1 / 4;
export const BEAD_SEGMENTS = 16;
export const isShakerFace = (style?: string) =>
  ['shaker', 'beaded-shaker', 'shaker-glass', 'inset-shaker'].includes(
    style ?? '',
  );

export function shakerPanelDepth(depth: number, thickness = depth / 3) {
  if (depth <= SHAKER_PANEL_SETBACK)
    throw new Error(
      'Shaker stock must be thicker than its 5/16-inch panel setback.',
    );
  return Math.min(thickness, depth - SHAKER_PANEL_SETBACK);
}

type Point = {x: number; y: number};
/** Parallel polygon offset with mitered corners. Points must be counterclockwise. */
export function offsetProfile(points: Point[], distance: number): Point[] {
  return points.map((p, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    const a = new THREE.Vector2(p.x - previous.x, p.y - previous.y).normalize();
    const b = new THREE.Vector2(next.x - p.x, next.y - p.y).normalize();
    const normal = new THREE.Vector2(a.y + b.y, -a.x - b.x);
    const divisor = normal.dot(new THREE.Vector2(a.y, -a.x));
    return {
      x: p.x + (distance * normal.x) / divisor,
      y: p.y + (distance * normal.y) / divisor,
    };
  });
}

/** Closed bead stock around an aperture. Front is -Z, crown stays on the face
 * plane, and the half-round section is exactly 1/4 inch across. */
export function shakerBeadGeometry(aperture: Point[], depth: number) {
  const radius = SHAKER_BEAD_WIDTH / 2;
  const sections = [{offset: SHAKER_BEAD_WIDTH, z: -depth / 2}];
  for (let i = 0; i <= BEAD_SEGMENTS; i++) {
    const angle = (Math.PI * i) / BEAD_SEGMENTS;
    sections.push({
      offset: radius * (1 + Math.cos(angle)),
      z: -depth / 2 + radius * (1 - Math.sin(angle)),
    });
  }
  sections.push(
    {offset: 0, z: depth / 2},
    {offset: SHAKER_BEAD_WIDTH, z: depth / 2},
  );
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const section of sections)
    for (const p of offsetProfile(aperture, section.offset))
      vertices.push(p.x, p.y, section.z);
  const n = aperture.length;
  for (let s = 0; s < sections.length; s++)
    for (let i = 0; i < n; i++) {
      const a = s * n + i,
        b = s * n + ((i + 1) % n);
      const c = ((s + 1) % sections.length) * n + i;
      const d = ((s + 1) % sections.length) * n + ((i + 1) % n);
      indices.push(a, c, b, b, c, d);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      vertices.flatMap((_, i) =>
        i % 3 === 0 ? [vertices[i], vertices[i + 1]] : [],
      ),
      2,
    ),
  );
  return geometry;
}

/** Segment long bead runs before applying a cabinet curve. */
export function rectangularBeadAperture(
  width: number,
  height: number,
  rail: number,
  segmented = false,
) {
  const x = width / 2 - rail,
    y = height / 2 - rail;
  const count = segmented ? 64 : 1;
  const points: Point[] = [];
  for (let i = 0; i < count; i++)
    points.push({x: -x + (2 * x * i) / count, y: -y});
  for (let i = 0; i < count; i++) points.push({x, y: -y + (2 * y * i) / count});
  for (let i = 0; i < count; i++) points.push({x: x - (2 * x * i) / count, y});
  for (let i = 0; i < count; i++)
    points.push({x: -x, y: y - (2 * y * i) / count});
  return points;
}
