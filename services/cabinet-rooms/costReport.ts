import type {Study} from '../../app/studio/cabinet-configurator/CabinetConfigurator';
import {
  validStudy,
  jsonResponse,
} from '../../app/studio/cabinet-configurator/savedRoomProtocol';
import {sessionId, type AnalyticsDB} from './analytics';
import {
  calculatePrice,
  projectSchedule,
  EXCLUSIONS,
  priceRange,
  type Rates,
} from './pricing';

// Allocate rounding pennies so every displayed option and cabinet reconciles.
function cents(values: number[], total: number) {
  const result = values.map((value) => Math.floor(value * 100));
  const order = values
    .map((value, index) => ({index, remainder: value * 100 - result[index]}))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remainder =
    Math.round(total * 100) - result.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < remainder; i++) result[order[i % order.length].index]++;
  return result;
}
const economics = (cost: number, price: number) => ({
  cost: cost / 100,
  price: price / 100,
  profit: (price - cost) / 100,
  profitMargin: price ? (price - cost) / price : null,
});
export function buildCostReport(study: Study, rates: Rates) {
  const {lines, assumptions} = projectSchedule(study);
  const calculation = calculatePrice(lines, rates);
  const costs = cents(
    calculation.components.map((item) => item.cost),
    calculation.cost,
  );
  const prices = cents(
    calculation.components.map((item) => item.price),
    calculation.price,
  );
  const cabinets = lines
    .filter((line) => !line.autoPanelOwnerId)
    .map((line) => {
      const element = study.elements.find((item) => item.id === line.id)!;
      const options = calculation.components.flatMap((item, index) =>
        item.id === line.id
          ? [
              {
                option: item.option,
                quantity: item.quantity,
                unit: item.unit,
                ...economics(costs[index], prices[index]),
              },
            ]
          : [],
      );
      const selections = [
        `Exterior: ${line.material}`,
        `Interior: ${line.interiorMaterial ?? line.material}`,
        `Drawer stock: ${line.drawerMaterial ?? 'maple'}`,
        `Front: ${element.kind === 'appliance' ? (element.applianceFront ?? 'stainless') : (element.face ?? 'default')}`,
        `Layout: ${element.configuration ?? element.tallConfiguration ?? element.storage?.type ?? (element.customCabinet ? 'custom' : 'standard')}`,
        `Overlay: ${study.room.overlay ?? 'full-overlay'}`,
        `Face frames: ${line.faceFrameBoardFeet ? (line.continuousFrame ? 'continuous' : 'individual') : 'none'}`,
        `Toe kick height: ${line.toeKickHeight ?? 0} in`,
        ...(element.paintColor
          ? [`Paint color: ${element.paintColor} (standard finish allowance)`]
          : []),
        ...(element.flatGrain
          ? [`Grain: ${element.flatGrain} (standard stock allowance)`]
          : []),
      ];
      return {
        id: line.id,
        kind: element.kind,
        width: line.width,
        depth: line.depth,
        height: line.height,
        selections,
        options,
        ...economics(
          options.reduce((sum, item) => sum + Math.round(item.cost * 100), 0),
          options.reduce((sum, item) => sum + Math.round(item.price * 100), 0),
        ),
      };
    });
  return {
    currency: 'USD',
    estimateOnly: true,
    totals: economics(
      Math.round(calculation.cost * 100),
      Math.round(calculation.price * 100),
    ),
    customerRange: priceRange(calculation.price),
    cabinets,
    assumptions: [
      ...assumptions,
      'Costs include overhead. Whole-sheet and whole-linear-foot purchases after waste are allocated by each option’s share of the material pool; these are allocated project costs, not standalone cabinet quotes.',
      'Project miscellaneous costs are split equally across priced cabinets and standalone panels. Attached finish panels are included under their owning cabinet.',
      'Selling price uses the project margin and profit cap, allocated by cost, plus the selected face premiums. Profit margin is profit divided by selling price; a zero price has no margin.',
      'Selected styles and construction without a separate modeled charge are covered by standard allowances and require shop review. A zero-cost premium means no incremental cost is modeled, not that fabrication is free.',
      'This report uses current rates and the displayed saved revision, not a historical price-request snapshot.',
    ],
    exclusions: EXCLUSIONS,
  };
}
export function costReportCsv(
  report: ReturnType<typeof buildCostReport>,
  metadata: {
    slug: string;
    revision: number;
    updatedAt: string;
    ratesUpdatedAt: string;
    generatedAt: string;
  },
) {
  const rows: (string | number | null)[][] = [
    ['From Trees — internal cost / price estimate', 'USD'],
    ['Design', metadata.slug],
    ['Revision', metadata.revision],
    ['Design updated', metadata.updatedAt],
    ['Rates updated', metadata.ratesUpdatedAt],
    ['Generated', metadata.generatedAt],
    [
      'Website',
      `https://from-trees.com/cabinet-configurator?design=${encodeURIComponent(metadata.slug)}`,
    ],
    [],
    [
      'Section',
      'Cabinet ID',
      'Kind',
      'Width (in)',
      'Depth (in)',
      'Height (in)',
      'Selected option / allowance',
      'Quantity',
      'Unit',
      'Cost (USD)',
      'Price (USD)',
      'Profit (USD)',
      'Profit margin (%)',
    ],
  ];
  const money = (value: number) => value.toFixed(2);
  const margin = (value: number | null) =>
    value === null ? null : (value * 100).toFixed(2);
  for (const cabinet of report.cabinets) {
    rows.push([
      'Cabinet',
      cabinet.id,
      cabinet.kind,
      cabinet.width,
      cabinet.depth,
      cabinet.height,
      '',
      '',
      '',
      money(cabinet.cost),
      money(cabinet.price),
      money(cabinet.profit),
      margin(cabinet.profitMargin),
    ]);
    for (const selection of cabinet.selections)
      rows.push(['Selection', cabinet.id, '', '', '', '', selection]);
    for (const option of cabinet.options)
      rows.push([
        'Option',
        cabinet.id,
        '',
        '',
        '',
        '',
        option.option,
        option.quantity,
        option.unit,
        money(option.cost),
        money(option.price),
        money(option.profit),
        margin(option.profitMargin),
      ]);
  }
  rows.push([
    'Project total',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    money(report.totals.cost),
    money(report.totals.price),
    money(report.totals.profit),
    margin(report.totals.profitMargin),
  ]);
  rows.push([
    'Customer range',
    report.customerRange.low,
    report.customerRange.high,
  ]);
  for (const assumption of report.assumptions)
    rows.push(['Assumption', assumption]);
  for (const exclusion of report.exclusions) rows.push(['Excluded', exclusion]);
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            // Quote every cell and neutralize spreadsheet formulas in saved identifiers.
            const text = String(value ?? '');
            return (
              '"' +
              (/^[=+@\-\t\r\n]/.test(text) ? "'" + text : text).replaceAll(
                '"',
                '""',
              ) +
              '"'
            );
          })
          .join(','),
      )
      .join('\r\n')
  );
}
export async function costReport(request: Request, db: AnalyticsDB) {
  if (request.method !== 'GET')
    return jsonResponse({error: 'Method not allowed'}, 405);
  const params = new URL(request.url).searchParams;
  const slug = sessionId(params.get('slug'));
  const revision = Number(params.get('revision'));
  if (
    !slug ||
    !params.has('revision') ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    return jsonResponse({error: 'invalid_design_revision'}, 400);
  const row = await db
    .prepare('SELECT slug,data,updated_at,revision FROM rooms WHERE slug=?')
    .bind(slug)
    .first<{
      slug: string;
      data: string;
      updated_at: string;
      revision: number;
    }>();
  if (!row) return jsonResponse({error: 'design_not_found'}, 404);
  if (row.revision !== revision)
    return jsonResponse({error: 'design_revision_changed'}, 409);
  let study;
  try {
    study = JSON.parse(row.data);
  } catch {
    return jsonResponse({error: 'invalid_saved_design'}, 422);
  }
  if (!validStudy(study))
    return jsonResponse({error: 'invalid_saved_design'}, 422);
  try {
    const config = await db
      .prepare(
        'SELECT json_group_object(key, value) AS rates, MAX(updated_at) AS updated_at FROM cabinet_pricing_rates',
      )
      .bind()
      .first<{rates: string; updated_at: string}>();
    if (!config?.updated_at) throw new Error('Missing rates');
    const report = buildCostReport(
      study as Study,
      JSON.parse(config.rates) as Rates,
    );
    const metadata = {
      slug,
      revision,
      updatedAt: row.updated_at,
      ratesUpdatedAt: config.updated_at,
      generatedAt: new Date().toISOString(),
    };
    return jsonResponse({
      ...metadata,
      report,
      filename: `From-Trees-cost-price-${slug}-r${revision}.csv`,
      csv: costReportCsv(report, metadata),
    });
  } catch {
    return jsonResponse({error: 'pricing_not_configured'}, 503);
  }
}
