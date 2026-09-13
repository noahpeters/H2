import {
  dashboard,
  designPreview,
  recordVisit,
  recordEvent,
  sessionId,
} from './analytics';
import {
  jsonResponse,
  readLimited,
  SLUG,
  validStudy,
} from '../../app/studio/cabinet-configurator/savedRoomProtocol';
import {
  CONTACT_CONSENT,
  validShare,
} from '../../app/studio/cabinet-configurator/shareProtocol';
import {estimateProject, PricingError, type Rates} from './pricing';
import type {Study} from '../../app/studio/cabinet-configurator/CabinetConfigurator';
import {validPriceRequest} from '../../app/studio/cabinet-configurator/priceProtocol';
import {validLibraryInput} from '../../app/studio/cabinet-configurator/custom-unit/library';
interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{results: T[]}>;
  run(): Promise<{meta: {changes: number}}>;
}
interface Env {
  DB: {prepare(sql: string): Statement};
  SERVICE_TOKEN: string;
  ANALYTICS_READ_TOKEN?: string;
  WRITES: {limit(options: {key: string}): Promise<{success: boolean}>};
  SHARES?: {limit(options: {key: string}): Promise<{success: boolean}>};
  ADMIN_TOKEN?: string;
}
const hash = async (key: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
async function projectEstimate(
  env: Env,
  slug: string,
  row: {data: string; revision: number; updated_at: string},
): Promise<Response> {
  const study = JSON.parse(row.data);
  if (!validStudy(study))
    return jsonResponse({error: 'Invalid room configuration'}, 422);
  try {
    const config = await env.DB.prepare(
      'SELECT json_group_object(key, value) AS rates, MAX(updated_at) AS updated_at FROM cabinet_pricing_rates',
    )
      .bind()
      .first<{rates: string; updated_at: string}>();
    if (!config?.updated_at) throw new Error('Missing pricing rates');
    const estimate = estimateProject(
      study as Study,
      JSON.parse(config.rates) as Rates,
    );
    return jsonResponse({
      ...estimate,
      slug,
      projectRevision: row.revision,
      projectUpdatedAt: row.updated_at,
      ratesUpdatedAt: config.updated_at,
      pricingVersion: 1,
    });
  } catch (error) {
    if (
      error instanceof PricingError &&
      error.code === 'unsupported_configuration'
    )
      return jsonResponse(
        {
          error: 'This configuration requires a custom estimate',
          code: error.code,
        },
        422,
      );
    return jsonResponse(
      {
        error: 'Pricing is unavailable for this project',
        code: 'pricing_not_configured',
      },
      503,
    );
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/admin/dashboard' || path === '/admin/design') {
      if (
        !env.ANALYTICS_READ_TOKEN ||
        env.ANALYTICS_READ_TOKEN === env.SERVICE_TOKEN ||
        request.headers.get('Authorization') !==
          `Bearer ${env.ANALYTICS_READ_TOKEN}`
      )
        return jsonResponse({error: 'Unauthorized'}, 401);
      try {
        return await (path === '/admin/design'
          ? designPreview(request, env.DB)
          : dashboard(request, env.DB));
      } catch {
        return jsonResponse({error: 'Reporting is unavailable'}, 503);
      }
    }
    if (
      !env.SERVICE_TOKEN ||
      request.headers.get('Authorization') !== `Bearer ${env.SERVICE_TOKEN}`
    )
      return jsonResponse({error: 'Unauthorized'}, 401);
    const slug = new URL(request.url).searchParams.get('slug');
    if (slug && !SLUG.test(slug))
      return jsonResponse({error: 'Invalid room link'}, 400);
    try {
      if (new URL(request.url).pathname === '/custom-cabinets') {
        const admin =
          !!env.ADMIN_TOKEN &&
          request.headers.get('X-Admin-Token') === env.ADMIN_TOKEN;
        if (request.method === 'GET') {
          const statusClause = admin ? '' : " WHERE c.status = 'published'";
          const rows = await env.DB.prepare(
            `SELECT c.*, v.definition FROM custom_cabinets c JOIN custom_cabinet_versions v ON v.cabinet_id=c.id AND v.version=c.current_version${statusClause} ORDER BY c.name`,
          ).bind().all!<{
            id: string;
            current_version: number;
            name: string;
            description: string;
            tags: string;
            thumbnail: string | null;
            status: 'draft' | 'published' | 'archived';
            updated_at: string;
            definition: string;
          }>();
          return jsonResponse(
            rows.results.map((row) => ({
              id: row.id,
              version: row.current_version,
              name: row.name,
              description: row.description,
              tags: JSON.parse(row.tags),
              thumbnail: row.thumbnail ?? undefined,
              status: row.status,
              updatedAt: row.updated_at,
              definition: JSON.parse(row.definition),
            })),
          );
        }
        if (!admin)
          return jsonResponse({error: 'Administrator access required'}, 403);
        if (!['POST', 'PUT'].includes(request.method))
          return jsonResponse({error: 'Method not allowed'}, 405);
        const input = await readLimited(request);
        if (!validLibraryInput(input))
          return jsonResponse({error: 'Invalid cabinet definition'}, 400);
        const previous = await env.DB.prepare(
          'SELECT current_version FROM custom_cabinets WHERE id = ?',
        )
          .bind(input.id)
          .first<{current_version: number}>();
        if (request.method === 'POST' && previous)
          return jsonResponse({error: 'Cabinet already exists'}, 409);
        if (request.method === 'PUT' && !previous)
          return jsonResponse({error: 'Cabinet not found'}, 404);
        const version = (previous?.current_version ?? 0) + 1;
        const now = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO custom_cabinets (id,current_version,name,description,tags,thumbnail,status,updated_at)
           VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET current_version=excluded.current_version,name=excluded.name,description=excluded.description,tags=excluded.tags,thumbnail=excluded.thumbnail,status=excluded.status,updated_at=excluded.updated_at`,
        )
          .bind(
            input.id,
            version,
            input.name.trim(),
            input.description,
            JSON.stringify(input.tags),
            input.thumbnail ?? null,
            input.status,
            now,
          )
          .run();
        await env.DB.prepare(
          'INSERT INTO custom_cabinet_versions (cabinet_id,version,definition,created_at) VALUES (?,?,?,?)',
        )
          .bind(input.id, version, JSON.stringify(input.definition), now)
          .run();
        return jsonResponse(
          {...input, version, updatedAt: now},
          previous ? 200 : 201,
        );
      }
      if (path === '/analytics/visit') {
        if (
          !(
            await env.WRITES.limit({
              key: request.headers.get('X-Client-IP') || 'unknown',
            })
          ).success
        )
          return jsonResponse({error: 'Too many requests'}, 429);
        return await recordVisit(request, env.DB);
      }
      if (path === '/analytics/email') {
        if (request.method !== 'POST')
          return jsonResponse({error: 'Method not allowed'}, 405);
        const body = await readLimited(request);
        if (typeof body.requestId !== 'string' || body.requestId.length > 100)
          return jsonResponse({error: 'Invalid request'}, 400);
        const share = await env.DB.prepare(
          'SELECT room_slug FROM room_shares WHERE request_id=?',
        )
          .bind(body.requestId)
          .first<{room_slug: string}>();
        if (!share) return jsonResponse({error: 'Share not found'}, 404);
        await recordEvent(
          env.DB,
          'email',
          body.requestId,
          body.analyticsSessionId,
          share.room_slug,
        );
        return jsonResponse({ok: true});
      }
      if (new URL(request.url).pathname === '/quote') {
        if (request.method !== 'POST')
          return jsonResponse({error: 'Method not allowed'}, 405);
        const body = await readLimited(request);
        const analyticsSession = sessionId(body.analyticsSessionId);
        if (!validPriceRequest(body))
          return jsonResponse(
            {error: 'Please enter your name and a valid email address.'},
            400,
          );
        if (
          !(
            await env.WRITES.limit({
              key: request.headers.get('X-Client-IP') || 'unknown',
            })
          ).success
        )
          return jsonResponse(
            {error: 'Too many requests. Please try again shortly.'},
            429,
          );
        const source = await env.DB.prepare(
          'SELECT data, revision, updated_at FROM rooms WHERE slug = ? AND edit_hash = ? AND revision = ?',
        )
          .bind(body.slug, await hash(body.editKey), body.revision)
          .first<{data: string; revision: number; updated_at: string}>();
        if (!source)
          return jsonResponse(
            {error: 'Save the latest room before requesting a price.'},
            409,
          );
        const requestHash = await hash(
          JSON.stringify([
            body.slug,
            body.revision,
            body.senderName,
            body.senderEmail,
            body.consent,
            body.consent ? body.senderPhone?.trim() || null : null,
          ]),
        );
        const old = await env.DB.prepare(
          'SELECT request_hash, estimate_data FROM room_price_requests WHERE request_id = ?',
        )
          .bind(body.requestId)
          .first<{request_hash: string; estimate_data: string}>();
        if (old && old.request_hash !== requestHash)
          return jsonResponse(
            {error: 'Details changed. Close and reopen the price form.'},
            409,
          );
        let estimateData = old?.estimate_data;
        if (!estimateData) {
          const response = await projectEstimate(env, body.slug, source);
          if (!response.ok) return response;
          estimateData = await response.text();
        }
        const now = new Date().toISOString();
        await env.DB.prepare(
          'INSERT OR IGNORE INTO room_price_requests (request_id,request_hash,room_slug,room_revision,study_data,estimate_data,contact_consent,created_at) VALUES (?,?,?,?,?,?,?,?)',
        )
          .bind(
            body.requestId,
            requestHash,
            body.slug,
            body.revision,
            source.data,
            estimateData,
            body.consent ? 1 : 0,
            now,
          )
          .run();
        const reserved = await env.DB.prepare(
          'SELECT request_hash, estimate_data FROM room_price_requests WHERE request_id = ?',
        )
          .bind(body.requestId)
          .first<{request_hash: string; estimate_data: string}>();
        if (reserved?.request_hash !== requestHash)
          return jsonResponse(
            {error: 'Details changed. Close and reopen the price form.'},
            409,
          );
        if (body.consent)
          await env.DB.prepare(
            "INSERT OR IGNORE INTO cabinet_leads (request_id,sender_name,sender_email,room_slug,consent_text,consent_version,consent_at,sender_phone,lead_source) VALUES (?,?,?,?,?,?,?,?, 'price')",
          )
            .bind(
              `price:${body.requestId}`,
              body.senderName,
              body.senderEmail,
              body.slug,
              CONTACT_CONSENT,
              '2026-09-06-v1',
              now,
              body.senderPhone?.trim() || null,
            )
            .run();
        await recordEvent(
          env.DB,
          'price',
          body.requestId,
          analyticsSession,
          body.slug,
        );
        if (body.consent)
          await recordEvent(
            env.DB,
            'lead',
            `price:${body.requestId}`,
            analyticsSession,
            body.slug,
          );
        return jsonResponse(JSON.parse(reserved.estimate_data));
      }
      if (new URL(request.url).pathname === '/price') {
        if (request.method !== 'GET')
          return jsonResponse({error: 'Method not allowed'}, 405);
        if (!slug)
          return jsonResponse({error: 'Project slug is required'}, 400);
        const row = await env.DB.prepare(
          'SELECT data, revision, updated_at FROM rooms WHERE slug = ?',
        )
          .bind(slug)
          .first<{data: string; revision: number; updated_at: string}>();
        if (!row) return jsonResponse({error: 'Room not found'}, 404);
        return projectEstimate(env, slug, row);
      }
      if (
        new URL(request.url).pathname === '/share' &&
        request.method === 'POST'
      ) {
        const body = await readLimited(request);
        const analyticsSession = sessionId(body.analyticsSessionId);
        if (!validShare(body))
          return jsonResponse({error: 'Please check the sharing form.'}, 400);
        if (
          !env.SHARES ||
          !(
            await env.SHARES.limit({
              key: request.headers.get('X-Client-IP') || 'unknown',
            })
          ).success
        )
          return jsonResponse(
            {error: 'Sharing limit reached. Please try again later.'},
            429,
          );
        const source = await env.DB.prepare(
          'SELECT data FROM rooms WHERE slug = ? AND edit_hash = ? AND revision = ?',
        )
          .bind(body.slug, await hash(body.editKey), body.revision)
          .first<{data: string}>();
        if (!source)
          return jsonResponse(
            {error: 'Save the latest room before sharing.'},
            409,
          );
        const requestHash = await hash(
          JSON.stringify([
            body.slug,
            body.revision,
            body.senderName,
            body.senderEmail,
            body.recipientName,
            body.recipientEmail,
            body.consent,
            ...(body.consent && body.senderPhone?.trim()
              ? [body.senderPhone.trim()]
              : []),
          ]),
        );
        let shareSlug = (
          await hash(`share:${env.SERVICE_TOKEN}:${body.requestId}`)
        ).slice(0, 32);
        const now = new Date().toISOString();
        await env.DB.prepare(
          'INSERT OR IGNORE INTO room_shares (request_id, request_hash, room_slug, created_at) VALUES (?, ?, ?, ?)',
        )
          .bind(body.requestId, requestHash, shareSlug, now)
          .run();
        const reserved = await env.DB.prepare(
          'SELECT request_hash, room_slug FROM room_shares WHERE request_id = ?',
        )
          .bind(body.requestId)
          .first<{request_hash: string; room_slug: string}>();
        if (reserved?.request_hash !== requestHash)
          return jsonResponse(
            {
              error:
                'Sharing details changed. Close and reopen Share to send a new invitation.',
            },
            409,
          );
        shareSlug = reserved.room_slug;
        // Immutable snapshot: the edit key is random and never returned to any client.
        await env.DB.prepare(
          'INSERT OR IGNORE INTO rooms (slug, edit_hash, data, revision, updated_at) VALUES (?, ?, ?, 1, ?)',
        )
          .bind(shareSlug, await hash(crypto.randomUUID()), source.data, now)
          .run();
        if (body.consent)
          await env.DB.prepare(
            'INSERT OR IGNORE INTO cabinet_leads (request_id, sender_name, sender_email, room_slug, consent_text, consent_version, consent_at, sender_phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
            .bind(
              body.requestId,
              body.senderName,
              body.senderEmail,
              shareSlug,
              CONTACT_CONSENT,
              '2026-09-06-v1',
              now,
              body.senderPhone?.trim() || null,
            )
            .run();
        await recordEvent(
          env.DB,
          'share',
          body.requestId,
          analyticsSession,
          shareSlug,
        );
        if (body.consent)
          await recordEvent(
            env.DB,
            'lead',
            body.requestId,
            analyticsSession,
            shareSlug,
          );
        return jsonResponse({shareSlug});
      }
      if (request.method === 'GET' && slug) {
        const row = await env.DB.prepare(
          'SELECT data, revision, updated_at FROM rooms WHERE slug = ?',
        )
          .bind(slug)
          .first<{data: string; revision: number; updated_at: string}>();
        return row
          ? jsonResponse({
              slug,
              study: JSON.parse(row.data),
              revision: row.revision,
              updatedAt: row.updated_at,
            })
          : jsonResponse({error: 'Room not found'}, 404);
      }
      if (!['POST', 'PUT'].includes(request.method))
        return jsonResponse({error: 'Method not allowed'}, 405);
      if (
        !(
          await env.WRITES.limit({
            key: request.headers.get('X-Client-IP') || 'unknown',
          })
        ).success
      )
        return jsonResponse(
          {error: 'Too many saves. Please wait a minute.'},
          429,
        );
      const body = await readLimited(request);
      if (!validStudy(body.study))
        return jsonResponse({error: 'Invalid room configuration'}, 400);
      const now = new Date().toISOString();
      if (request.method === 'POST' && !slug) {
        const newSlug = crypto.randomUUID().replaceAll('-', '');
        const editKey = crypto.randomUUID() + crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO rooms (slug, edit_hash, data, revision, updated_at) VALUES (?, ?, ?, 1, ?)',
        )
          .bind(newSlug, await hash(editKey), JSON.stringify(body.study), now)
          .run();
        await recordEvent(
          env.DB,
          'design',
          newSlug,
          body.analyticsSessionId,
          newSlug,
        );
        return jsonResponse(
          {slug: newSlug, editKey, revision: 1, updatedAt: now},
          201,
        );
      }
      if (
        !slug ||
        typeof body.editKey !== 'string' ||
        body.editKey.length > 100 ||
        !Number.isInteger(body.revision)
      )
        return jsonResponse({error: 'Invalid save request'}, 400);
      const result = await env.DB.prepare(
        'UPDATE rooms SET data = ?, revision = revision + 1, updated_at = ? WHERE slug = ? AND edit_hash = ? AND revision = ?',
      )
        .bind(
          JSON.stringify(body.study),
          now,
          slug,
          await hash(body.editKey),
          body.revision,
        )
        .run();
      if (!result.meta.changes)
        return jsonResponse(
          {
            error:
              'This room changed in another tab, or its edit key is unavailable. Use Copy to new to preserve your changes.',
          },
          409,
        );
      return jsonResponse({slug, revision: body.revision + 1, updatedAt: now});
    } catch {
      return jsonResponse({error: 'Unable to save or load this room'}, 400);
    }
  },
};
