import {decorateBackPanel} from './backPanels';
import type {ToeKickRun} from './continuousToeKicks';
import {wallThickness, wallFootprint, localWallDepth} from './wallDimensions';
import type {FrameNeighbors} from './continuousFaceFrames';
import {cabinetFaceFrame} from './faceFrame';
import {islandCountertopOutline} from './islandFootprint';
import {sinkAttachment} from './sinkAttachments';
import {sinkGeometry, sinkCutout} from './fixtureGeometry';
import {cabinetToeKick, cabinetCompositionEnvelope} from './cabinetEnvelope';
import {fitDefinition} from './custom-unit/designConfigurations';
import {customUnitGeometry} from './custom-unit/geometry';
import * as THREE from 'three';
import {
  DEFAULT_COUNTERTOP_EDGES,
  type CountertopEdges,
} from './countertopEdges';
import {
  createCabinetMaterial,
  mapMaterialPart,
  type PartRole,
} from './materialRendering';
import {storageLayout} from './openStorage';
import {applianceGeometry} from './applianceGeometry';
import {doorHandlePosition} from './hardwarePlacement';
import {roomSegments, roomWall, wallPoint, roomPoints} from './roomOutline';
import {
  type RoomElement,
  type Opening,
  type Room,
  type Wall,
  type Island,
} from './model';
const inch = 0.0254;
export function islandCountertop(
  island: Island,
  elements: RoomElement[],
  room?: Pick<Room, 'overlay' | 'islandCountertopOverhang'>,
) {
  const shape = new THREE.Shape();
  const b = islandCountertopOutline(island, elements, room);
  shape.moveTo(b.left * inch, b.top * inch);
  shape.lineTo(b.right * inch, b.top * inch);
  shape.lineTo(b.right * inch, b.bottom * inch);
  shape.lineTo(b.left * inch, b.bottom * inch);
  shape.closePath();
  for (const item of elements) {
    if (
      item.islandId !== island.id ||
      !sinkAttachment(item) ||
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
    const points = sinkCutout(sinkAttachment(item)!).map(
      ({x: a, y: b}) =>
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
  mesh.name = 'island-countertop';
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
  role: PartRole = 'board',
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      Math.max(w, 0.01) * inch,
      Math.max(h, 0.01) * inch,
      Math.max(d, 0.01) * inch,
    ),
    material,
  );
  mapMaterialPart(
    mesh.geometry,
    material,
    {
      width: Math.max(w, 0.01) * inch,
      height: Math.max(h, 0.01) * inch,
      depth: Math.max(d, 0.01) * inch,
    },
    'm',
    role,
  );
  mesh.position.set(x * inch, y * inch, z * inch);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function addToeKick(
  group: THREE.Group,
  item: RoomElement,
  toe: {height: number; setback: number},
  run?: ToeKickRun,
) {
  if (run?.hidden) return;
  return (box(
    group,
    run?.width ?? item.width,
    toe.height,
    item.depth - toe.setback,
    run?.x ?? 0,
    -item.height / 2 + toe.height / 2,
    -toe.setback / 2,
    createCabinetMaterial(item, 0.6),
    'rail',
  ).name = 'room-toe-kick');
}
export function toeKickGeometry(
  item: RoomElement,
  room: Room,
  run: ToeKickRun,
) {
  const group = new THREE.Group();
  addToeKick(group, item, cabinetToeKick(item, room), run);
  return group;
}
export function cabinetGeometry(
  item: RoomElement,
  countertop: boolean,
  sharedCountertop = false,
  room?: Pick<Room, 'toeKick' | 'overlay'>,
  edges: CountertopEdges = DEFAULT_COUNTERTOP_EDGES,
  frameNeighbors: FrameNeighbors = {},
  toeRun?: ToeKickRun,
) {
  if (item.customCabinet) {
    const toe = cabinetToeKick(item, room);
    const envelope = cabinetCompositionEnvelope(item, room);
    const definition = fitDefinition(item.customCabinet.definition, envelope);
    const group = new THREE.Group();
    const body = customUnitGeometry(
      definition,
      {},
      {
        face: item.face,
        overlay: room?.overlay,
        material: item.material ?? 'rift-white-oak',
        paintColor: item.paintColor,
        materialDefinition: item.materialDefinition,
        flatGrain: item.flatGrain,
      },
      {
        kind: item.kind,
        face: item.face,
        hinge: item.hinge,
        tallConfiguration: item.tallConfiguration,
        bodyElevation: (item.placement.elevation ?? 0) + toe.height,
      },
      frameNeighbors,
    );
    // The definition is already fitted to the body envelope. Convert units only:
    // bounds can include projecting fronts/end shelves or omit removed panels.
    // Normalizing those bounds would distort exact part sizes and positions.
    body.scale.set(inch, inch, -inch);
    body.position.y = (-item.height / 2 + toe.height) * inch;
    body.name = 'custom-cabinet-body';
    group.add(body);
    if (toe.height) addToeKick(group, item, toe, toeRun);
    if (countertop && item.kind === 'base')
      addBaseCountertop(group, item, sharedCountertop, edges);
    return group;
  }
  if (item.kind === 'base' && item.configuration === 'corner') {
    const group = new THREE.Group();
    const w = item.width,
      d = item.depth,
      arm = Math.min(24, (w * 2) / 3, (d * 2) / 3);
    const back = cabinetGeometry(
      {...item, configuration: 'single-door', depth: arm},
      false,
      false,
      room,
    );
    back.position.z = (-d / 2 + arm / 2) * inch;
    group.add(back);
    const leg = cabinetGeometry(
      {...item, configuration: 'single-door', width: d - arm, depth: arm},
      false,
      false,
      room,
    );
    leg.rotation.y = Math.PI / 2;
    leg.position.set((-w / 2 + arm / 2) * inch, 0, (arm / 2) * inch);
    group.add(leg);
    if (countertop && !sharedCountertop) {
      const shape = new THREE.Shape();
      const points = [
        [-w / 2 - edges.left, -d / 2 - edges.back],
        [w / 2 + edges.right, -d / 2 - edges.back],
        [w / 2 + edges.right, -d / 2 + arm + 1],
        [-w / 2 + arm + 1, -d / 2 + arm + 1],
        [-w / 2 + arm + 1, d / 2 + edges.front],
        [-w / 2 - edges.left, d / 2 + edges.front],
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
      top.name = 'cabinet-countertop';
      top.rotation.x = Math.PI / 2;
      top.position.y = (item.height / 2 + 1.5) * inch;
      group.add(top);
    }
    return group;
  }
  const group = new THREE.Group();
  const {width: w, height: h, depth: d} = item;
  const wood = createCabinetMaterial(item, 0.6);
  const panel = createCabinetMaterial(item, 0.65);
  const dark = new THREE.MeshStandardMaterial({
    color: 0x39322b,
    roughness: 0.8,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0xb9c0c4,
    metalness: 0.65,
    roughness: 0.28,
  });
  if (item.storage?.type === 'floating-shelves') {
    const group = new THREE.Group();
    const count = Math.max(1, item.storage.shelves);
    const shelfDepth = Math.max(6, item.depth);
    for (let index = 0; index < count; index++) {
      const y = count === 1 ? 0 : -h / 2 + (index * h) / (count - 1);
      box(group, w, 1.5, shelfDepth, 0, y, 0, wood, 'shelf').name =
        'floating-shelf';
      // A short inset block suggests concealed wall hardware without turning
      // the composition into a cabinet carcass.
      box(group, Math.max(4, w - 8), 1, 2, 0, y, -shelfDepth / 2, dark).name =
        'floating-shelf-cleat';
    }
    return group;
  }
  const support = cabinetToeKick(item, room);
  const toe = support.height;
  const bottom = -h / 2 + toe;
  if (toe) addToeKick(group, item, support, toeRun);
  for (const side of [-1, 1])
    box(
      group,
      0.75,
      h - toe,
      d,
      side * (w / 2 - 0.375),
      toe / 2,
      0,
      wood,
      'end',
    );
  box(group, w - 1.5, 0.75, d, 0, bottom + 0.375, 0, wood, 'shelf');
  if (item.kind === 'tall' || item.kind === 'wall-cabinet')
    box(group, w - 1.5, 0.75, d, 0, h / 2 - 0.375, 0, wood, 'shelf').name =
      'cabinet-top';
  if (!item.storage || item.storage.back) {
    const panel = box(group, w, h - toe, 0.5, 0, toe / 2, -d / 2 + 0.25, wood);
    panel.name = 'cabinet-back-panel';
    decorateBackPanel(panel, item.storage?.backStyle, w, h - toe, 0.5, inch);
  }

  const frontCells: {
    width: number;
    height: number;
    x: number;
    y: number;
    drawer: boolean;
  }[] = [];
  const front = (
    width: number,
    height: number,
    x: number,
    y: number,
    drawer: boolean,
  ) => {
    frontCells.push({width, height, x, y, drawer});
  };
  const drawFront = (
    width: number,
    height: number,
    x: number,
    y: number,
    drawer: boolean,
  ) => {
    const firstChild = group.children.length;
    const inset = room?.overlay === 'inset';
    const faceZ = inset
      ? d / 2 + 0.375
      : room?.overlay === 'partial-overlay'
        ? d / 2 + 0.75
        : d / 2;
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
      drawer ? 'drawer' : 'door',
    );
    frontPanel.name = 'cabinet-front';
    if (item.face === 'vertical-slat') {
      const spacing = Math.max(1.75, Math.min(2.5, width / 8));
      const count = Math.max(2, Math.floor(width / spacing));
      for (let index = 1; index < count; index++)
        box(
          group,
          0.16,
          Math.max(0.5, height - 0.5),
          0.1,
          x - width / 2 + (index * width) / count,
          y,
          faceZ + 0.22,
          dark,
        ).name = 'vertical-slat-groove';
    }
    if (item.face === 'shaker' || glass) {
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
          'stile',
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
          'rail',
        );
      }
    }
    if (drawer)
      box(group, Math.min(6, width * 0.5), 0.35, 1, x, y, faceZ + 0.7, steel);
    else {
      const hingeSide =
        x < 0 ? 'left' : x > 0 ? 'right' : (item.hinge ?? 'left');
      const handle = doorHandlePosition({
        width,
        height,
        absoluteTop: (item.placement.elevation ?? 0) + h / 2 + y + height / 2,
        faceStyle: item.face,
        hingeSide,
      });
      box(
        group,
        0.35,
        4,
        1,
        x + handle.x,
        y + handle.y,
        faceZ + 0.7,
        steel,
      ).name = 'cabinet-door-handle';
    }
    // Keep the complete face and hardware together, including shaker members.
    group.updateMatrixWorld(true);
    for (const child of group.children.slice(firstChild))
      if (child !== frontPanel) frontPanel.attach(child);
    const origin = frontPanel.position.clone();
    const side = x > 0 || (x === 0 && item.hinge === 'right') ? -1 : 1;
    const travel = Math.max(1, d - 2) * inch;
    if (drawer) {
      const drawerBox = new THREE.Group();
      drawerBox.name = 'storage-drawer-box';
      const innerWidth = Math.max(0.5, width - 1);
      const innerHeight = Math.max(0.5, height - 1);
      box(
        drawerBox,
        innerWidth,
        0.5,
        travel / inch,
        0,
        -innerHeight / 2,
        -travel / inch / 2 - 0.25,
        wood,
        'shelf',
      );
      for (const edge of [-1, 1])
        box(
          drawerBox,
          0.5,
          innerHeight,
          travel / inch,
          (edge * (innerWidth - 0.5)) / 2,
          0,
          -travel / inch / 2 - 0.25,
          wood,
          'drawer-side',
        );
      box(drawerBox, innerWidth, innerHeight, 0.5, 0, 0, -travel / inch, wood);
      frontPanel.add(drawerBox);
    }
    frontPanel.userData.updateOpening = (value: number) => {
      const amount = Math.max(0, Math.min(1, value));
      if (drawer) frontPanel.position.z = origin.z + amount * travel;
      else {
        const angle = (-side * amount * Math.PI) / 2;
        const radius = (side * width * inch) / 2;
        frontPanel.rotation.y = angle;
        frontPanel.position.x = origin.x - radius + radius * Math.cos(angle);
        frontPanel.position.z = origin.z - radius * Math.sin(angle);
      }
    };
  };
  const usable = h - toe - 0.25;
  const config = item.configuration ?? 'single-door';
  if (item.storage) {
    const layout = storageLayout(item, room);
    const {
      shelfWidth,
      shelfX,
      shelfYs,
      rods,
      rodWidth,
      rodX,
      divider,
      inner,
      low,
      high,
      drawers,
      drawerZone,
    } = layout;
    if (divider)
      box(
        group,
        0.75,
        high - low,
        d - 0.75,
        -inner / 2 + divider,
        (low + high) / 2 - h / 2,
        0,
        wood,
      ).name = 'storage-divider';
    for (const height of shelfYs) {
      const shelf = box(
        group,
        shelfWidth,
        0.75,
        d - 0.75,
        shelfX,
        height - h / 2,
        0,
        wood,
        'shelf',
      );
      shelf.name = 'storage-shelf';
      if (item.storage.type === 'shoes' && item.storage.angled) {
        shelf.rotation.x = (12 * Math.PI) / 180;
        const lip = box(
          group,
          shelfWidth,
          1.25,
          0.75,
          shelfX,
          height -
            h / 2 -
            ((d - 0.75) / 2) * Math.sin((12 * Math.PI) / 180) +
            0.5,
          ((d - 0.75) / 2) * Math.cos((12 * Math.PI) / 180),
          wood,
        );
        lip.name = 'shoe-retaining-lip';
      }
    }
    for (const height of rods) {
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.625 * inch,
          0.625 * inch,
          (rodWidth - 0.5) * inch,
          16,
        ),
        steel,
      );
      rod.rotation.z = Math.PI / 2;
      rod.position.set(rodX * inch, (height - h / 2) * inch, 0);
      rod.name = 'storage-hanging-rod';
      group.add(rod);
    }
    for (let i = 0; i < drawers; i++) {
      const height = drawerZone / drawers;
      front(
        w - 0.25,
        height - 0.125,
        0,
        low - h / 2 + (i + 0.5) * height,
        true,
      );
    }
    if (item.storage.doors && high - low - drawerZone > 1) {
      const count = w > 30 ? 2 : 1;
      const doorLow = low + drawerZone;
      for (let i = 0; i < count; i++)
        front(
          w / count - 0.25,
          high - doorLow - 0.125,
          count === 1 ? 0 : i === 0 ? -w / 4 : w / 4,
          (doorLow + high) / 2 - h / 2,
          false,
        );
    }
  } else if (item.kind === 'base' && config === 'microwave-drawer') {
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
  } else if (item.kind === 'base' && config === 'farmhouse-sink') {
    const apronHeight = Math.min(10, usable * 0.35);
    front(w - 0.25, apronHeight, 0, h / 2 - apronHeight / 2 - 0.125, false);
    const doorHeight = usable - apronHeight - 0.125;
    for (const side of [-1, 1])
      front(
        w / 2 - 0.1875,
        doorHeight,
        (side * w) / 4,
        bottom + doorHeight / 2 + 0.125,
        false,
      );
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
  if (
    frontCells.length &&
    (room?.overlay === 'inset' || room?.overlay === 'partial-overlay')
  ) {
    const frame = cabinetFaceFrame(
      frontCells.map((c) => ({
        ...c,
        x: c.x - c.width / 2,
        y: c.y - c.height / 2,
      })),
      {x: -w / 2, y: bottom, width: w, height: h - toe},
      {
        left: Boolean(frameNeighbors.left),
        right: Boolean(frameNeighbors.right),
      },
    );
    for (const [members, orientation] of [
      [frame.stiles, 'stile'],
      [frame.rails, 'rail'],
    ] as const)
      for (const r of members) {
        if (
          frameNeighbors.left &&
          orientation === 'stile' &&
          r === frame.stiles[0]
        )
          continue;
        box(
          group,
          r.width,
          r.height,
          0.75,
          r.x + r.width / 2,
          r.y + r.height / 2,
          d / 2 + 0.375,
          wood,
          orientation,
        ).name = 'cabinet-face-frame';
      }
    frontCells.forEach((c, i) => {
      const o = frame.openings[i];
      const overlap = room.overlay === 'partial-overlay' ? frame.width / 2 : 0;
      drawFront(
        o.width + 2 * overlap - 0.25,
        o.height + 2 * overlap - 0.25,
        o.x + o.width / 2,
        o.y + o.height / 2,
        c.drawer,
      );
    });
  } else
    for (const c of frontCells)
      drawFront(c.width, c.height, c.x, c.y, c.drawer);
  if (countertop && item.kind === 'base')
    addBaseCountertop(group, item, sharedCountertop, edges);
  return group;
}

