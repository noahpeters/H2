import {jsonResponse} from '../../app/studio/cabinet-configurator/savedRoomProtocol';

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{results: T[]}>;
};

const DAY_MS = 86_400_000;
const scope = `occurred_at >= ? AND occurred_at < ?
  AND json_extract(payload, '$.origin') = 'https://from-trees.com'`;

function instant(value: string | null) {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value
    ? millis
    : null;
}

export async function acquisitionReport(
  request: Request,
  db: {prepare(sql: string): Statement},
) {
  if (request.method !== 'GET')
    return jsonResponse({error: 'Method not allowed'}, 405);
  const params = new URL(request.url).searchParams;
  const start = params.get('start');
  const end = params.get('end');
  const startMs = instant(start);
  const endMs = instant(end);
  if (
    startMs === null ||
    endMs === null ||
    endMs <= startMs ||
    endMs - startMs > 91 * DAY_MS
  )
    return jsonResponse({error: 'Invalid report window'}, 400);

  const [totals, pages, campaigns] = await Promise.all([
    db
      .prepare(
        `SELECT
      COUNT(CASE WHEN kind = 'arrival' AND json_extract(payload, '$.traffic') = 'navigation' THEN 1 END) AS arrivals,
      COUNT(CASE WHEN kind = 'view' THEN 1 END) AS views,
      COUNT(DISTINCT CASE WHEN kind = 'view' THEN visitor_id END) AS visitors,
      COUNT(DISTINCT CASE WHEN kind = 'view' THEN session_id END) AS sessions,
      COUNT(CASE WHEN kind = 'inquiry_accepted' THEN 1 END) AS inquiries
      FROM acquisition_events WHERE ${scope}`,
      )
      .bind(start, end)
      .first(),
    db
      .prepare(
        `SELECT json_extract(payload, '$.path') AS path, COUNT(*) AS arrivals
      FROM acquisition_events WHERE ${scope} AND kind = 'arrival'
        AND json_extract(payload, '$.traffic') = 'navigation'
      GROUP BY path ORDER BY arrivals DESC, path LIMIT 10`,
      )
      .bind(start, end)
      .all(),
    db
      .prepare(
        `SELECT json_extract(payload, '$.attribution.utm_source') AS source,
      json_extract(payload, '$.attribution.utm_medium') AS medium,
      json_extract(payload, '$.attribution.utm_campaign') AS campaign, COUNT(*) AS views
      FROM acquisition_events WHERE ${scope} AND kind = 'view'
      GROUP BY source, medium, campaign ORDER BY views DESC, source, medium, campaign LIMIT 10`,
      )
      .bind(start, end)
      .all(),
  ]);
  return jsonResponse({
    start,
    end,
    totals,
    pages: pages.results,
    campaigns: campaigns.results,
  });
}
