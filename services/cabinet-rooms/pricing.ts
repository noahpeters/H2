import {
  automaticFinishPanels,
  isAutoPanel,
} from '../../app/studio/cabinet-configurator/automaticFinishPanels';
import {
  combinationProfiles,
  isCombinationFace,
  resolvePartFaces,
} from '../../app/studio/cabinet-configurator/combinationFaces';
import {
  cabinetInteriorSelection,
  exposedCabinetInterior,
  internalCustomPart,
} from '../../app/studio/cabinet-configurator/cabinetInternals';
import {
  cabinetToeKick,
  cabinetCompositionEnvelope,
} from '../../app/studio/cabinet-configurator/cabinetEnvelope';
import {fitDefinition} from '../../app/studio/cabinet-configurator/custom-unit/designConfigurations';
import {customUnitLayoutParts} from '../../app/studio/cabinet-configurator/custom-unit/layoutParts';
import {roomFrontParts} from '../../app/studio/cabinet-configurator/custom-unit/frontLayout';
import type {Study} from '../../app/studio/cabinet-configurator/CabinetConfigurator';
import type {
  BaseConfiguration,
  ElementKind,
  RoomElement,
} from '../../app/studio/cabinet-configurator/model';
import {storageLayout} from '../../app/studio/cabinet-configurator/openStorage';
/** Owner-approved selling-price addition, not a cost input or margin multiplier. */
export const BEADED_FACE_SURCHARGE = 10;
export const BEADED_FLAT_SURCHARGE = 5;
export type Rates = Record<string, number | null>;
// A new room-object kind must declare its pricing scope before typecheck passes.
const ELEMENT_PRICING = {
  base: 'cabinet',
  'wall-cabinet': 'cabinet',
  tall: 'cabinet',
  panel: 'panel',
  appliance: 'appliance',
  fixture: 'excluded',
} satisfies Record<ElementKind, 'cabinet' | 'panel' | 'appliance' | 'excluded'>;

