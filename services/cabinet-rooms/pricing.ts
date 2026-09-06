import type {Study} from '../../app/studio/cabinet-configurator/CabinetConfigurator';
import {minimumTallHeight} from '../../app/studio/cabinet-configurator/model';
export type Rates = Record<string, number | null>;
export class PricingError extends Error {
  constructor(
    public code: 'pricing_not_configured' | 'unsupported_configuration',
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
  'appliances (including sinks and range hoods)',
  'decorative pulls',
  'plumbing',
  'electrical work',
  'design fees',
  'unmodeled fillers, scribes and infill',
  'specialty pull-out and corner mechanisms',
];
export type ScheduleLine = {
  id: string;
  width: number;
  depth: number;
  height: number;
  material: string;
  boxUnits: number;
  feet: number;
  finishUnits: number;
  drawers: number;
  hinges: number;
  frontCoverage: number;
  endPanels: number;
  finishedBack: number;
  visibleBox: boolean;
};
export function projectSchedule(study: Study) {
  const lines: ScheduleLine[] = [];
  const assumptions = new Set<string>([
    'Budget estimate, not a final quote; dimensions and construction require shop review.',
    'No interior shelves are priced until specified. Standard box/drawer/finishing labor is used for all front styles; shaker and inset joinery need review.',
    'Visible fronts use sheet-area allowances, not a detailed rail-and-stile cut list.',
    'Four Axilo feet per base/tall cabinet; their default cost is covered by project miscellaneous materials.',
  ]);
  for (const e of study.elements) {
    const panel =
      e.kind === 'appliance' &&
      ['refrigerator', 'dishwasher'].includes(e.applianceKind ?? '') &&
      ['shaker', 'slab'].includes(e.applianceFront ?? 'stainless');
    if (e.kind === 'appliance' && !panel) continue;
    if (e.width <= 1.5 || e.depth <= 3 || e.height <= 4)
      throw new PricingError('unsupported_configuration', [e.id]);
    const material = e.material ?? 'rift-white-oak';
    if (!e.material)
      assumptions.add(
        'Unspecified materials use rift-sawn white oak, matching the configurator default.',
      );
    let drawers = 0,
      doors = e.width > 30 ? 2 : 1,
      frontCoverage = 1;
    const feet = e.kind === 'base' || e.kind === 'tall' ? 4 : 0;
    const h = e.height - (feet ? 4 : 0);
    if (e.kind === 'base') {
      const config = e.configuration ?? 'single-door';
      if (
        ![
          'single-door',
          'door-drawer',
          'three-drawer',
          'pullout',
          'microwave-drawer',
          'sink',
          'corner',
        ].includes(config)
      )
        throw new PricingError('unsupported_configuration', [e.id]);
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
      if (config === 'sink')
        assumptions.add(
          'Sink bases have a false front and no drawer box; sink, plumbing and countertop are excluded.',
        );
    }
    if (e.kind === 'tall') {
      const config = e.tallConfiguration ?? 'standard';
      if (
        !['standard', 'one-oven', 'two-oven', 'coffee-maker'].includes(
          config,
        ) ||
        e.height < minimumTallHeight(config)
      )
        throw new PricingError('unsupported_configuration', [e.id]);
      if (config !== 'standard') {
        drawers = 2;
        const count = config === 'two-oven' ? 2 : 1;
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
    const visibleBox = e.kind === 'wall-cabinet' && e.face === 'shaker-glass';
    if (visibleBox)
      assumptions.add(
        'Glass-front uppers use visible-material carcasses and a conservative full face-stock allowance; glass itself is excluded.',
      );
    if (panel)
      assumptions.add(
        'Panel-ready appliances include face panels and one finishing unit only; appliance-supplied mounting hardware and hinges are excluded.',
      );
    else
      assumptions.add(
        'Two finished ends per cabinet are assumed conservatively; full finished backs are included for island-assigned cabinets. Verify actual exposure.',
      );
    lines.push({
      id: e.id,
      width: e.width,
      depth: e.depth,
      height: e.height,
      material,
      boxUnits: panel ? 0 : 1,
      feet,
      finishUnits: 1,
      drawers,
      hinges: panel
        ? 0
        : doors *
          (e.height > 60 &&
          e.kind === 'tall' &&
          (e.tallConfiguration ?? 'standard') === 'standard'
            ? 4
            : 2),
      frontCoverage,
      endPanels: panel ? 0 : 2,
      finishedBack: !panel && e.islandId ? 1 : 0,
      visibleBox,
    });
  }
  return {lines, assumptions: [...assumptions]};
}
/** Internal-only result, never serialize this object in an HTTP response. */
export function calculatePrice(lines: ScheduleLine[], rates: Rates) {
  const rate = (key: string) => {
    const value = rates[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new PricingError('pricing_not_configured', [key]);
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
      h = c.height - (c.feet ? 4 : 0),
      iw = w - 1.5;
    const carcass = (c.boxUnits * (2 * d * h + iw * d + 4 * iw * 3)) / 144;
    const face =
      (c.finishUnits * w * h * c.frontCoverage +
        c.endPanels * d * h +
        c.finishUnits * w * h * c.finishedBack +
        (c.feet ? c.boxUnits * w * 4 : 0)) /
      144;
    add('box_sheet', c.visibleBox ? 0 : carcass, 'box_waste');
    add(
      `face_${c.material}`,
      face + (c.visibleBox ? carcass : 0),
      'face_waste',
    );
    add('back_sheet', (c.boxUnits * iw * h) / 144, 'back_waste');
    add(
      'drawer_stock',
      (c.drawers * 2 * (d - 3 + (w - 1.25))) / 12,
      'drawer_stock_waste',
      1,
    );
    add(
      'drawer_bottom_sheet',
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
    scope: 'Cabinetry and selected appliance face panels only',
    estimateOnly: true,
    pricedItemCount: lines.length,
    assumptions: lines.length
      ? assumptions
      : ['No priceable cabinetry or appliance face panels in this project.'],
    exclusions: EXCLUSIONS,
  };
}
