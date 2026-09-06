import * as THREE from 'three';
import {cabinetColor} from './materials';
import {applianceGeometry} from './applianceGeometry';
import {roomSegments, roomWall, wallPoint, roomPoints} from './roomOutline';
import {
  type KitchenElement,
  type Opening,
  type Room,
  type Wall,
  type Island,
} from './model';
const inch = 0.0254;
export function islandCountertop(island: Island, elements: KitchenElement[]) {
  const shape = new THREE.Shape();
  const w = (island.width / 2 + island.overhang) * inch,
    d = (island.depth / 2 + island.overhang) * inch;
  shape.moveTo(-w, -d);
  shape.lineTo(w, -d);
  shape.lineTo(w, d);
  shape.lineTo(-w, d);
  shape.closePath();
  for (const item of elements) {
    if (
      item.islandId !== island.id ||
      item.configuration !== 'sink' ||
      item.placement.mode !== 'floor'
    )
      continue;
    const angle = (-island.rotation * Math.PI) / 180,
      dx = item.placement.x - island.x,
      dz = item.placement.z - island.z;
    const x = dx * Math.cos(angle) - dz * Math.sin(angle),
      z = dx * Math.sin(angle) + dz * Math.cos(angle);
    const rotation =
      ((item.placement.rotation - island.rotation) * Math.PI) / 180;
    const sw = Math.min(22, item.width * 0.7) / 2,
      sd = Math.min(16, item.depth * 0.65) / 2;
    const points = [
      [-sw, -sd],
      [-sw, sd],
      [sw, sd],
      [sw, -sd],
    ].map(
      ([a, b]) =>
        new THREE.Vector2(
          (x + a * Math.cos(rotation) - b * Math.sin(rotation)) * inch,
          (z + a * Math.sin(rotation) + b * Math.cos(rotation)) * inch,
        ),
    );
    shape.holes.push(new THREE.Path(points));
  }
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {depth: 1.5 * inch, bevelEnabled: false}),
    new THREE.MeshStandardMaterial({color: 0xe0d9cc, roughness: 0.35}),
  );
  mesh.rotation.x = Math.PI / 2;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}
function box(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      Math.max(w, 0.01) * inch,
      Math.max(h, 0.01) * inch,
      Math.max(d, 0.01) * inch,
    ),
    material,
  );
  mesh.position.set(x * inch, y * inch, z * inch);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