/** Room countertop treatment is independent of the cabinet composition. */
function addBaseCountertop(
  group: THREE.Group,
  item: RoomElement,
  sharedCountertop: boolean,
  edges: CountertopEdges,
) {
  const {width: w, height: h, depth: d} = item;
  const stone = new THREE.MeshStandardMaterial({
    color: 0xe0d9cc,
    roughness: 0.35,
  });
  const topY = h / 2 + 0.75;
  const minX = -w / 2 - edges.left,
    maxX = w / 2 + edges.right;
  const minZ = -d / 2 - edges.back,
    maxZ = d / 2 + edges.front;
  const sink = sinkAttachment(item);
  if (sink) {
    if (!sharedCountertop) {
      const shape = new THREE.Shape();
      shape.moveTo(minX * inch, minZ * inch);
      shape.lineTo(maxX * inch, minZ * inch);
      shape.lineTo(maxX * inch, maxZ * inch);
      shape.lineTo(minX * inch, maxZ * inch);
      shape.closePath();
      shape.holes.push(
        new THREE.Path(sinkCutout(sink).map((p) => p.multiplyScalar(inch))),
      );
      const top = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, {
          depth: 1.5 * inch,
          bevelEnabled: false,
        }),
        stone,
      );
      top.name = 'cabinet-countertop';
      top.rotation.x = Math.PI / 2;
      top.position.y = (h / 2 + 1.5) * inch;
      group.add(top);
    }
    group.add(sinkGeometry(sink, h, d));
  } else if (!sharedCountertop)
    box(
      group,
      maxX - minX,
      1.5,
      maxZ - minZ,
      (minX + maxX) / 2,
      topY,
      (minZ + maxZ) / 2,
      stone,
    ).name = 'cabinet-countertop';
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
    wallGroup.userData.cutawayRoomWall = segment.nx < 0 || segment.nz < 0;
    // Near walls remain translucent in the interactive room view.
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
        const shape = new THREE.Shape();
        wallFootprint(room, wall, xs[i - 1], xs[i]).forEach((p, index) => {
          const localX =
            (segment.horizontal ? p.x - segment.x : p.z - segment.z) -
            length / 2;
          const localZ = segment.horizontal ? p.z - segment.z : segment.x - p.x;
          if (index === 0) shape.moveTo(localX * inch, -localZ * inch);
          else shape.lineTo(localX * inch, -localZ * inch);
        });
        shape.closePath();
        const mesh = new THREE.Mesh(
          new THREE.ExtrudeGeometry(shape, {
            depth: (ys[j] - ys[j - 1]) * inch,
            bevelEnabled: false,
          }),
          mat,
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = ys[j - 1] * inch;
        mesh.receiveShadow = true;
        wallGroup.add(mesh);
      }
    placeOnWall(wallGroup, wall, length / 2, room);
    groups.push(wallGroup);
  }
  return groups;
}
export function openingGeometry(opening: Opening, room: Room) {
  const group = new THREE.Group();
  const segment = roomWall(room, opening.wall);
  group.userData.cutawayRoomWall = segment.nx < 0 || segment.nz < 0;
  const {width: w, height: h} = opening;
  const sill = opening.kind === 'window' ? (opening.sill ?? 42) : 0;
  const thickness = wallThickness(room, opening.wall);
  const depth = localWallDepth(room, opening.wall);
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
    box(group, 1.5, h, thickness, side * (w / 2 - 0.75), sill + h / 2, 0, trim);
    if (opening.kind !== 'opening' || side === 1)
      box(
        group,
        w,
        1.5,
        thickness,
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
    const type = opening.doorType ?? 'swing';
    const count =
      type === 'double-swing' ||
      type === 'sliding-glass' ||
      type === 'sliding-closet'
        ? 2
        : 1;
    const panelWidth = (w - 3) / count;
    for (let i = 0; i < count; i++) {
      const center = -w / 2 + 1.5 + panelWidth * (i + 0.5);
      const depth = type.startsWith('sliding') ? (i ? 0.6 : -0.6) : 0;
      box(
        group,
        panelWidth - 0.2,
        h - 3,
        0.8,
        center,
        h / 2,
        depth,
        type === 'sliding-glass' || type === 'double-swing' ? glass : leaf,
      );
      for (const side of [-1, 1])
        box(
          group,
          1,
          h - 3,
          1,
          center + side * (panelWidth / 2 - 0.5),
          h / 2,
          depth,
          trim,
        );
      box(
        group,
        0.6,
        5,
        1.2,
        center + (opening.handing === 'right' ? -1 : 1) * (panelWidth / 2 - 3),
        36,
        depth,
        metal,
      );
    }
  }

  // Center jambs and leaves within the wall, spanning both finished faces.
  for (const part of group.children)
    part.position.z += ((depth.min + depth.max) / 2) * inch;
  placeOnWall(group, opening.wall, opening.offset + w / 2, room);
  group.userData.id = opening.id;
  group.userData.photoOpening = {opening, room};
  return group;
}
