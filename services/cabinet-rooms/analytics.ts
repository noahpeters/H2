import {
  jsonResponse,
  readLimited,
} from '../../app/studio/cabinet-configurator/savedRoomProtocol';
import {
  wallToFloor,
  type Room,
  type KitchenElement,
} from '../../app/studio/cabinet-configurator/model';

export interface AnalyticsDB {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{results: T[]}>;
      run(): Promise<unknown>;
    };
  };
}
export const sessionId = (value: unknown): string | null =>
  typeof value === 'string' && /^[a-f0-9]{32}$/.test(value) ? value : null;

// Reporting must never prevent a customer from saving, sharing or requesting a price.
export async function recordEvent(
  db: AnalyticsDB,
  kind: string,
  id: string,
  session: unknown,
  room: string | null = null,
) {
  try {
    await db
      .prepare(
        'INSERT OR IGNORE INTO cabinet_events (id,kind,session_id,room_slug,created_at) VALUES (?,?,?,?,?)',
      )
      .bind(
        `${kind}:${id}`,
        kind,
        sessionId(session),
        room,
        new Date().toISOString(),
      )
      .run();
  } catch {
    console.error('Cabinet analytics write unavailable');
  }
}

export async function recordVisit(request: Request, db: AnalyticsDB) {
  if (request.method !== 'POST')
    return jsonResponse({error: 'Method not allowed'}, 405);
  const body = await readLimited(request);
  const id = sessionId(body.sessionId);
  const tags = ['source', 'medium', 'campaign'] as const;
  if (
    !id ||
    tags.some(
      (key) =>
        typeof body[key] !== 'string' || (body[key] as string).length > 120,
    )
  )
    return jsonResponse({error: 'Invalid visit'}, 400);
  await db
    .prepare(
      'INSERT OR IGNORE INTO cabinet_sessions (id,source,medium,campaign,created_at) VALUES (?,?,?,?,?)',
    )
    .bind(id, body.source, body.medium, body.campaign, new Date().toISOString())
    .run();
  await recordEvent(db, 'visit', id, id);
  return jsonResponse({ok: true});
}

function preview(data: string) {
  try {
    const study = JSON.parse(data) as {room: Room; elements: KitchenElement[]};
    return {
      width: study.room.width,
      depth: study.room.depth,
      outline: study.room.outline,
      elements: study.elements.slice(0, 200).map((element) => ({
        ...wallToFloor(element, study.room),
        width: element.width,
        depth: element.depth,
        kind: element.kind,
        material: element.material || 'oak',
      })),
    };
  } catch {
    return null;
  }
}