export function cabinetGeometry(
  item: KitchenElement,
  countertop: boolean,
  sharedCountertop = false,
) {
  if (item.kind === 'base' && item.configuration === 'corner') {
    const group = new THREE.Group();
    const w = item.width,
      d = item.depth,
      arm = Math.min(24, (w * 2) / 3, (d * 2) / 3);
    const back = cabinetGeometry(
      {...item, configuration: 'single-door', depth: arm},
      false,
    );
    back.position.z = (-d / 2 + arm / 2) * inch;
    group.add(back);
    const leg = cabinetGeometry(
      {...item, configuration: 'single-door', width: d - arm, depth: arm},
      false,
    );
    leg.rotation.y = Math.PI / 2;
    leg.position.set((-w / 2 + arm / 2) * inch, 0, (arm / 2) * inch);
    group.add(leg);
    if (countertop && !sharedCountertop) {
      const shape = new THREE.Shape();
      const points = [
        [-w / 2 - 1, -d / 2 - 1],
        [w / 2 + 1, -d / 2 - 1],
        [w / 2 + 1, -d / 2 + arm + 1],
        [-w / 2 + arm + 1, -d / 2 + arm + 1],
        [-w / 2 + arm + 1, d / 2 + 1],
        [-w / 2 - 1, d / 2 + 1],
      ];
      points.forEach(([x, z], i) =>
        i ? shape.lineTo(x * inch, z * inch) : shape.moveTo(x * inch, z * inch),
      );
      shape.closePath();
      const top = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, {
          depth: 1.5 * inch,
          bevelEnabled: false,
        }),
        new THREE.MeshStandardMaterial({color: 0xe0d9cc, roughness: 0.35}),
      );
      top.rotation.x = Math.PI / 2;
      top.position.y = (item.height / 2 + 1.5) * inch;
      group.add(top);
    }
    return group;
  }
  const group = new THREE.Group();
  const {width: w, height: h, depth: d} = item;
  const wood = new THREE.MeshStandardMaterial({
    color: cabinetColor(item),
    roughness: 0.6,
  });
  const panel = new THREE.MeshStandardMaterial({
    color: cabinetColor(item),
    roughness: 0.65,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x39322b,
    roughness: 0.8,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0xb9c0c4,
    metalness: 0.65,
    roughness: 0.28,
  });
  const stone = new THREE.MeshStandardMaterial({
    color: 0xe0d9cc,
    roughness: 0.35,
  });
  const toe = item.kind === 'wall-cabinet' ? 0 : Math.min(4, h / 3);
  const bottom = -h / 2 + toe;
  // Open carcass keeps the sink cavity visible; recessed plinth is four inches tall.
  if (toe) box(group, w - 0.5, toe, d - 3, 0, -h / 2 + toe / 2, -1.5, wood);
  for (const side of [-1, 1])
    box(group, 0.75, h - toe, d, side * (w / 2 - 0.375), toe / 2, 0, wood);
  box(group, w - 1.5, 0.75, d, 0, bottom + 0.375, 0, wood);
  if (item.kind === 'tall' || item.kind === 'wall-cabinet')
    box(group, w - 1.5, 0.75, d, 0, h / 2 - 0.375, 0, wood).name =
      'cabinet-top';
  box(group, w, h - toe, 0.5, 0, toe / 2, -d / 2 + 0.25, wood);
  const front = (
    width: number,
    height: number,
    x: number,
    y: number,
    drawer: boolean,
  ) => {
    const inset = item.face === 'inset-shaker';
    const faceZ = inset ? d / 2 - 0.375 : d / 2;
    if (inset) {
      const frame = Math.min(1.5, width / 6, height / 6);
      for (const side of [-1, 1]) {
        box(
          group,
          frame,
          height,
          0.75,
          x + (side * (width - frame)) / 2,
          y,
          faceZ,
          wood,
        ).name = 'cabinet-face-frame';
        box(
          group,
          width - 2 * frame,
          frame,
          0.75,
          x,
          y + (side * (height - frame)) / 2,
          faceZ,
          wood,
        ).name = 'cabinet-face-frame';
      }
      // One-eighth-inch reveal around each door or drawer, inside the frame.
      width -= 2 * frame + 0.25;
      height -= 2 * frame + 0.25;
    }
    const glass = item.face === 'shaker-glass' && item.kind === 'wall-cabinet';
    const frontPanel = box(
      group,
      width,
      height,
      0.5,
      x,
      y,
      faceZ - 0.1,
      glass
        ? new THREE.MeshStandardMaterial({
            color: 0xb6d2d7,
            transparent: true,
            opacity: 0.3,
            roughness: 0.12,
            depthWrite: false,
          })
        : panel,
    );
    frontPanel.name = 'cabinet-front';
    if (item.face === 'shaker' || inset || glass) {
      const rail = Math.min(2, width / 5, height / 4);
      for (const side of [-1, 1]) {
        box(
          group,
          rail,
          height,
          0.75,
          x + (side * (width - rail)) / 2,
          y,
          faceZ,
          wood,
        );
        box(
          group,
          width - 2 * rail,
          rail,
          0.75,
          x,
          y + (side * (height - rail)) / 2,
          faceZ,
          wood,
        );
      }
    }
    if (drawer)
      box(group, Math.min(6, width * 0.5), 0.35, 1, x, y, faceZ + 0.7, steel);
    else
      box(
        group,
        0.35,
        4,
        1,
        x +
          width *
            0.33 *
            (x > 0 ? -1 : x < 0 ? 1 : item.hinge === 'right' ? -1 : 1),
        item.kind === 'wall-cabinet' ||
          (item.kind === 'tall' &&
            ['one-oven', 'two-oven', 'coffee-maker'].includes(
              item.tallConfiguration ?? '',
            ))
          ? y - height / 2 + Math.min(4, height / 2)
          : item.kind === 'tall'
            ? Math.max(
                y - height / 2 + Math.min(2.5, height / 2),
                Math.min(
                  y + height / 2 - Math.min(2.5, height / 2),
                  36 - (item.placement.elevation ?? 0) - h / 2,
                ),
              )
            : y + height * 0.22,
        faceZ + 0.7,
        steel,
      );
  };
  const usable = h - toe - 0.25;
  const config = item.configuration ?? 'single-door';
  if (item.kind === 'base' && config === 'microwave-drawer') {
    const microwaveHeight = Math.min(16, usable * 0.6);
    const drawerHeight = usable - microwaveHeight - 0.25;
    front(w - 0.25, drawerHeight - 0.125, 0, bottom + drawerHeight / 2, true);
    const y = h / 2 - microwaveHeight / 2 - 0.125;
    const unit = new THREE.Group();
    unit.name = 'base-microwave-drawer';
    group.add(unit);
    box(unit, w - 1.5, microwaveHeight, d - 1, 0, y, 0, steel);
    box(unit, w - 3, microwaveHeight - 3, 0.25, 0, y - 0.5, d / 2 - 0.25, dark);
    // A wide horizontal pull distinguishes this from a side-hinged microwave.
    box(
      unit,
      w * 0.65,
      0.5,
      1.25,
      0,
      y + microwaveHeight / 2 - 3,
      d / 2 + 0.5,
      steel,
    );
    box(
      unit,
      Math.min(5, w / 4),
      0.8,
      0.3,
      w / 4,
      y + microwaveHeight / 2 - 1,
      d / 2 - 0.1,
      dark,
    );
  } else if (
    item.kind === 'tall' &&
    ['one-oven', 'two-oven', 'coffee-maker'].includes(
      item.tallConfiguration ?? '',
    )
  ) {
    const coffee = item.tallConfiguration === 'coffee-maker';
    const count = item.tallConfiguration === 'two-oven' ? 2 : 1;
    // Scale short concept cabinets proportionally; normal tall cabinets use 28-inch ovens.
    const ovenHeight = Math.min(coffee ? 18 : 28, (usable * 0.64) / count);
    const drawerHeight = coffee
      ? 36 - toe
      : Math.min(count === 2 ? 12 : 24, usable * 0.28);
    const ovenBottom = bottom + drawerHeight;
    for (let i = 0; i < 2; i++) {
      front(
        w - 0.25,
        drawerHeight / 2 - 0.125,
        0,
        bottom + ((i + 0.5) * drawerHeight) / 2,
        true,
      );
    }
    for (let i = 0; i < count; i++) {
      const oven = applianceGeometry(
        coffee ? 'coffee-maker' : 'wall-oven',
        (w - 1.5) * inch,
        (ovenHeight - 0.25) * inch,
        (d - 1) * inch,
      );
      oven.name = coffee ? 'tall-cabinet-coffee-maker' : 'tall-cabinet-oven';
      oven.position.set(
        0,
        (ovenBottom + (i + 0.5) * ovenHeight) * inch,
        0.5 * inch,
      );
      group.add(oven);
    }
    const doorBottom = ovenBottom + count * ovenHeight;
    const doorHeight = h / 2 - doorBottom - 0.25;
    const doorCount = w > 30 ? 2 : 1;
    for (let i = 0; i < doorCount; i++) {
      front(
        w / doorCount - 0.25,
        doorHeight,
        doorCount === 1 ? 0 : ((i === 0 ? -1 : 1) * w) / 4,
        doorBottom + doorHeight / 2,
        false,
      );
    }
  } else if (item.kind === 'base' && config === 'three-drawer') {
    const heights = [usable * 0.4, usable * 0.4, usable * 0.2];
    let y = bottom + 0.125;
    for (const height of heights) {
      front(w - 0.25, height - 0.125, 0, y + height / 2, true);
      y += height;
    }
  } else if (
    item.kind === 'base' &&
    (config === 'door-drawer' || config === 'sink')
  ) {
    const drawerHeight = Math.min(6, usable / 3);
    front(
      w - 0.25,
      drawerHeight - 0.125,
      0,
      h / 2 - drawerHeight / 2 - 0.125,
      true,
    );
    const doorHeight = usable - drawerHeight - 0.125;
    if (w > 30)
      for (const side of [-1, 1])
        front(
          w / 2 - 0.1875,
          doorHeight,
          (side * w) / 4,
          bottom + doorHeight / 2 + 0.125,
          false,
        );
    else front(w - 0.25, doorHeight, 0, bottom + doorHeight / 2 + 0.125, false);
  } else if (w > 30 && !(item.kind === 'base' && config === 'pullout')) {
    for (const side of [-1, 1])
      front(w / 2 - 0.1875, usable, (side * w) / 4, toe / 2, false);
  } else
    front(
      w - 0.25,
      usable,
      0,
      toe / 2,
      item.kind === 'base' && config === 'pullout',
    );
  if (countertop && item.kind === 'base') {
    const topY = h / 2 + 0.75;
    if (config === 'sink') {
      const sw = Math.min(22, w * 0.7),
        sd = Math.min(16, d * 0.65);
      // Four countertop strips surround a true opening, with an open basin below.
      for (const side of [-1, 1]) {
        if (!sharedCountertop) {
          box(
            group,
            (w + 2 - sw) / 2,
            1.5,
            d + 2,
            side * (sw / 2 + (w + 2 - sw) / 4),
            topY,
            0,
            stone,
          );
          box(
            group,
            sw,
            1.5,
            (d + 2 - sd) / 2,
            0,
            topY,
            side * (sd / 2 + (d + 2 - sd) / 4),
            stone,
          );
        }
        box(group, 0.3, 7, sd, side * (sw / 2 - 0.15), h / 2 - 2, 0, steel);
        box(group, sw, 7, 0.3, 0, h / 2 - 2, side * (sd / 2 - 0.15), steel);
        box(group, 0.7, 0.18, sd + 0.7, (side * sw) / 2, h / 2 + 1.6, 0, steel);
        box(group, sw + 0.7, 0.18, 0.7, 0, h / 2 + 1.6, (side * sd) / 2, steel);
      }
      box(group, sw, 0.3, sd, 0, h / 2 - 5.5, 0, steel);
      box(group, 1, 8, 1, 0, h / 2 + 5.5, -sd / 2 - 1, steel);
      box(group, 1, 1, 6, 0, h / 2 + 9, -sd / 2 + 1.5, steel);
      box(group, 1, 2, 1, 0, h / 2 + 8, -sd / 2 + 4, steel);
    } else if (!sharedCountertop)
      box(group, w + 2, 1.5, d + 2, 0, topY, 0, stone);
  }
  return group;
}

