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
interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<{meta: {changes: number}}>;
}
interface Env {
  DB: {prepare(sql: string): Statement};
  SERVICE_TOKEN: string;
  WRITES: {limit(options: {key: string}): Promise<{success: boolean}>};
  SHARES?: {limit(options: {key: string}): Promise<{success: boolean}>};
}
const hash = async (key: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (
      !env.SERVICE_TOKEN ||
      request.headers.get('Authorization') !== `Bearer ${env.SERVICE_TOKEN}`
    )
      return jsonResponse({error: 'Unauthorized'}, 401);
    const slug = new URL(request.url).searchParams.get('slug');
    if (slug && !SLUG.test(slug))
      return jsonResponse({error: 'Invalid room link'}, 400);
    try {
      if (
        new URL(request.url).pathname === '/share' &&
        request.method === 'POST'
      ) {
        const body = await readLimited(request);
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
            'INSERT OR IGNORE INTO cabinet_leads (request_id, sender_name, sender_email, room_slug, consent_text, consent_version, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
            .bind(
              body.requestId,
              body.senderName,
              body.senderEmail,
              shareSlug,
              CONTACT_CONSENT,
              '2026-09-06-v1',
              now,
            )
            .run();
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
