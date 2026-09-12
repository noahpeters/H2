import * as THREE from 'three';
import type {RoomElement, Room} from './model';
import {showerGlassSides} from './fixtures';
import {SINK_CATALOG, type SinkAttachment} from './sinkAttachments';
const inch = 0.0254;
const ceramic = () =>
  new THREE.MeshStandardMaterial({
    color: 0xf4f3ee,
    roughness: 0.23,
    side: THREE.DoubleSide,
  });
function box(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
  name = '',
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w * inch, h * inch, d * inch),
    material,
  );
  mesh.position.set(x * inch, y * inch, z * inch);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
/** Closed cross-section with outer taper, rolled rim and visible inner basin. */
export function ovalBasin(
  w: number,
  d: number,
  h: number,
  material = ceramic(),
) {
  const points = [
    [0, 0],
    [0.68, 0],
    [0.8, 0.08],
    [0.95, 0.55],
    [1, 1],
    [0.95, 1],
    [0.9, 0.55],
    [0.65, 0.15],
    [0, 0.15],
  ].map(([r, y]) => new THREE.Vector2(r, y * h * inch));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(points, 64), material);
  mesh.scale.set((w * inch) / 2, 1, (d * inch) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
export function fixtureGeometry(item: RoomElement, room: Room) {
  const group = new THREE.Group(),
    mat = ceramic();
  const w = item.width,
    d = item.depth;
  const h = item.fixtureKind === 'glass-shower' ? room.height : item.height;
  const bottom = -item.height / 2;
  if (item.fixtureKind === 'freestanding-tub') {
    const basin = ovalBasin(w, d, h);
    basin.position.y = bottom * inch;
    group.add(basin);
  } else if (item.fixtureKind === 'alcove-tub') {
    box(group, w, 2, d, 0, bottom + 1, 0, mat);
    for (const side of [-1, 1]) {
      box(group, 2, h, d, side * (w / 2 - 1), bottom + h / 2, 0, mat);
      box(group, w - 4, h, 2, 0, bottom + h / 2, side * (d / 2 - 1), mat);
    }
  } else if (item.fixtureKind === 'toilet') {
    box(
      group,
      w * 0.48,
      h * 0.38,
      d * 0.52,
      0,
      bottom + h * 0.19,
      d * 0.08,
      mat,
    );
    const bowl = ovalBasin(w, d * 0.68, h * 0.25);
    bowl.position.set(0, (bottom + h * 0.34) * inch, d * 0.13 * inch);
    group.add(bowl);
    box(
      group,
      w * 0.83,
      h * 0.65,
      d * 0.24,
      0,
      bottom + h * 0.675,
      -d * 0.38,
      mat,
    );
    box(group, w * 0.88, 1, d * 0.27, 0, bottom + h, -d * 0.38, mat);
    const seat = new THREE.Mesh(new THREE.TorusGeometry(1, 0.065, 10, 64), mat);
    seat.rotation.x = Math.PI / 2;
    seat.scale.set(w * 0.46 * inch, d * 0.31 * inch, 1.2 * inch);
    seat.position.set(0, (bottom + h * 0.59) * inch, d * 0.13 * inch);
    group.add(seat);
  } else {
    box(group, w, 1, d, 0, bottom + 0.5, 0, mat, 'shower-tray');
    const glass = new THREE.MeshStandardMaterial({
      color: 0xb7d9db,
      transparent: true,
      opacity: 0.23,
      roughness: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const metal = new THREE.MeshStandardMaterial({
      color: 0x555b5b,
      metalness: 0.65,
      roughness: 0.3,
    });
    const sides = showerGlassSides(item, room);
    const opening = sides.includes(item.showerOpening?.side ?? 'front')
      ? (item.showerOpening?.side ?? 'front')
      : sides[0];
    for (const side of sides) {
      const horizontal = side === 'front' || side === 'back';
      const length = horizontal ? w : d;
      const sign = side === 'back' || side === 'left' ? -1 : 1;
      const panel = (
        span: number,
        offset: number,
        material: THREE.Material,
        name: string,
      ) =>
        box(
          group,
          horizontal ? span : 0.4,
          h - 1,
          horizontal ? 0.4 : span,
          horizontal ? offset : (sign * w) / 2,
          bottom + (h + 1) / 2,
          horizontal ? (sign * d) / 2 : offset,
          material,
          name,
        );
      if (side === opening) {
        const gap = Math.min(28, length * 0.75);
        for (const sign of [-1, 1])
          panel(
            (length - gap) / 2,
            (sign * (length + gap)) / 4,
            glass,
            `shower-glass-${side}`,
          );
        if (item.showerOpening?.style !== 'open') {
          panel(gap - 0.3, 0, glass, 'shower-door');
          box(
            group,
            0.6,
            8,
            0.6,
            horizontal ? gap * 0.35 : (sign * w) / 2,
            bottom + 40,
            horizontal ? (sign * d) / 2 : gap * 0.35,
            metal,
            'shower-door-handle',
          );
        }
      } else panel(length, 0, glass, `shower-glass-${side}`);
    }
  }
  return group;
}
export function sinkGeometry(
  s: SinkAttachment,
  cabinetHeight: number,
  cabinetDepth: number,
) {
  const group = new THREE.Group();
  const mat =
    s.kind === 'undermount'
      ? new THREE.MeshStandardMaterial({
          color: 0xb9c0c4,
          metalness: 0.65,
          roughness: 0.3,
          side: THREE.DoubleSide,
        })
      : ceramic();
  const h = SINK_CATALOG[s.kind].height;
  const top = cabinetHeight / 2 + 1.5;
  if (s.kind === 'oval' || s.kind === 'vessel') {
    const basin = ovalBasin(s.width, s.depth, h, mat);
    basin.position.y = (s.kind === 'vessel' ? top : top - h) * inch;
    group.add(basin);
  } else {
    box(group, s.width, 0.3, s.depth, 0, top - h, 0, mat);
    for (const side of [-1, 1]) {
      box(
        group,
        0.3,
        h,
        s.depth,
        side * (s.width / 2 - 0.15),
        top - h / 2,
        0,
        mat,
      );
      box(
        group,
        s.width,
        h,
        0.3,
        0,
        top - h / 2,
        side * (s.depth / 2 - 0.15),
        mat,
      );
    }
    if (s.kind === 'farmhouse')
      box(
        group,
        s.width + 1.5,
        9,
        1.5,
        0,
        top - 5,
        cabinetDepth / 2 + 0.75,
        mat,
        'farmhouse-sink-apron',
      );
  }
  const faucet = new THREE.MeshStandardMaterial({
    color: 0x727979,
    metalness: 0.7,
    roughness: 0.28,
  });
  const faucetBase = top + (s.kind === 'vessel' ? h : 0);
  box(
    group,
    1,
    faucetBase - top + 8,
    1,
    0,
    (top + faucetBase + 8) / 2,
    -s.depth / 2 - 1,
    faucet,
  );
  box(group, 1, 1, 6, 0, faucetBase + 8, -s.depth / 2 + 1.5, faucet);
  box(group, 1, 2, 1, 0, faucetBase + 7, -s.depth / 2 + 4, faucet);
  group.position.x = s.x * inch;
  group.name = 'sink-attachment';
  return group;
}
/** Countertop with a matching cutout; reusable for local and island tops. */
export function sinkCutout(s: SinkAttachment) {
  const points: THREE.Vector2[] = [];
  const oval = s.kind === 'oval';
  const w = s.kind === 'vessel' ? 1.5 : s.width;
  const d = s.kind === 'vessel' ? 1.5 : s.depth;
  if (oval)
    for (let i = 64; i >= 0; i--) {
      const a = (i / 64) * Math.PI * 2;
      points.push(
        new THREE.Vector2(s.x + (w / 2) * Math.cos(a), (d / 2) * Math.sin(a)),
      );
    }
  else
    points.push(
      ...[
        [-w / 2, -d / 2],
        [-w / 2, d / 2],
        [w / 2, d / 2],
        [w / 2, -d / 2],
      ].map(([x, z]) => new THREE.Vector2(s.x + x, z)),
    );
  return points;
}
