import {wallToFloor, type RoomElement, type Room} from '../model';
import {cabinetToeKick, cabinetCompositionEnvelope} from '../cabinetEnvelope';
import {storageLayout} from '../openStorage';
import {shapedStock} from './mesh';
import {angledHousing} from './boolean';
import {doorPreview} from '../custom-unit/doorGeometry';
import * as THREE from 'three';
import {fitDefinition} from '../custom-unit/designConfigurations';
import {customUnitLayoutParts} from '../custom-unit/layoutParts';
import {roomFrontParts, frontOpening} from '../custom-unit/frontLayout';
import type {CabinetPart} from '../custom-unit/model';
import {
  FabricationError,
  type Vec3,
  type FabricationManifest,
  type FabricationPart,
} from './model';
import type {ConstructionProfile} from './profile';

type Design = {room: Room; elements: RoomElement[]};
const EPS = 0.001;
const axis = (size: Vec3) => size.indexOf(Math.min(...size)) as 0 | 1 | 2;
const intersect = (a: FabricationPart, b: FabricationPart) => {
  const origin = a.origin.map((v, i) => Math.max(v, b.origin[i])) as Vec3;
  const size = a.size.map(
    (v, i) => Math.min(a.origin[i] + v, b.origin[i] + b.size[i]) - origin[i],
  ) as Vec3;
  return size.every((v) => v > EPS) ? {origin, size} : null;
};
/** Join horizontal/back panels into vertical receiving boards. Stock length
 * includes the insertion; receiving pockets remove the shared physical volume. */
function dadoPanels(parts: FabricationPart[], depth: number) {
  for (const donor of parts) {
    if (axis(donor.size) === 0) continue;
    for (const receiver of parts) {
      if (axis(receiver.size) !== 0) continue;
      const start = receiver.origin[0],
        end = start + receiver.size[0];
      const donorStart = donor.origin[0],
        donorEnd = donorStart + donor.size[0];
      const overlapOtherAxes = [1, 2].every(
        (i) =>
          donor.origin[i] < receiver.origin[i] + receiver.size[i] - EPS &&
          donor.origin[i] + donor.size[i] > receiver.origin[i] + EPS,
      );
      if (!overlapOtherAxes) continue;
      const joint = Math.min(depth, receiver.size[0] / 2);
      if (Math.abs(donorEnd - start) < EPS || Math.abs(donorEnd - end) < EPS)
        donor.size[0] = start + joint - donorStart;
      else if (
        Math.abs(donorStart - end) < EPS ||
        Math.abs(donorStart - start) < EPS
      ) {
        donor.origin[0] = end - joint;
        donor.size[0] = donorEnd - donor.origin[0];
      } else continue;
      const overlap = intersect(donor, receiver);
      if (overlap)
        receiver.pockets.push({
          origin: overlap.origin.map((v, i) => v - receiver.origin[i]) as Vec3,
          size: overlap.size,
          operation: 'dado',
        });
    }
  }
}

