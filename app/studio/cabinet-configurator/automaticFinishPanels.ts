import {standardFrontSurface} from './cabinetFrontPlane';
import {fitDefinition} from './custom-unit/designConfigurations';
import {customUnitLayoutParts} from './custom-unit/layoutParts';
import {roomFrontParts} from './custom-unit/frontLayout';
import {cabinetCompositionEnvelope} from './cabinetEnvelope';
import type {CabinetPart} from './custom-unit/model';
import {wallToFloor, type Room, type RoomElement} from './model';
import {roomSegments} from './roomOutline';
import {wallFootprint} from './wallDimensions';
import {DEFAULT_PANEL_THICKNESS} from './roomPanels';

export type AutoPanel = RoomElement & {
  autoPanel: {
    ownerId: string;
    surface: 'left' | 'right' | 'back';
    x: number;
    z: number;
    width: number;
    depth: number;
    bottom: number;
  };
};
export const isAutoPanel = (item: RoomElement): item is AutoPanel =>
  'autoPanel' in item && Boolean(item.autoPanel);
type Point = {x: number; z: number};
type Rect = {a: number; b: number; low: number; high: number};
const EPS = 0.001;
/** Direct contact allows only numerical/installation clearance, not a placement snap distance. */
export const AUTO_PANEL_CONTACT = 0.02;
function subtract(source: Rect, cover: Rect): Rect[] {
  const a = Math.max(source.a, cover.a),
    b = Math.min(source.b, cover.b);
  const low = Math.max(source.low, cover.low),
    high = Math.min(source.high, cover.high);
  if (b - a <= EPS || high - low <= EPS) return [source];
  return [
    {a: source.a, b: a, low: source.low, high: source.high},
    {a: b, b: source.b, low: source.low, high: source.high},
    {a, b, low: source.low, high: low},
    {a, b, low: high, high: source.high},
  ].filter((r) => r.b - r.a > EPS && r.high - r.low > EPS);
}
function clip(points: Point[], axis: 'x' | 'z', value: number, above: boolean) {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      q = points[(i + 1) % points.length];
    const inside = (r: Point) => (above ? r[axis] >= value : r[axis] <= value);
    if (inside(p)) out.push(p);
    if (inside(p) !== inside(q)) {
      const t = (value - p[axis]) / (q[axis] - p[axis]);
      out.push({x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z)});
    }
  }
  return out;
}
function footprints(item: RoomElement, room: Room): Point[][] {
  const p = wallToFloor(item, room),
    angle = (p.rotation * Math.PI) / 180;
  const w = item.width / 2,
    d = item.depth / 2;
  const arm = Math.min(24, (item.width * 2) / 3, (item.depth * 2) / 3);
  const outlines =
    !item.customCabinet && item.configuration === 'corner'
      ? [
          [
            [-w, -d],
            [w, -d],
            [w, -d + arm],
            [-w, -d + arm],
          ],
          [
            [-w, -d + arm],
            [-w + arm, -d + arm],
            [-w + arm, d],
            [-w, d],
          ],
        ]
      : [
          [
            [-w, -d],
            [w, -d],
            [w, d],
            [-w, d],
          ],
        ];
  return outlines.map((outline) =>
    outline.map(([x, z]) => ({
      x: p.x + x * Math.cos(angle) - z * Math.sin(angle),
      z: p.z + x * Math.sin(angle) + z * Math.cos(angle),
    })),
  );
}
/** Derived finish stock is never saved as independently editable room elements.
 * A shared exposure calculation feeds plan, scene, elevations, pricing and export.
 * Partial contact leaves rectangular exposed patches at the original elevations. */