export function placeOnWall(
  group: THREE.Group,
  wall: Wall,
  center: number,
  room: Room,
) {
  const s = roomWall(room, wall),
    p = wallPoint(room, wall, center);
  group.rotation.y = s.horizontal ? 0 : -Math.PI / 2;
  group.position.set(
    (p.x - room.width / 2) * inch,
    0,
    (p.z - room.depth / 2) * inch,
  );
}
export function roomFloorGeometry(room: Room, color: number) {
  const shape = new THREE.Shape();
  roomPoints(room).forEach((p, i) => {
    const x = (p.x - room.width / 2) * inch,
      y = -(p.z - room.depth / 2) * inch;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({color, side: THREE.DoubleSide}),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.02;
  mesh.receiveShadow = true;
  return mesh;
}
export function roomGeometry(room: Room, openings: Opening[], color: number) {
  const groups: THREE.Group[] = [];
  for (const segment of roomSegments(room)) {
    const wall = segment.id,
      length = segment.length;
    const wallGroup = new THREE.Group();
    // Near walls remain translucent so all four walls can be edited from outside.
    const mat = new THREE.MeshStandardMaterial({
      color,
      transparent: segment.nx < 0 || segment.nz < 0,
      opacity: segment.nx < 0 || segment.nz < 0 ? 0.18 : 1,
      depthWrite: !(segment.nx < 0 || segment.nz < 0),
    });
    const holes = openings.filter((o) => o.wall === wall);
    const xs = [
      0,
      length,
      ...holes.flatMap((o) => [o.offset, o.offset + o.width]),
    ]
      .map((x) => Math.max(0, Math.min(length, x)))
      .sort((a, b) => a - b);
    const ys = [
      0,
      room.height,
      ...holes.flatMap((o) => {
        const y = o.kind === 'window' ? (o.sill ?? 42) : 0;
        return [y, y + o.height];
      }),
    ]
      .map((y) => Math.max(0, Math.min(room.height, y)))
      .sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++)
      for (let j = 1; j < ys.length; j++) {
        const x = (xs[i] + xs[i - 1]) / 2,
          y = (ys[j] + ys[j - 1]) / 2;
        if (
          xs[i] === xs[i - 1] ||
          ys[j] === ys[j - 1] ||
          holes.some((o) => {
            const sill = o.kind === 'window' ? (o.sill ?? 42) : 0;
            return (
              x > o.offset &&
              x < o.offset + o.width &&
              y > sill &&
              y < sill + o.height
            );
          })
        )
          continue;
        box(
          wallGroup,
          xs[i] - xs[i - 1],
          ys[j] - ys[j - 1],
          1.5,
          x - length / 2,
          y,
          0,
          mat,
        );
      }
    placeOnWall(wallGroup, wall, length / 2, room);
    groups.push(wallGroup);
  }
  return groups;
}
export function openingGeometry(opening: Opening, room: Room) {
  const group = new THREE.Group();
  const {width: w, height: h} = opening;
  const sill = opening.kind === 'window' ? (opening.sill ?? 42) : 0;
  const trim = new THREE.MeshStandardMaterial({
    color: 0xf1eadc,
    roughness: 0.6,
  });
  const leaf = new THREE.MeshStandardMaterial({
    color: 0xb69a77,
    roughness: 0.65,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fc5d0,
    metalness: 0.15,
    roughness: 0.15,
    transparent: true,
    opacity: 0.45,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0xb4bbc0,
    metalness: 0.65,
    roughness: 0.3,
  });
  for (const side of [-1, 1]) {
    box(group, 1.5, h, 1.5, side * (w / 2 - 0.75), sill + h / 2, 0, trim);
    if (opening.kind !== 'opening' || side === 1)
      box(
        group,
        w,
        1.5,
        1.5,
        0,
        sill + (side === 1 ? h - 0.75 : 0.75),
        0,
        trim,
      );
  }
  if (opening.kind === 'window') {
    box(group, w - 3, h - 3, 0.25, 0, sill + h / 2, 0, glass);
    box(group, 1, h - 3, 1, 0, sill + h / 2, 0, trim);
    box(group, w - 3, 1, 1, 0, sill + h / 2, 0, trim);
  } else if (opening.kind === 'door') {
    box(group, w - 3, h - 3, 0.8, 0, sill + h / 2, 0, leaf);
    for (const side of [-1, 1])
      for (const face of [-1, 1])
        box(
          group,
          w - 8,
          h * 0.35,
          0.15,
          0,
          sill + h / 2 + side * h * 0.22,
          face * 0.5,
          trim,
        );
    for (const face of [-1, 1])
      box(group, 4, 0.5, 0.6, w / 2 - 5, 36, face * 0.9, metal);
  }
  placeOnWall(group, opening.wall, opening.offset + w / 2, room);
  group.userData.id = opening.id;
  return group;
}