export class PricingError extends Error {
  constructor(
    public code: 'pricing_not_configured',
    public items: string[],
  ) {
    super(code);
  }
}
export const EXCLUSIONS = [
  'installation',
  'delivery',
  'tax',
  'field work',
  'countertops',
  'glass',
  'fixtures and appliance bodies (including sinks, range hoods, tubs, showers, toilets and mirrors)',
  'decorative pulls',
  'plumbing',
  'electrical work',
  'design fees',
  'unmodeled fillers, scribes and infill',
  'specialty pull-out and corner mechanisms',
];
export type ScheduleLine = {
  autoPanelOwnerId?: string;
  id: string;
  width: number;
  depth: number;
  height: number;
  material: string;
  interiorMaterial?: string;
  drawerMaterial?: string;
  carcassArea?: number;
  faceArea?: number;
  backArea?: number;
  boxUnits: number;
  feet: number;
  toeKickHeight?: number;
  finishUnits: number;
  drawers: number;
  beadedFaces?: number;
  beadedFlatFaces?: number;
  hinges: number;
  frontCoverage: number;
  endPanels: number;
  finishedBack: number;
  visibleBox: boolean;
  extraCarcass?: number;
  backSheetFactor?: number;
  rodFeet?: number;
};
export function projectSchedule(study: Study) {
  const lines: ScheduleLine[] = [];
  const assumptions = new Set<string>([
    'Budget estimate, not a final quote; dimensions and construction require shop review.',
    'Unspecified standard interior shelves are excluded. Standard box/drawer/finishing labor is used for all front styles; shaker and inset joinery need review.',
    'Visible fronts use sheet-area allowances, not a detailed rail-and-stile cut list.',
    'Four Axilo feet per base/tall cabinet; their default cost is covered by project miscellaneous materials.',
  ]);
  for (const e of [
    ...study.elements,
    ...automaticFinishPanels(study.elements, study.room),
  ]) {
    const panel =
      e.kind === 'appliance' &&
      ['refrigerator', 'dishwasher'].includes(e.applianceKind ?? '') &&
      ['shaker', 'slab', 'vertical-slat'].includes(
        e.applianceFront ?? 'stainless',
      );
    if (
      ELEMENT_PRICING[e.kind] === 'excluded' ||
      (e.kind === 'appliance' && !panel)
    )
      continue;
    const material = e.material ?? 'rift-white-oak';
    if (!e.material)
      assumptions.add(
        'Unspecified materials use rift-sawn white oak, matching the configurator default.',
      );
    if (e.kind === 'panel') {
      // Room panels store thickness in width and the visible span in depth.
      lines.push({
        id: e.id,
        autoPanelOwnerId: isAutoPanel(e) ? e.autoPanel.ownerId : undefined,
        width: e.width,
        depth: e.depth,
        height: e.height,
        material,
        carcassArea: 0,
        backArea: 0,
        faceArea: (e.depth * e.height) / 144,
        boxUnits: 0,
        feet: 0,
        finishUnits: 1,
        drawers: 0,
        hinges: 0,
        frontCoverage: 0,
        endPanels: 0,
        finishedBack: 0,
        visibleBox: true,
      });
      assumptions.add(
        'Standalone room panels use their full physical panel area and one finishing allowance; they have no cabinet box or door hardware.',
      );
      continue;
    }
    let drawers = 0,
      doors = e.width > 30 ? 2 : 1,
      frontCoverage = 1;
    const feet = e.kind === 'base' || e.kind === 'tall' ? 4 : 0;
    const toeKickHeight = cabinetToeKick(e, study.room).height;
    const h = e.height - toeKickHeight;
    if (e.kind === 'base') {
      const config = e.configuration ?? 'single-door';
      const drawerCounts = {
        'single-door': 0,
        'door-drawer': 1,
        'three-drawer': 3,
        pullout: 1,
        'microwave-drawer': 1,
        sink: 0,
        'farmhouse-sink': 0,
        corner: 0,
      } satisfies Record<BaseConfiguration, number>;
      drawers = drawerCounts[config] ?? 0;
      if (config === 'three-drawer') {
        drawers = 3;
        doors = 0;
      }
      if (config === 'pullout') {
        drawers = 1;
        doors = 0;
      }
      if (config === 'door-drawer') drawers = 1;
      if (config === 'microwave-drawer') {
        drawers = 1;
        doors = 0;
        frontCoverage = (h - Math.min(16, (h - 0.25) * 0.6)) / h;
      }
      if (config === 'corner') {
        doors = 2;
        assumptions.add(
          'Corner cabinets use their full rectangular envelope as a conservative material allowance; specialty mechanisms are excluded.',
        );
      }
      if (config === 'sink' || config === 'farmhouse-sink')
        assumptions.add(
          `${config === 'farmhouse-sink' ? 'Farmhouse sink bases have an apron opening' : 'Sink bases have a false front'} and no drawer box; sink, plumbing and countertop are excluded.`,
        );
    }
    if (e.kind === 'tall' && !e.storage) {
      const config = e.tallConfiguration ?? 'standard';
      const openingCounts = {
        standard: 0,
        'one-oven': 1,
        'two-oven': 2,
        'coffee-maker': 1,
      } satisfies Record<NonNullable<RoomElement['tallConfiguration']>, number>;
      if (config !== 'standard') {
        drawers = 2;
        const count = openingCounts[config] ?? 1;
        const opening =
          Math.min(
            config === 'coffee-maker' ? 18 : 28,
            ((h - 0.25) * 0.64) / count,
          ) * count;
        frontCoverage = (h - opening) / h;
        assumptions.add(
          'Tall appliance cabinets include two lower drawer boxes and upper doors; appliance openings are deducted from front area.',
        );
      }
    }
    const visibleBox = exposedCabinetInterior(e, study.room);
    if (visibleBox && e.kind === 'wall-cabinet' && e.face === 'shaker-glass')
      assumptions.add(
        'Glass-front uppers use visible-material carcasses and a conservative full face-stock allowance; glass itself is excluded.',
      );
    if (panel)
      assumptions.add(
        'Panel-ready appliances include face panels and one finishing unit only; appliance-supplied mounting hardware and hinges are excluded.',
      );
    else if (!study.room.useMapleInternals)
      assumptions.add(
        'Two finished ends per cabinet are assumed conservatively; full finished backs are included for island-assigned cabinets. Verify actual exposure.',
      );
    const storage = e.storage ? storageLayout(e, study.room) : undefined;
    if (storage) {
      drawers = storage.drawers;
      doors =
        e.storage!.doors && storage.high - storage.low - storage.drawerZone > 1
          ? e.width > 30
            ? 2
            : 1
          : 0;
      frontCoverage = e.storage!.doors ? 1 : storage.drawerZone / h;
      assumptions.add(
        'Open storage includes visible-material shelves, dividers, top and optional finished back. Shelf supports and hanging-rod hardware use the project miscellaneous allowance unless separately configured; interior assembly uses the standard box labor allowance and requires shop review.',
      );
    }
    let faceCount = panel ? 0 : drawers + doors;
    if (!e.customCabinet && !e.storage && e.kind === 'base') {
      // A sink false front has no drawer box; its apron belongs to the sink.
      if (e.configuration === 'sink') faceCount++;
      if (e.configuration === 'farmhouse-sink') faceCount = 2;
    }
    let beadedFaces = e.face === 'beaded-shaker' ? faceCount : 0;
    let beadedFlatFaces = e.face === 'beaded-flat' ? faceCount : 0;
    if (isCombinationFace(e.face)) {
      // Paired doors share the highest row. False fronts count; sink aprons do not.
      const upperDoors = storage ? doors : e.kind === 'tall' ? doors : 0;
      const topCount =
        upperDoors ||
        (e.kind === 'base' &&
        ['door-drawer', 'three-drawer', 'sink'].includes(e.configuration ?? '')
          ? 1
          : drawers
            ? 1
            : faceCount);
      const [top, lower] = combinationProfiles[e.face];
      const count = (style: string) =>
        (top === style ? topCount : 0) +
        (lower === style ? faceCount - topCount : 0);
      beadedFaces = count('beaded-shaker');
      beadedFlatFaces = count('beaded-flat');
    }
    let customAreas: Pick<
      ScheduleLine,
      'carcassArea' | 'faceArea' | 'backArea'
    > = {};
    if (e.customCabinet) {
      const unit = fitDefinition(
        e.customCabinet.definition,
        cabinetCompositionEnvelope(e, study.room),
      );
      const parts = resolvePartFaces(
        roomFrontParts(
          {
            ...unit,
            parts: customUnitLayoutParts(unit) as NonNullable<
              typeof unit.parts
            >,
          },
          study.room.overlay ?? 'full-overlay',
        ),
        e.face,
      );
      const area = (part: (typeof parts)[number]) => {
        const dimensions = [part.width, part.height, part.depth].sort(
          (a, b) => b - a,
        );
        return (dimensions[0] * dimensions[1]) / 144;
      };
      customAreas = {
        carcassArea: parts
          .filter(internalCustomPart)
          .reduce((total, part) => total + area(part), 0),
        faceArea:
          parts
            .filter((part) => part.kind !== 'rod' && !internalCustomPart(part))
            .reduce((total, part) => total + area(part), 0) +
          (feet ? (e.width * toeKickHeight) / 144 : 0),
        backArea: 0,
      };
      drawers = parts.filter((part) => part.kind === 'drawer').length;
      doors = parts.filter((part) => part.kind === 'door').length;
      const profileFaces = (style: RoomElement['face']) =>
        parts.filter(
          (part) =>
            (part.kind === 'door' || part.kind === 'drawer') &&
            part.door?.mechanism !== 'tambour' &&
            (part.faceStyle ?? e.face) === style,
        ).length;
      beadedFaces = profileFaces('beaded-shaker');
      beadedFlatFaces = profileFaces('beaded-flat');
      assumptions.add(
        'Custom cabinet stock uses the saved physical parts; drawer boxes retain the standard drawer construction allowance.',
      );
    }
    if (beadedFaces)
      assumptions.add(
        'Beaded Shaker adds $10 per door/drawer face to the selling price before the displayed range is rounded.',
      );
    if (beadedFlatFaces)
      assumptions.add(
        'Beaded Flat adds $5 per door/drawer face to the selling price before the displayed range is rounded.',
      );
    assumptions.add(
      study.room.useMapleInternals
        ? 'Maple stock is preferred for concealed carcasses and drawer boxes. Open and glass-front interiors retain the front material.'
        : 'Carcasses and drawer boxes use the selected front-material allowance.',
    );
    if (drawers && !study.room.useMapleInternals && material !== 'maple')
      assumptions.add(
        'Species-specific drawer stock rates are used when configured; otherwise the selected material-to-maple sheet-rate ratio is a budget allowance for drawer stock and bottoms. Verify solid-stock costs before a final quote.',
      );
    lines.push({
      id: e.id,
      width: e.width,
      depth: e.depth,
      height: e.height,
      material,
      interiorMaterial:
        cabinetInteriorSelection(e, study.room).material ?? material,
      drawerMaterial: study.room.useMapleInternals ? 'maple' : material,
      ...customAreas,
      boxUnits: panel ? 0 : 1,
      feet,
      toeKickHeight,
      finishUnits: 1,
      drawers,
      beadedFaces,
      beadedFlatFaces,
      hinges: panel
        ? 0
        : doors *
          (e.height > 60 &&
          e.kind === 'tall' &&
          (e.tallConfiguration ?? 'standard') === 'standard'
            ? 4
            : 2),
      frontCoverage,
      endPanels: panel || study.room.useMapleInternals ? 0 : 2,
      finishedBack:
        !study.room.useMapleInternals && !panel && !storage && e.islandId
          ? 1
          : 0,
      visibleBox,
      ...(storage
        ? {
            extraCarcass:
              (storage.shelfYs.length * storage.shelfWidth * (e.depth - 0.75) +
                (storage.divider
                  ? (storage.high - storage.low) * (e.depth - 0.75)
                  : 0) +
                storage.inner * e.depth +
                (e.storage!.back ? storage.inner * h : 0) +
                (e.storage!.type === 'shoes' && e.storage!.angled
                  ? storage.shelfYs.length * storage.shelfWidth * 1.25
                  : 0)) /
              144,
            backSheetFactor: 0,
            rodFeet: (storage.rods.length * storage.rodWidth) / 12,
          }
        : {}),
    });
  }
  if (study.room.useMapleInternals)
    assumptions.add(
      'Automatic finish panels cover exposed cabinet side/back areas; attached panels use the cabinet exterior finish and can be disabled per cabinet.',
    );
  return {lines, assumptions: [...assumptions]};
}
/** Internal-only result, never serialize this object in an HTTP response. */
export function calculatePrice(lines: ScheduleLine[], rates: Rates) {
  const rate = (key: string): number => {
    // Plain-sawn white oak follows maple pricing; purchase pools stay separate.
    const rateKey = key === 'face_plain-white-oak' ? 'face_maple' : key;
    // Existing drawer rates describe maple. Prefer a configured species rate;
    // otherwise use the selected sheet-rate ratio as an explicit budget allowance.
    const drawerSpecies = key.match(
      /^(drawer_stock|drawer_bottom_sheet)_(.+)$/,
    );
    if (drawerSpecies && rates[key] === undefined) {
      const maple = rate('face_maple');
      if (maple <= 0)
        throw new PricingError('pricing_not_configured', ['face_maple']);
      return (
        (rate(drawerSpecies[1]) * rate(`face_${drawerSpecies[2]}`)) / maple
      );
    }
    const value = rates[rateKey];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new PricingError('pricing_not_configured', [rateKey]);
    return value;
  };
  const pools = new Map<
    string,
    {net: number; waste: string; divisor: number}
  >();
  const add = (key: string, net: number, waste: string, divisor = 32) => {
    if (net <= 0) return;
    const p = pools.get(key) ?? {net: 0, waste, divisor};
    p.net += net;
    pools.set(key, p);
  };
  if (!lines.length) return {cost: 0, price: 0, purchases: {}};
  let hours = 0,
    hardware = 0,
    finish = 0;
  for (const c of lines) {
    const w = c.width,
      d = c.depth,
      h = Math.max(0, c.height - (c.toeKickHeight ?? (c.feet ? 4 : 0))),
      iw = Math.max(0, w - 1.5);
    const carcass =
      c.carcassArea ??
      (c.boxUnits * (2 * d * h + iw * d + 4 * iw * 3)) / 144 +
        (c.extraCarcass ?? 0);
    const face =
      c.faceArea ??
      (c.finishUnits * w * h * c.frontCoverage +
        c.endPanels * d * h +
        c.finishUnits * w * h * c.finishedBack +
        (c.feet ? c.boxUnits * w * (c.toeKickHeight ?? 4) : 0)) /
        144;
    if (c.interiorMaterial)
      add(`face_${c.interiorMaterial}`, carcass, 'face_waste');
    else add('box_sheet', c.visibleBox ? 0 : carcass, 'box_waste');
    add(
      `face_${c.material}`,
      face + (!c.interiorMaterial && c.visibleBox ? carcass : 0),
      'face_waste',
    );
    const backArea =
      c.backArea ?? (c.boxUnits * iw * h * (c.backSheetFactor ?? 1)) / 144;
    add(
      c.interiorMaterial ? `face_${c.interiorMaterial}` : 'back_sheet',
      backArea,
      c.interiorMaterial ? 'face_waste' : 'back_waste',
    );
    const drawerSuffix =
      c.drawerMaterial && c.drawerMaterial !== 'maple'
        ? `_${c.drawerMaterial}`
        : '';
    add(
      `drawer_stock${drawerSuffix}`,
      (c.drawers * 2 * (d - 3 + (w - 1.25))) / 12,
      'drawer_stock_waste',
      1,
    );
    add(
      `drawer_bottom_sheet${drawerSuffix}`,
      (c.drawers * (d - 3) * (w - 1.25)) / 144,
      'drawer_bottom_waste',
    );
    hours +=
      c.boxUnits * rate('box_hours') +
      c.drawers * rate('drawer_hours') +
      c.finishUnits * rate('finish_hours');
    hardware +=
      c.drawers * rate('slide_pair') +
      (c.hinges / 2) * rate('hinge_pair') +
      c.feet * rate('axilo_foot');
    if (c.rodFeet) hardware += c.rodFeet * rate('hanging_rod_lf');
    finish += c.finishUnits * rate('finish_consumables');
  }
  const purchases: Record<string, number> = {};
  let materials = 0;
  for (const [key, p] of pools) {
    purchases[key] = Math.ceil((p.net * (1 + rate(p.waste))) / p.divisor);
    materials += purchases[key] * rate(key);
  }
  const laborRate =
    rates.labor_rate == null
      ? rate('weekly_cost') / rate('weekly_hours')
      : rate('labor_rate');
  const margin = rate('margin');
  if (margin >= 1 || !Number.isFinite(laborRate))
    throw new PricingError('pricing_not_configured', [
      'margin or productive hours',
    ]);
  const cost =
    (materials + hardware + hours * laborRate + finish + rate('misc')) *
    (1 + rate('overhead'));
  let price = cost / (1 - margin);
  if (rates.profit_cap != null)
    price = Math.min(price, cost + rate('profit_cap'));
  price +=
    lines.reduce((total, line) => total + (line.beadedFaces ?? 0), 0) *
      BEADED_FACE_SURCHARGE +
    lines.reduce((total, line) => total + (line.beadedFlatFaces ?? 0), 0) *
      BEADED_FLAT_SURCHARGE;
  if (!Number.isFinite(price) || price > Number.MAX_SAFE_INTEGER / 100)
    throw new PricingError('pricing_not_configured', ['price overflow']);
  return {cost, price, purchases};
}
export function priceRange(price: number) {
  return {
    low: Math.round((price * 0.9) / 500) * 500,
    high: Math.round((price * 1.1) / 500) * 500,
  };
}
export function estimateProject(study: Study, rates: Rates) {
  const {lines, assumptions} = projectSchedule(study);
  const {price} = calculatePrice(lines, rates);
  return {
    currency: 'USD',
    range: priceRange(price),
    roundingIncrement: 500,
    tolerancePercentBeforeRounding: 10,
    scope: 'Cabinetry, room panels and selected appliance face panels only',
    estimateOnly: true,
    pricedItemCount: lines.filter((line) => !line.autoPanelOwnerId).length,
    assumptions: lines.length
      ? assumptions
      : [
          'No priceable cabinetry, room panels or appliance face panels in this project.',
        ],
    exclusions: EXCLUSIONS,
  };
}