export function automaticFinishPanels(
  elements: RoomElement[],
  room: Room,
): AutoPanel[] {
  if (!room.useMapleInternals) return [];
  const original = elements.filter((e) => !isAutoPanel(e));
  const blockers = original.filter(
    (e) =>
      ['base', 'tall', 'wall-cabinet', 'appliance', 'panel'].includes(e.kind) &&
      e.storage?.type !== 'floating-shelves',
  );
  const panels: AutoPanel[] = [];
  for (const owner of original) {
    if (
      !['base', 'tall', 'wall-cabinet'].includes(owner.kind) ||
      owner.disableAutoPanels ||
      owner.storage?.type === 'floating-shelves'
    )
      continue;
    // Framed panels end at the carcass: widened outer stiles cover their edges.
    // Frameless panels reach the actual closed front, excluding handles.
    let frontExtension = 0;
    if ((room.overlay ?? 'full-overlay') === 'full-overlay') {
      if (owner.customCabinet) {
        const unit = fitDefinition(
          owner.customCabinet.definition,
          cabinetCompositionEnvelope(owner, room),
        );
        const fronts = roomFrontParts(
          {...unit, parts: customUnitLayoutParts(unit) as CabinetPart[]},
          'full-overlay',
        ).filter(
          (p) =>
            (p.kind === 'door' || p.kind === 'drawer') &&
            p.z <= 0 &&
            p.door?.mechanism !== 'tambour' &&
            p.drawerArray?.face !== 'internal',
        );
        frontExtension = Math.max(0, ...fronts.map((p) => -p.z));
      } else if (
        !owner.storage ||
        owner.storage.doors ||
        owner.storage.drawers
      ) {
        frontExtension = standardFrontSurface(0, 'full-overlay');
      }
    }
    const p = wallToFloor(owner, room),
      angle = (p.rotation * Math.PI) / 180;
    const local = (point: Point) => ({
      x: (point.x - p.x) * Math.cos(angle) + (point.z - p.z) * Math.sin(angle),
      z: -(point.x - p.x) * Math.sin(angle) + (point.z - p.z) * Math.cos(angle),
    });
    const bottom = owner.placement.elevation ?? 0;
    const covers = blockers
      .filter((e) => e.id !== owner.id)
      .flatMap((e) =>
        footprints(e, room).map((points) => ({
          points: points.map(local),
          low: (e.placement.elevation ?? 0) - bottom,
          high: (e.placement.elevation ?? 0) + e.height - bottom,
        })),
      );
    covers.push(
      ...roomSegments(room).map((w) => ({
        points: wallFootprint(room, w.id).map(local),
        low: -bottom,
        high: room.height - bottom,
      })),
    );
    for (const surface of ['left', 'right', 'back'] as const) {
      const side = surface !== 'back',
        axis = side ? 'x' : 'z',
        along = side ? 'z' : 'x';
      const sign = surface === 'right' ? 1 : -1,
        boundary = (sign * (side ? owner.width : owner.depth)) / 2;
      const end =
        surface === 'right' &&
        !owner.customCabinet &&
        owner.configuration === 'corner'
          ? -owner.depth / 2 +
            Math.min(24, (owner.width * 2) / 3, (owner.depth * 2) / 3)
          : owner.depth / 2;
      let exposed: Rect[] = [
        {
          a: side ? -owner.depth / 2 : -owner.width / 2,
          b: side ? end : owner.width / 2,
          low: 0,
          high: owner.height,
        },
      ];
      for (const cover of covers) {
        const range =
          sign > 0
            ? [boundary - EPS, boundary + AUTO_PANEL_CONTACT]
            : [boundary - AUTO_PANEL_CONTACT, boundary + EPS];
        const contact = clip(
          clip(cover.points, axis, range[0], true),
          axis,
          range[1],
          false,
        );
        if (!contact.length) continue;
        const values = contact.map((q) => q[along]);
        const rect = {
          a: Math.min(...values),
          b: Math.max(...values),
          low: cover.low,
          high: cover.high,
        };
        exposed = exposed.flatMap((r) => subtract(r, rect));
      }
      exposed.forEach((r, index) => {
        // Extend only patches that reach the front. Subtract blockers first so
        // neighboring cabinets never leave a spurious front-only panel strip.
        const front =
          side &&
          Math.abs(r.b - end) < EPS &&
          !(
            owner.configuration === 'corner' &&
            !owner.customCabinet &&
            surface === 'left'
          );
        const b = r.b + (front ? frontExtension : 0);
        const t = DEFAULT_PANEL_THICKNESS,
          span = b - r.a;
        const x = side ? boundary + (sign * t) / 2 : (r.a + r.b) / 2;
        const z = side ? (r.a + b) / 2 : boundary - t / 2;
        const rotation = p.rotation + (side ? 0 : 90);
        panels.push({
          id: `auto-panel:${owner.id}:${surface}:${index}`,
          kind: 'panel',
          face: 'slab',
          width: t,
          depth: span,
          height: r.high - r.low,
          material: owner.material,
          materialId: owner.materialId,
          materialDefinition: owner.materialDefinition,
          paintColor: owner.paintColor,
          flatGrain: owner.flatGrain,
          islandId: owner.islandId,
          placement: {
            mode: 'floor',
            x: p.x + x * Math.cos(angle) - z * Math.sin(angle),
            z: p.z + x * Math.sin(angle) + z * Math.cos(angle),
            rotation,
            elevation: bottom + r.low,
          },
          autoPanel: {
            ownerId: owner.id,
            surface,
            x,
            z,
            width: side ? t : span,
            depth: side ? span : t,
            bottom: r.low,
          },
        });
      });
    }
  }
  return panels;
}
export function withAutomaticFinishPanels<
  T extends {elements: RoomElement[]; room: Room},
>(study: T): T {
  const elements = study.elements.filter((e) => !isAutoPanel(e));
  return {
    ...study,
    elements: [...elements, ...automaticFinishPanels(elements, study.room)],
  };
}
