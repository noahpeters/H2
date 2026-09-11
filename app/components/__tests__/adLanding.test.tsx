import {beforeEach, describe, expect, it, vi} from 'vitest';
import {render, cleanup} from '@testing-library/react';
import {StrictMode} from 'react';
const state = vi.hoisted(() => ({
  path: '/inquire/furniture',
  receipt: null as null | {eventId: string; kind: string},
}));
const send = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    emails = {send};
  },
}));
vi.mock('react-router', async (original) => ({
  ...(await original<typeof import('react-router')>()),
  useLocation: () => ({pathname: state.path}),
  useRouteLoaderData: () => ({projectReceipt: state.receipt}),
}));
import {MetaPixel, META_PIXEL_ID} from '../MetaPixel';
import {action} from '../../routes/inquire.$kind';
import {action as contactAction} from '../../routes/contact';

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  state.path = '/inquire/furniture';
  state.receipt = null;
  window.fbq = vi.fn<(...args: unknown[]) => void>();
  window.__metaPixelInitialized = false;
  document.querySelectorAll('script').forEach((s) => s.remove());
  sessionStorage.clear();
  send.mockReset();
});
describe('landing pixel', () => {
  it('initializes the correct dataset and tracks each actual page once, including client navigation', () => {
    const view = render(
      <StrictMode>
        <MetaPixel />
      </StrictMode>,
    );
    expect(window.fbq).toHaveBeenCalledWith('init', META_PIXEL_ID);
    expect(window.fbq?.disablePushState).toBe(true);
    expect(
      vi.mocked(window.fbq!).mock.calls.filter((c) => c[2] === 'PageView'),
    ).toHaveLength(1);
    state.path = '/inquire/designers';
    view.rerender(
      <StrictMode>
        <MetaPixel />
      </StrictMode>,
    );
    expect(
      vi.mocked(window.fbq!).mock.calls.filter((c) => c[2] === 'PageView'),
    ).toHaveLength(2);
    expect(
      document.querySelectorAll('script[src*="fbevents.js"]'),
    ).toHaveLength(1);
  });
  it('tracks an accepted receipt only once and sends no contact details', () => {
    state.path = '/';
    state.receipt = {eventId: 'accepted-test-1', kind: 'designers'};
    const view = render(
      <StrictMode>
        <MetaPixel />
      </StrictMode>,
    );
    view.rerender(
      <StrictMode>
        <MetaPixel />
      </StrictMode>,
    );
    const leads = vi
      .mocked(window.fbq!)
      .mock.calls.filter((c) => c[2] === 'Lead');
    expect(leads).toEqual([
      [
        'trackSingle',
        META_PIXEL_ID,
        'Lead',
        {content_name: 'designers'},
        {eventID: 'accepted-test-1'},
      ],
    ]);
  });
  it('does not track without an accepted receipt', () => {
    render(<MetaPixel />);
    expect(vi.mocked(window.fbq!).mock.calls.some((c) => c[2] === 'Lead')).toBe(
      false,
    );
  });
});
const submissionId = '00000000-0000-4000-8000-000000000001';
function args(overrides: Record<string, string> = {}) {
  const form = new FormData();
  Object.entries({
    name: 'Test',
    email: 'test@example.com',
    projectType: 'Custom furniture',
    location: 'Orange County',
    message: 'Controlled test inquiry',
    'cf-turnstile-response': 'test-token',
    submissionId,
    ...overrides,
  }).forEach(([k, v]) => form.set(k, v));
  return {
    request: new Request('https://from-trees.com/inquire/furniture', {
      method: 'POST',
      body: form,
    }),
    params: {kind: 'furniture'},
    context: {
      env: {
        RESEND_API_KEY: 'test',
        CONTACT_TO_EMAIL: 'test@example.com',
        CONTACT_FROM_EMAIL: 'test@example.com',
        TURNSTILE_SECRET_KEY: 'test',
      },
      session: {set: vi.fn()},
    },
  } as unknown as Parameters<typeof action>[0];
}
describe('submission receipt', () => {
  it('makes a successful standard contact submission available to global Lead tracking', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"success":true}')),
    );
    send.mockResolvedValue({data: {id: 'contact-email-id'}, error: null});
    const input = args();
    input.request = new Request(
      'https://from-trees.com/contact',
      input.request,
    );
    expect(await contactAction(input)).toEqual({
      ok: true,
      eventId: submissionId,
    });
    expect(input.context.session.set).toHaveBeenLastCalledWith(
      'projectReceipt',
      {
        eventId: submissionId,
        kind: 'contact',
      },
    );
    state.path = '/contact';
    state.receipt = {eventId: submissionId, kind: 'contact'};
    const view = render(<MetaPixel />);
    view.rerender(<MetaPixel />);
    expect(
      vi.mocked(window.fbq!).mock.calls.filter((c) => c[2] === 'Lead'),
    ).toEqual([
      [
        'trackSingle',
        META_PIXEL_ID,
        'Lead',
        {content_name: 'contact'},
        {eventID: submissionId},
      ],
    ]);
  });
  it('redirects to home only after email acceptance and stores a non-PII receipt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"success":true}')),
    );
    send.mockResolvedValue({data: {id: 'email-id'}, error: null});
    const input = args();
    const result = await action(input);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(303);
    expect((result as Response).headers.get('Location')).toBe('/');
    expect(input.context.session.set).toHaveBeenLastCalledWith(
      'projectReceipt',
      {
        eventId: submissionId,
        kind: 'furniture',
      },
    );
    expect(send.mock.calls[0][1]).toEqual({
      idempotencyKey: `project-${submissionId}`,
    });
  });
  it('does not mark a Resend error response as success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"success":true}')),
    );
    send.mockResolvedValue({data: null, error: {message: 'rejected'}});
    const input = args();
    const result = await action(input);
    expect(result).not.toBeInstanceOf(Response);
    expect(input.context.session.set).not.toHaveBeenCalled();
  });
  it('does not send or count invalid forms or honeypots', async () => {
    for (const values of [{email: 'bad'}, {company: 'bot'}] as Record<
      string,
      string
    >[]) {
      const input = args(values);
      await action(input);
      expect(input.context.session.set).not.toHaveBeenCalled();
    }
    expect(send).not.toHaveBeenCalled();
  });
  it('does not count a failed challenge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"success":false}')),
    );
    const input = args();
    await action(input);
    expect(send).not.toHaveBeenCalled();
    expect(input.context.session.set).not.toHaveBeenCalled();
  });
});
