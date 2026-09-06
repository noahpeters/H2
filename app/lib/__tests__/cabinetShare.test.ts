// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest';
const send = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    emails = {send};
  },
}));
import {action} from '../../routes/api.cabinet-share';
const details = {
  senderName: 'A <B>',
  senderEmail: 'sender@example.com',
  recipientName: 'Recipient',
  recipientEmail: 'recipient@example.com',
  consent: false,
  senderPhone: '+1 555 123 4567',
  requestId: '12345678-1234-1234-1234-123456789012',
  slug: 'a'.repeat(32),
  editKey: 'private-key',
  revision: 1,
  turnstileToken: 'test-token',
};
const env = {
  RESEND_API_KEY: 'test',
  CONTACT_FROM_EMAIL: 'test@example.com',
  TURNSTILE_SECRET_KEY: 'test',
  CABINET_ROOMS_URL: 'https://api.test',
  CABINET_ROOMS_TOKEN: 'test',
};
function call(body = details, origin = 'https://from-trees.com') {
  return action({
    request: new Request('https://from-trees.com/api/cabinet-share', {
      method: 'POST',
      headers: {Origin: origin, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    }),
    context: {env},
    params: {},
  } as any);
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe('cabinet share email endpoint', () => {
  it('sends an escaped invitation without exposing edit credentials and uses idempotency', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            success: true,
            hostname: 'from-trees.com',
            action: 'cabinet-share',
          }),
        )
        .mockResolvedValueOnce(Response.json({shareSlug: 'b'.repeat(32)})),
    );
    send.mockResolvedValue({data: {id: 'email-1'}, error: null});
    expect((await call()).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const [message, options] = send.mock.calls[0];
    expect(message.to).toBe(details.recipientEmail);
    expect(message.html).toContain('A &lt;B&gt;');
    expect(message.html).toContain('Open design');
    expect(JSON.stringify(message)).not.toContain(details.senderPhone);
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string),
    ).not.toHaveProperty('senderPhone');
    expect(JSON.stringify(message)).not.toContain(details.editKey);
    expect(options.idempotencyKey).toBe(`cabinet-share-${details.requestId}`);
  });
  it('fails closed for origin, validation, verification, and provider errors', async () => {
    expect((await call(details, 'https://evil.test')).status).toBe(403);
    expect((await call({...details, recipientEmail: 'invalid'})).status).toBe(
      400,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({success: false})),
    );
    expect((await call()).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            success: true,
            hostname: 'from-trees.com',
            action: 'cabinet-share',
          }),
        )
        .mockResolvedValueOnce(Response.json({shareSlug: 'b'.repeat(32)})),
    );
    send.mockResolvedValue({error: {message: 'rejected'}});
    expect((await call()).status).toBe(502);
  });
});
