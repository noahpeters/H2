import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {ShareRoomForm} from './ShareRoomForm';
vi.mock('@shopify/hydrogen', () => ({useNonce: () => 'test-nonce'}));
beforeEach(() => {
  vi.useFakeTimers();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
});
afterEach(() => {
  cleanup();
  delete (window as any).turnstile;
  vi.useRealTimers();
});
it('requires the price form but not contact consent and only shows the range after submission', async () => {
  let options: any;
  (window as any).turnstile = {
    render: (_el: unknown, config: unknown) => {
      options = config;
      return 'widget';
    },
    remove: vi.fn(),
  };
  const send = vi.fn(async (_details: Record<string, unknown>) => ({
    currency: 'USD' as const,
    range: {low: 5500, high: 6500},
    scope: 'Cabinetry',
    assumptions: [],
    exclusions: ['installation', 'delivery', 'tax'],
    estimateOnly: true,
  }));
  const {container} = render(
    <ShareRoomForm
      purpose="price"
      siteKey="test"
      send={send}
      close={vi.fn()}
    />,
  );
  expect(options.action).toBe('cabinet-price');
  expect(screen.queryByText(/\$5,500/)).toBeNull();
  expect(screen.queryByLabelText('Recipient name')).toBeNull();
  expect(screen.getByLabelText('Your name')).toBeRequired();
  expect(screen.getByLabelText('Your email')).toBeRequired();
  fireEvent.change(screen.getByLabelText('Your name'), {
    target: {value: 'Example'},
  });
  fireEvent.change(screen.getByLabelText('Your email'), {
    target: {value: 'example@example.com'},
  });
  fireEvent.click(screen.getByRole('checkbox'));
  act(() => {
    options.callback('verified');
  });
  await act(async () => {
    fireEvent.submit(container.querySelector('form')!);
  });
  expect(send.mock.calls[0][0]).toMatchObject({
    senderName: 'Example',
    consent: false,
  });
  expect(send.mock.calls[0][0]).not.toHaveProperty('recipientEmail');
  expect(send.mock.calls[0][0]).not.toHaveProperty('senderPhone');
  expect(screen.getByRole('status')).toHaveTextContent('$5,500 – $6,500');
});
it('loads an executable script after opening and enables sending only after verification', () => {
  render(<ShareRoomForm siteKey="test" send={vi.fn()} close={vi.fn()} />);
  const script = document.head.querySelector(
    'script[src*="turnstile"]',
  ) as HTMLScriptElement;
  expect(script).not.toBeNull();
  expect(script.nonce).toBe('test-nonce');
  expect(screen.getByRole('button', {name: 'Send design'})).toBeDisabled();
  let options: any;
  const remove = vi.fn();
  (window as any).turnstile = {
    render: vi.fn((_el, config) => {
      options = config;
      return 'widget';
    }),
    remove,
  };
  act(() => {
    vi.advanceTimersByTime(100);
  });
  act(() => {
    options.callback('verified');
  });
  expect(screen.getByRole('button', {name: 'Send design'})).toBeEnabled();
  act(() => {
    options['expired-callback']();
  });
  expect(screen.getByRole('button', {name: 'Send design'})).toBeDisabled();
  expect(
    screen.getByRole('button', {name: 'Retry verification'}),
  ).toBeVisible();
  cleanup();
  expect(remove).toHaveBeenCalledWith('widget');
  expect(document.head.contains(script)).toBe(false);
});
it('shows failure and retries blocked script loading without losing form details', () => {
  render(<ShareRoomForm siteKey="test" send={vi.fn()} close={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Your name'), {
    target: {value: 'Example'},
  });
  act(() => {
    vi.advanceTimersByTime(30000);
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Verification could not complete',
  );
  fireEvent.click(screen.getByRole('button', {name: 'Retry verification'}));
  expect(screen.getByLabelText('Your name')).toHaveValue('Example');
  expect(screen.getByRole('status')).toHaveTextContent('Waiting');
  fireEvent.error(document.head.querySelector('script[src*="turnstile"]')!);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Verification could not complete',
  );
});
it('only submits a phone number while contact consent is checked', () => {
  let options: any;
  (window as any).turnstile = {
    render: (_el: unknown, config: unknown) => {
      options = config;
      return 'widget';
    },
    remove: vi.fn(),
  };
  const send = vi.fn(
    (_details: Record<string, unknown>) => new Promise<void>(() => {}),
  );
  const {container} = render(
    <ShareRoomForm siteKey="test" send={send} close={vi.fn()} />,
  );
  act(() => {
    options.callback('verified');
  });
  fireEvent.change(screen.getByLabelText('Phone number (optional)'), {
    target: {value: '+1 555 123 4567'},
  });
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.queryByLabelText('Phone number (optional)')).toBeNull();
  fireEvent.submit(container.querySelector('form')!);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({consent: false}));
  expect(send.mock.calls[0][0]).not.toHaveProperty('senderPhone');
});
