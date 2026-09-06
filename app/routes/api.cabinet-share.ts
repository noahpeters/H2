import type {ActionFunctionArgs} from 'react-router';
import {Resend} from 'resend';
import {
  jsonResponse,
  readLimited,
} from '~/studio/cabinet-configurator/savedRoomProtocol';
import {validShare} from '~/studio/cabinet-configurator/shareProtocol';

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST')
    return jsonResponse({error: 'Method not allowed'}, 405);
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin)
    return jsonResponse({error: 'Invalid origin'}, 403);
  const env = context.env as unknown as Record<string, string | undefined>;
  if (
    !env.RESEND_API_KEY ||
    !env.CONTACT_FROM_EMAIL ||
    !env.TURNSTILE_SECRET_KEY ||
    !env.CABINET_ROOMS_URL ||
    !env.CABINET_ROOMS_TOKEN
  )
    return jsonResponse(
      {error: 'Email sharing is unavailable. Please try again later.'},
      503,
    );
  try {
    const body = await readLimited(request);
    if (!validShare(body))
      return jsonResponse(
        {error: 'Please enter valid names and email addresses.'},
        400,
      );
    // Never forward a phone number without contact consent, even from a crafted request.
    if (!body.consent) delete body.senderPhone;
    const token = (body as any).turnstileToken;
    if (typeof token !== 'string' || token.length > 2048)
      return jsonResponse({error: 'Please complete verification.'}, 400);
    const verification = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET_KEY,
          response: token,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const result = (await verification.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
    };
    if (
      !result.success ||
      result.hostname !== url.hostname ||
      result.action !== 'cabinet-share'
    )
      return jsonResponse({error: 'Verification failed. Please retry.'}, 400);
    const stored = await fetch(new URL('/share', env.CABINET_ROOMS_URL), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CABINET_ROOMS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Client-IP': request.headers.get('oxygen-buyer-ip') || 'unknown',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await stored.json()) as {shareSlug?: string; error?: string};
    if (!stored.ok)
      return jsonResponse(
        {error: data.error || 'Unable to prepare sharing.'},
        stored.status,
      );
    if (!data.shareSlug || !/^[a-f0-9]{32}$/.test(data.shareSlug))
      throw new Error('Invalid share response');
    const link = `${url.origin}/cabinet-configurator?design=${data.shareSlug}`;
    const escape = (s: string) =>
      s.replace(
        /[&<>"']/g,
        (c) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[c]!,
      );
    const email = await new Resend(env.RESEND_API_KEY).emails.send(
      {
        from: env.CONTACT_FROM_EMAIL,
        to: body.recipientEmail,
        subject: 'A cabinet design shared with you — From Trees',
        text: `Hello ${body.recipientName},\n\n${body.senderName} (${body.senderEmail}) asked From Trees to share a cabinet design with you.\n\nOpen your own copy: ${link}\n\nYou have not been subscribed to marketing. If this was unexpected, you can ignore this email.`,
        html: `<p>Hello ${escape(body.recipientName)},</p><p>${escape(body.senderName)} (${escape(body.senderEmail)}) asked From Trees to share a cabinet design with you.</p><p><a href="${escape(link)}">Open design</a></p><p>This opens your own copy. You have not been subscribed to marketing. If this was unexpected, you can ignore this email.</p>`,
      },
      {idempotencyKey: `cabinet-share-${body.requestId}`},
    );
    if (email.error)
      return jsonResponse(
        {error: 'The email could not be sent. Please retry.'},
        502,
      );
    return jsonResponse({ok: true});
  } catch {
    return jsonResponse(
      {error: 'Unable to send the email. Please retry.'},
      503,
    );
  }
}