export function resolveFabrication(
  design: Design,
  source: FabricationManifest['design'],
  profile: ConstructionProfile,
): FabricationManifest {
  const manifest: FabricationManifest = {
    schema: 'from-trees-fabrication',
    version: 2,
    units: 'in',
    design: source,
    profile,
    assemblies: [],
    parts: [],
    assumptions: [
      'From Trees first-pass construction: dado/rabbet carcasses; no butt joints. Review before cutting.',
      'Standard carcasses have two top stretchers and two back nailers, not a full top. Backs sit inside the nailers.',
      'Drawer boxes use rabbet joints for now; dovetails, Movento notches/holes, joinery fit tolerances and toolpaths are not generated.',
      'Drawer deductions are configurable estimating defaults, not a certified slide drilling specification.',
      'Each rectangular stock component has local grain/width/thickness axes. Dimensions include insertion into joints.',
      'Toe-kick faces are separate clip-on stock components below floor cabinets; clips and feet are excluded.',
      'Custom compositions retain their explicit board thicknesses and full tops. Touching horizontal/back boards receive dados into vertical boards.',
      'Shaker rails have stub tenons; panels fit grooves. Decorative slat routing is represented as stock, not machining.',
    ],
    excluded: [
      'Room surfaces, countertops, fixtures, appliances, pulls, hinges, slides, Axilo feet and plumbing. Hardware requires separate supplier specifications.',
    ],
  };
  const issues: string[] = [];
  for (const item of design.elements) {
    if (item.kind === 'appliance' || item.kind === 'fixture') continue;
    const envelope = cabinetCompositionEnvelope(item, design.room);
    const toe = cabinetToeKick(item, design.room);
    const transform = wallToFloor(item, design.room);
    const assembly = {
      id: item.id,
      name:
        item.customCabinet?.definition.name ??
        `${item.kind} ${item.width} × ${item.height}`,
      origin: [
        transform.x,
        -transform.z,
        (item.placement.elevation ?? 0) + toe.height,
      ] as Vec3,
      rotation: -transform.rotation,
    };
    manifest.assemblies.push(assembly);
    let serial = 0;
    const local: FabricationPart[] = [];
    const shapeSources = new Map<FabricationPart, CabinetPart>();
    const material =
      item.materialDefinition?.label ??
      item.material ??
      'Front material — verify';
    const add = (
      name: string,
      origin: Vec3,
      size: Vec3,
      stockType: FabricationPart['stockType'] = 'sheet',
      stockMaterial = 'Prefinished maple / Baltic-birch plywood',
      grainAxis?: 0 | 1 | 2,
    ) => {
      const thickness = axis(size);
      const grain = grainAxis ?? (size.indexOf(Math.max(...size)) as 0 | 1 | 2);
      const part: FabricationPart = {
        id: `${item.id}:part:${serial++}`,
        assemblyId: item.id,
        name,
        origin: [...origin],
        size: [...size],
        grainAxis:
          grain === thickness ? (((thickness + 1) % 3) as 0 | 1 | 2) : grain,
        material: stockMaterial,
        stockType,
        pockets: [],
      };
      local.push(part);
      return part;
    };
    const pocket = (
      part: FabricationPart,
      origin: Vec3,
      size: Vec3,
      operation: 'dado' | 'rabbet' | 'groove',
    ) => part.pockets.push({origin, size, operation});
    const drawerBox = (
      front: CabinetPart,
      opening: {x: number; y: number; width: number; height: number},
    ) => {
      const t = profile.drawerThickness,
        j = profile.drawerRabbetDepth,
        g = profile.drawerGrooveDepth;
      const w = opening.width - profile.drawerWidthDeduction;
      const x = opening.x + (opening.width - w) / 2,
        y = Math.max(
          front.y + Math.min(0.5, front.height / 8),
          opening.y + Math.min(0.5, opening.height / 8),
          profile.carcassThickness + 0.125,
        ),
        z = Math.max(0, front.z + front.depth);
      const d = Math.min(
        envelope.depth - profile.drawerDepthDeduction,
        envelope.depth - profile.carcassThickness - profile.backThickness - z,
      );
      const h = Math.min(
        profile.drawerSideHeight,
        front.height - Math.min(1, front.height / 4),
        opening.y + opening.height - y - Math.min(0.25, opening.height / 8),
        envelope.height - profile.carcassThickness - y - 0.25,
      );
      const b = Math.min(profile.drawerBottomThickness, h / 3);
      const bottomInset = Math.min(
        profile.drawerBottomInset,
        Math.max(0, h - b - Math.min(0.125, h / 8)),
      );
      if (h <= 0 || w <= 2 * t || d <= 2 * t) {
        issues.push(`${assembly.name}: drawer dimensions are not positive.`);
        return;
      }
      if (b !== profile.drawerBottomThickness)
        manifest.assumptions.push(
          `${assembly.name}: short drawer bottom thickness reduced to ${b.toFixed(3)} inches to fit the designed opening.`,
        );
      for (const right of [false, true]) {
        const side = add(
          'Drawer side',
          [x + (right ? w - t : 0), z, y],
          [t, d, h],
          'solid',
          'Maple drawer stock',
          1,
        );
        for (const rear of [false, true])
          pocket(
            side,
            [right ? 0 : t - j, rear ? d - t : 0, 0],
            [j, t, h],
            'rabbet',
          );
        pocket(side, [right ? 0 : t - g, 0, bottomInset], [g, d, b], 'groove');
      }
      for (const rear of [false, true]) {
        const end = add(
          rear ? 'Drawer back' : 'Drawer box front',
          [x + t - j, z + (rear ? d - t : 0), y],
          [w - 2 * t + 2 * j, t, h],
          'solid',
          'Maple drawer stock',
          0,
        );
        pocket(
          end,
          [0, rear ? 0 : t - g, bottomInset],
          [w - 2 * t + 2 * j, g, b],
          'groove',
        );
      }
      add(
        'Drawer bottom',
        [x + t - g, z + t - g, y + bottomInset],
        [w - 2 * t + 2 * g, d - 2 * t + 2 * g, b],
        'sheet',
        'Maple veneer drawer-bottom plywood',
        0,
      );
    };
    const front = (
      part: CabinetPart,
      makeBox: boolean,
      opening?: {x: number; y: number; width: number; height: number},
    ) => {
      if (part.door?.mechanism === 'tambour') {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(part.width, part.height, part.depth),
          new THREE.MeshStandardMaterial(),
        );
        const rig = doorPreview(mesh, part, 0, envelope.depth);
        rig.updateMatrixWorld(true);
        for (const slat of rig.children) {
          if (!(slat instanceof THREE.Mesh)) continue;
          const geometry = slat.geometry;
          geometry.computeBoundingBox();
          const bounds = geometry.boundingBox!;
          const min = bounds.min.clone().applyMatrix4(slat.matrixWorld);
          const size = bounds.getSize(new THREE.Vector3());
          const board = add(
            'Tambour slat',
            [
              part.x + part.width / 2 + min.x,
              part.z + part.depth / 2 + min.z,
              part.y + part.height / 2 + min.y,
            ],
            [size.x, size.z, size.y],
            'solid',
            material,
          );
          const direction = (v: THREE.Vector3) => {
            v.transformDirection(slat.matrixWorld);
            return [v.x, v.z, v.y] as Vec3;
          };
          board.basis = [
            direction(new THREE.Vector3(1, 0, 0)),
            direction(new THREE.Vector3(0, 0, 1)),
            direction(new THREE.Vector3(0, 1, 0)),
          ];
          geometry.dispose();
        }
        return;
      }
      const style = part.faceStyle ?? item.face;
      const x = part.x,
        z = part.z,
        y = part.y,
        w = part.width,
        h = part.height,
        t = part.depth;
      const label = part.kind === 'drawer' ? 'Drawer front' : 'Door';
      if (['shaker', 'shaker-glass', 'inset-shaker'].includes(style)) {
        const r = Math.min(profile.shakerRailWidth, w / 5, h / 4),
          g = Math.min(profile.shakerGrooveDepth, r / 2),
          p = Math.min(profile.shakerPanelThickness, t / 3);
        for (const right of [false, true]) {
          const stile = add(
            `${label} stile`,
            [x + (right ? w - r : 0), z, y],
            [r, t, h],
            'solid',
            material,
            2,
          );
          pocket(
            stile,
            [right ? 0 : r - g, (t - p) / 2, 0],
            [g, p, h],
            'groove',
          );
        }
        for (const top of [false, true]) {
          const rail = add(
            `${label} rail`,
            [x + r - g, z, y + (top ? h - r : 0)],
            [w - 2 * r + 2 * g, t, r],
            'solid',
            material,
            0,
          );
          // Stub-tenon shoulders leave a panel-thickness tongue at each rail end.
          for (const right of [false, true])
            for (const rear of [false, true])
              pocket(
                rail,
                [right ? rail.size[0] - g : 0, rear ? (t + p) / 2 : 0, 0],
                [g, (t - p) / 2, r],
                'rabbet',
              );
          pocket(
            rail,
            [0, (t - p) / 2, top ? 0 : r - g],
            [w - 2 * r + 2 * g, p, g],
            'groove',
          );
        }
        add(
          `${label} panel`,
          [x + r - g, z + (t - p) / 2, y + r - g],
          [w - 2 * r + 2 * g, p, h - 2 * r + 2 * g],
          'sheet',
          style === 'shaker-glass' ? 'Glass — verify thickness' : material,
          2,
        );
      } else
        add(
          label,
          [x, z, y],
          [w, t, h],
          'sheet',
          material,
          part.materialApplication?.grainAxis === 'x' ? 0 : 2,
        );
      if (makeBox && opening) drawerBox(part, opening);
    };
    if (
      !item.customCabinet &&
      item.kind === 'base' &&
      item.configuration === 'corner'
    ) {
      const arm = Math.min(24, (item.width * 2) / 3, (item.depth * 2) / 3);
      for (const [index, width, depth] of [
        [0, item.width, arm],
        [1, item.depth - arm, arm],
      ]) {
        const child = resolveFabrication(
          {
            room: design.room,
            elements: [
              {
                ...item,
                id: `${item.id}-arm-${index}`,
                width,
                depth,
                configuration: 'single-door',
                placement: {mode: 'floor', x: 0, z: 0, rotation: 0},
              },
            ],
          },
          source,
          profile,
        );
        for (const part of child.parts) {
          part.assemblyId = item.id;
          if (index === 0) part.origin[1] += item.depth / 2 - arm / 2;
          else {
            const [x, z, y] = part.origin;
            part.origin = [-z - item.width / 2 + arm / 2, x - arm / 2, y];
            part.basis = [
              [0, 1, 0],
              [-1, 0, 0],
              [0, 0, 1],
            ];
          }
          manifest.parts.push(part);
        }
      }
      continue;
    }
    if (!item.customCabinet && item.storage?.type === 'floating-shelves') {
      const count = Math.max(1, item.storage.shelves),
        depth = Math.max(6, item.depth);
      for (let i = 0; i < count; i++) {
        const y =
          count === 1 ? item.height / 2 : (i * item.height) / (count - 1);
        const board = add(
          'Floating shelf',
          [0, 0, y - 0.75],
          [item.width, depth, 1.5],
          'solid',
          material,
          0,
        );
        const width = Math.min(item.width, Math.max(4, item.width - 8));
        const inset = (item.width - width) / 2;
        add(
          'Floating shelf cleat',
          [inset, depth - 2, y - 0.5],
          [width, 2, 1],
          'solid',
          material,
          0,
        );
        pocket(board, [inset, depth - 2, 0.25], [width, 2, 1], 'groove');
      }
    } else if (item.customCabinet) {
      const definition = fitDefinition(item.customCabinet.definition, envelope);
      const layout = customUnitLayoutParts(definition) as CabinetPart[];
      const boards: FabricationPart[] = [];
      for (const part of roomFrontParts(
        {...definition, parts: layout},
        design.room.overlay ?? 'full-overlay',
      )) {
        const start = local.length;
        if (part.kind === 'door' || part.kind === 'drawer') {
          const original = layout.find(
            (p) => p.id === part.id || p.id === part.arrayId,
          );
          const opening =
            original?.drawerArray?.opening ??
            (original
              ? frontOpening({...definition, parts: layout}, original)
              : undefined);
          front(part, part.kind === 'drawer', opening);
        } else {
          const board = add(
            part.name ?? part.kind,
            [part.x, part.z, part.y],
            [part.width, part.depth, part.height],
            part.kind === 'rod' ? 'hardware' : 'sheet',
            part.kind === 'rod' ? 'Metal rod' : material,
            part.materialApplication?.grainAxis === 'x'
              ? 0
              : part.materialApplication?.grainAxis === 'z'
                ? 1
                : undefined,
          );
          if (part.kind !== 'rod') boards.push(board);
        }
        for (const board of local.slice(start)) shapeSources.set(board, part);
      }
      dadoPanels(boards, profile.dadoDepth);
      for (const [board, part] of shapeSources) {
        if (board.basis) continue;
        if (
          definition.curve ||
          definition.profile ||
          part.edges ||
          (part.shape && part.shape !== 'rectangular')
        )
          shapedStock(board, definition, part);
      }
    } else {
      const w = envelope.width,
        h = envelope.height,
        d = envelope.depth,
        t = profile.carcassThickness,
        j = profile.dadoDepth,
        b = profile.backThickness,
        g = profile.backGrooveDepth,
        r = profile.stretcherWidth;
      const inner = w - 2 * t,
        insideDepth = d - t - b;
      const sides = [
        add('Left side', [0, 0, 0], [t, d, h]),
        add('Right side', [w - t, 0, 0], [t, d, h]),
      ];
      const horizontal = (name: string, y: number, depth: number, z = 0) => {
        add(name, [t - j, z, y], [inner + 2 * j, depth, t]);
        for (let i = 0; i < 2; i++)
          pocket(
            sides[i],
            [i ? 0 : t - j, z, y],
            [j, depth, t],
            y === 0 ? 'rabbet' : 'dado',
          );
      };
      horizontal('Bottom', 0, insideDepth);
      horizontal('Front top stretcher', h - t, r);
      horizontal('Rear top stretcher', h - t, r, insideDepth - r);
      for (const top of [false, true]) {
        const y = top ? h - r : t;
        add(
          top ? 'Upper back nailer' : 'Lower back nailer',
          [t - j, d - t, y],
          [inner + 2 * j, t, r],
        );
        for (let i = 0; i < 2; i++)
          pocket(sides[i], [i ? 0 : t - j, d - t, y], [j, t, r], 'dado');
      }
      if (!item.storage || item.storage.back) {
        add(
          'Back',
          [t - g, insideDepth, t],
          [inner + 2 * g, b, h - t],
          'sheet',
          'Back plywood',
          2,
        );
        for (let i = 0; i < 2; i++)
          pocket(
            sides[i],
            [i ? 0 : t - g, insideDepth, 0],
            [g, b, h],
            'groove',
          );
      }
      const fronts: {part: CabinetPart; box: boolean}[] = [];
      const addFront = (
        kind: 'door' | 'drawer',
        width: number,
        height: number,
        x: number,
        y: number,
        box = true,
      ) =>
        fronts.push({
          part: {
            id: `front-${fronts.length}`,
            kind,
            x,
            y,
            z: -t,
            width,
            height,
            depth: t,
          },
          box,
        });
      const paired = (low: number, height: number) => {
        const count = w > 30 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const width = count === 1 ? w - 0.25 : w / 2 - 0.1875;
          addFront(
            'door',
            width,
            height,
            ((i + 0.5) * w) / count - width / 2,
            low,
          );
        }
      };
      const usable = h - 0.25;
      if (item.storage) {
        const layout = storageLayout(item, design.room);
        if (layout.divider) {
          const board = add(
            'Storage divider',
            [t + layout.divider - 0.375, 0, t],
            [t, insideDepth, h - 2 * t],
          );
          pocket(
            local.find((p) => p.name === 'Bottom')!,
            [layout.divider - 0.375 + j, 0, t - j],
            [t, insideDepth, j],
            'dado',
          );
          board.origin[2] -= j;
          board.size[2] += j;
        }
        const angledParts: FabricationPart[] = [];
        for (const y of layout.shelfYs) {
          if (item.storage.angled) {
            const angle = (12 * Math.PI) / 180,
              c = Math.cos(angle),
              s = Math.sin(angle),
              depth = insideDepth - 0.75;
            const shelf = add(
              'Angled shelf',
              [
                t - j,
                depth / 2 - (depth * c) / 2 + (t * s) / 2,
                y - toe.height - (depth * s) / 2 - (t * c) / 2,
              ],
              [inner + 2 * j, depth, t],
            );
            shelf.basis = [
              [1, 0, 0],
              [0, c, s],
              [0, -s, c],
            ];
            angledParts.push(shelf);
            const lip = add(
              'Shoe retaining lip',
              [t - j, 0, 0],
              [inner + 2 * j, t, 1.25],
              'solid',
              material,
              0,
            );
            lip.basis = shelf.basis;
            lip.origin = [
              shelf.origin[0],
              shelf.origin[1] - t * s,
              shelf.origin[2] + t * c,
            ];
            pocket(shelf, [0, 0, t - j], [inner + 2 * j, t, j], 'rabbet');
            // Insert the lip into the shelf's front rabbet.
            lip.origin[1] += j * s;
            lip.origin[2] -= j * c;
            angledParts.push(lip);
          } else
            horizontal('Shelf', y - toe.height - t / 2, insideDepth - 0.75);
        }
        if (angledParts.length)
          for (const side of sides) angledHousing(side, angledParts);
        // Combination shelves stop at the central divider.
        if (layout.divider)
          for (const shelf of local.filter((p) => p.name === 'Shelf')) {
            shelf.size[0] = layout.shelfWidth + 2 * j;
            const divider = local.find((p) => p.name === 'Storage divider')!;
            pocket(
              divider,
              [0, 0, shelf.origin[2] - divider.origin[2]],
              [j, shelf.size[1], t],
              'dado',
            );
            const rightCut = sides[1].pockets.find(
              (p) =>
                Math.abs(p.origin[2] - shelf.origin[2]) < EPS &&
                p.size[2] === t,
            );
            if (rightCut)
              sides[1].pockets.splice(sides[1].pockets.indexOf(rightCut), 1);
          }
        for (const y of layout.rods)
          add(
            'Hanging rod',
            [w / 2 + layout.rodX - layout.rodWidth / 2, d / 2, y - toe.height],
            [layout.rodWidth, 1.25, 1.25],
            'hardware',
            'Metal rod',
            0,
          );
        for (let i = 0; i < layout.drawers; i++)
          addFront(
            'drawer',
            w - 0.25,
            layout.drawerZone / layout.drawers - 0.125,
            0.125,
            layout.low - toe.height + (i * layout.drawerZone) / layout.drawers,
          );
        if (item.storage.doors)
          paired(
            layout.low - toe.height + layout.drawerZone,
            layout.high - layout.low - layout.drawerZone - 0.125,
          );
      } else if (item.configuration === 'three-drawer') {
        let y = 0.125;
        for (const height of [usable * 0.4, usable * 0.4, usable * 0.2]) {
          addFront('drawer', w - 0.25, height - 0.125, 0.125, y + 0.0625);
          y += height;
        }
      } else if (
        item.configuration === 'door-drawer' ||
        item.configuration === 'sink'
      ) {
        const height = Math.min(6, usable / 3);
        addFront(
          'drawer',
          w - 0.25,
          height - 0.125,
          0.125,
          h - height - 0.0625,
          item.configuration !== 'sink',
        );
        paired(0.125, usable - height - 0.125);
      } else if (item.configuration === 'farmhouse-sink') {
        const apron = Math.min(10, usable * 0.35);
        // The sink apron is plumbing, not a wood door/front.
        const count = 2,
          height = usable - apron - 0.125,
          width = w / 2 - 0.1875;
        for (let i = 0; i < count; i++)
          addFront(
            'door',
            width,
            height,
            ((i + 0.5) * w) / count - width / 2,
            0.125,
          );
      } else if (item.configuration === 'microwave-drawer') {
        const applianceHeight = Math.min(16, usable * 0.6);
        const drawerHeight = usable - applianceHeight - 0.25;
        addFront('drawer', w - 0.25, drawerHeight - 0.125, 0.125, 0.125);
        horizontal('Microwave support shelf', drawerHeight, insideDepth);
      } else if (
        item.tallConfiguration &&
        item.tallConfiguration !== 'standard'
      ) {
        const coffee = item.tallConfiguration === 'coffee-maker';
        const count = item.tallConfiguration === 'two-oven' ? 2 : 1;
        const applianceHeight = Math.min(
          coffee ? 18 : 28,
          (usable * 0.64) / count,
        );
        const drawerHeight = coffee
          ? Math.min(36 - toe.height, usable * 0.5)
          : Math.min(count === 2 ? 12 : 24, usable * 0.28);
        for (let i = 0; i < 2; i++)
          addFront(
            'drawer',
            w - 0.25,
            drawerHeight / 2 - 0.125,
            0.125,
            (i * drawerHeight) / 2 + 0.0625,
          );
        for (let i = 0; i <= count; i++)
          horizontal(
            'Appliance support shelf',
            drawerHeight + i * applianceHeight,
            insideDepth,
          );
        const low = drawerHeight + count * applianceHeight;
        paired(low + 0.125, h - low - 0.25);
      } else if (item.configuration === 'pullout')
        addFront('drawer', w - 0.25, usable, 0.125, 0.125);
      else paired(0.125, usable);
      for (const entry of fronts) {
        const part = {...entry.part};
        let opening = {x: t, y: part.y, width: inner, height: part.height};
        if (design.room.overlay && design.room.overlay !== 'full-overlay') {
          const f = Math.min(1.5, part.width / 6),
            rail = Math.min(1.5, part.height / 6);
          const z = -t / 2,
            joint = Math.min(j, f / 2);
          const frame: FabricationPart[] = [];
          for (const right of [false, true]) {
            const stile = add(
              'Face frame stile',
              [part.x + (right ? part.width - f : 0), z, part.y],
              [f, t, part.height],
              'solid',
              material,
              2,
            );
            for (const top of [false, true])
              pocket(
                stile,
                [right ? 0 : f - joint, 0, top ? part.height - rail : 0],
                [joint, t, rail],
                'rabbet',
              );
            frame.push(stile);
          }
          for (const top of [false, true])
            frame.push(
              add(
                'Face frame rail',
                [
                  part.x + f - joint,
                  z,
                  part.y + (top ? part.height - rail : 0),
                ],
                [part.width - 2 * f + 2 * joint, t, rail],
                'solid',
                material,
                0,
              ),
            );
          // Back rabbets receive the projecting carcass edges, retaining a
          // half-thickness face rather than overlapping or butt-jointing them.
          for (const board of frame)
            for (const carcass of local.filter(
              (p) => !frame.includes(p) && p.stockType === 'sheet',
            )) {
              const shared = intersect(board, carcass);
              if (shared)
                pocket(
                  board,
                  shared.origin.map((v, a) => v - board.origin[a]) as Vec3,
                  shared.size,
                  'rabbet',
                );
            }
          opening = {
            x: part.x + f,
            y: part.y + rail,
            width: part.width - 2 * f,
            height: part.height - 2 * rail,
          };
          const inset = design.room.overlay === 'inset';
          const horizontalInset = ((inset ? 2 : 1) * f + 0.25) / 2;
          const verticalInset = ((inset ? 2 : 1) * rail + 0.25) / 2;
          part.x += horizontalInset;
          part.width -= 2 * horizontalInset;
          part.y += verticalInset;
          part.height -= 2 * verticalInset;
          part.z = inset ? z : z - t;
        }
        front(part, part.kind === 'drawer' && entry.box, opening);
      }
    }
    if (toe.height > 0)
      add(
        'Toe-kick face',
        [0, toe.setback, -toe.height],
        [item.width, profile.carcassThickness, toe.height],
        'sheet',
        material,
        0,
      );
    for (const part of local) {
      if (
        !part.size.every((v) => Number.isFinite(v) && v > EPS) ||
        !part.origin.every(Number.isFinite)
      )
        issues.push(`${assembly.name}: ${part.name} has invalid dimensions.`);
      if (
        part.pockets.some(
          (p) =>
            !p.size.every((v) => Number.isFinite(v) && v > 0) ||
            p.origin.some(
              (v, i) => v < -EPS || v + p.size[i] > part.size[i] + EPS,
            ),
        )
      )
        issues.push(
          `${assembly.name}: ${part.name} has a joint outside its stock.`,
        );
      // Model axes: X right, Y toward rear, Z up. SketchUp room Y is -designer Z.
      part.origin[0] -= item.width / 2;
      part.origin[1] -= item.depth / 2;
      manifest.parts.push(part);
    }
  }
  if (!manifest.parts.length)
    issues.push('This design contains no cabinet parts.');

  if (issues.length) throw new FabricationError([...new Set(issues)]);
  return manifest;
}