export async function dashboard(request: Request, db: AnalyticsDB) {
  if (request.method !== 'GET')
    return jsonResponse({error: 'Method not allowed'}, 405);
  const url = new URL(request.url);
  const days = Number(url.searchParams.get('days') || 30);
  const page = Number(url.searchParams.get('page') || 0);
  if (
    ![7, 30, 90].includes(days) ||
    !Number.isInteger(page) ||
    page < 0 ||
    page > 10000
  )
    return jsonResponse({error: 'Invalid date range or page'}, 400);
  const end = new Date().toISOString();
  const start = new Date(Date.now() - days * 86400000).toISOString();
  const query = <T>(sql: string, ...args: unknown[]) =>
    db
      .prepare(sql)
      .bind(...args)
      .all<T>()
      .then((r) => r.results);
  const [coverage, totals, daily, sources, designs, leads] = await Promise.all([
    db
      .prepare(
        "SELECT value FROM cabinet_analytics_meta WHERE key='tracking_started_at'",
      )
      .bind()
      .first<{value: string}>(),
    db
      .prepare(
        `SELECT
      (SELECT COUNT(*) FROM cabinet_events WHERE kind='visit' AND created_at>=? AND created_at<=?) AS visits,
      (SELECT COUNT(*) FROM cabinet_events WHERE kind='design' AND created_at>=? AND created_at<=?) AS designs,
      (SELECT COUNT(*) FROM room_shares WHERE created_at>=? AND created_at<=?) AS shares,
      (SELECT COUNT(*) FROM cabinet_events WHERE kind='email' AND created_at>=? AND created_at<=?) AS emails,
      (SELECT COUNT(*) FROM room_price_requests WHERE created_at>=? AND created_at<=?) AS prices,
      (SELECT COUNT(DISTINCT lower(trim(sender_email))) FROM cabinet_leads WHERE consent_at>=? AND consent_at<=?) AS leads,
      (SELECT COUNT(*) FROM cabinet_leads WHERE consent_at>=? AND consent_at<=?) AS leadSubmissions,
      (SELECT COUNT(DISTINCT e.session_id) FROM cabinet_events e JOIN cabinet_events v ON v.session_id=e.session_id AND v.kind='visit' WHERE e.kind='lead' AND v.created_at>=? AND v.created_at<=? AND e.created_at<=?) AS convertedVisits`,
      )
      .bind(
        ...Array.from({length: 7}, () => [start, end]).flat(),
        start,
        end,
        end,
      )
      .first<Record<string, number>>(),
    query<{date: string; visits: number}>(
      "SELECT substr(created_at,1,10) AS date, COUNT(*) AS visits FROM cabinet_events WHERE kind='visit' AND created_at>=? AND created_at<=? GROUP BY date ORDER BY date",
      start,
      end,
    ),
    query(
      `SELECT s.source,s.medium,s.campaign,COUNT(DISTINCT v.id) AS visits,
      COUNT(DISTINCT CASE WHEN e.kind='share' THEN e.id END) AS shares,
      COUNT(DISTINCT CASE WHEN e.kind='lead' THEN e.session_id END) AS convertedVisits
      FROM cabinet_events v JOIN cabinet_sessions s ON s.id=v.session_id
      LEFT JOIN cabinet_events e ON e.session_id=v.session_id AND e.created_at<=?
      WHERE v.kind='visit' AND v.created_at>=? AND v.created_at<=?
      GROUP BY s.source,s.medium,s.campaign ORDER BY visits DESC LIMIT 50`,
      end,
      start,
      end,
    ),
    query<{slug: string; data: string; updated_at: string; revision: number}>(
      `SELECT r.slug,r.data,r.updated_at,r.revision FROM rooms r
      WHERE r.updated_at>=? AND r.updated_at<=? AND NOT EXISTS (SELECT 1 FROM room_shares s WHERE s.room_slug=r.slug)
      ORDER BY r.updated_at DESC,r.slug LIMIT 13 OFFSET ?`,
      start,
      end,
      page * 12,
    ),
    query(
      `SELECT request_id,sender_name,sender_email,sender_phone,room_slug,consent_at,lead_source FROM cabinet_leads
      WHERE consent_at>=? AND consent_at<=? ORDER BY consent_at DESC,request_id LIMIT 51 OFFSET ?`,
      start,
      end,
      page * 50,
    ),
  ]);
  return jsonResponse({
    start,
    end,
    days,
    trackingStartedAt: coverage?.value || null,
    totals,
    daily,
    sources,
    designs: designs
      .slice(0, 12)
      .map(({data, ...row}) => ({...row, preview: preview(data)})),
    leads: leads.slice(0, 50),
    hasMoreDesigns: designs.length > 12,
    hasMoreLeads: leads.length > 50,
    page,
  });
}

export async function designPreview(request: Request, db: AnalyticsDB) {
  if (request.method !== 'GET')
    return jsonResponse({error: 'Method not allowed'}, 405);
  const slug = new URL(request.url).searchParams.get('slug');
  if (!sessionId(slug)) return jsonResponse({error: 'Invalid design'}, 400);
  const row = await db
    .prepare('SELECT slug,data,updated_at,revision FROM rooms WHERE slug=?')
    .bind(slug)
    .first<{
      slug: string;
      data: string;
      updated_at: string;
      revision: number;
    }>();
  if (!row) return jsonResponse({error: 'Design not found'}, 404);
  return jsonResponse({
    slug: row.slug,
    updated_at: row.updated_at,
    revision: row.revision,
    preview: preview(row.data),
  });
}
