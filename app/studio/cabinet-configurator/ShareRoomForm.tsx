import {useEffect, useRef, useState} from 'react';
import {Script, useNonce} from '@shopify/hydrogen';
import {CONTACT_CONSENT} from './shareProtocol';
type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
export function ShareRoomForm({
  siteKey,
  send,
  close,
}: {
  siteKey: string;
  send: (details: Record<string, unknown>) => Promise<void>;
  close: () => void;
}) {
  const nonce = useNonce();
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const widget = useRef<string>();
  const mount = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const api = () => (window as Window & {turnstile?: Turnstile}).turnstile;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const service = api();
    if (!service || !mount.current || !siteKey) return;
    widget.current = service.render(mount.current, {
      sitekey: siteKey,
      action: 'cabinet-share',
      callback: setToken,
      // Turnstile requires these hyphenated callback names.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'expired-callback': () => setToken(''),
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'error-callback': () => setToken(''),
    });
    return () => {
      if (widget.current) service.remove(widget.current);
    };
  }, [loaded, siteKey]);
  return (
    <dialog
      ref={dialog}
      className="cc-share-dialog"
      aria-labelledby="cc-share-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <h2 id="cc-share-title">Share your cabinet design</h2>
      {sent ? (
        <>
          <p role="status">Your design email has been accepted for delivery.</p>
          <button onClick={close}>Done</button>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            setError('');
            void send({
              senderName: String(form.get('senderName')).trim(),
              senderEmail: String(form.get('senderEmail')).trim(),
              recipientName: String(form.get('recipientName')).trim(),
              recipientEmail: String(form.get('recipientEmail')).trim(),
              consent: form.get('consent') === 'on',
              requestId: requestId.current,
              turnstileToken: token,
            })
              .then(() => setSent(true))
              .catch((e: unknown) => {
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Unable to send. Please retry.',
                );
                setToken('');
                if (widget.current) api()?.reset(widget.current);
              })
              .finally(() => setBusy(false));
          }}
        >
          <fieldset disabled={busy}>
            <legend>Your details</legend>
            <label>
              Your name
              <input
                name="senderName"
                autoComplete="name"
                required
                maxLength={100}
              />
            </label>
            <label>
              Your email
              <input
                name="senderEmail"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
            <label className="cc-share-consent">
              <input name="consent" type="checkbox" defaultChecked />
              {CONTACT_CONSENT}
            </label>
            <p>
              Your details are saved as a lead only if this is checked. Sharing
              works either way.
            </p>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Send to</legend>
            <label>
              Recipient name
              <input
                name="recipientName"
                autoComplete="off"
                required
                maxLength={100}
              />
            </label>
            <label>
              Recipient email
              <input
                name="recipientEmail"
                type="email"
                autoComplete="off"
                required
                maxLength={254}
              />
            </label>
            <p>
              Your name and email will be included in the invitation. Recipient
              details are used for delivery, not added as leads. Please share
              only with someone who expects this email.
            </p>
          </fieldset>
          <div ref={mount} />
          {!siteKey && <p role="alert">Email sharing is not configured yet.</p>}
          {error && <p role="alert">{error}</p>}
          <button type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !token}>
            {busy ? 'Sending…' : 'Send design'}
          </button>
        </form>
      )}
      {siteKey && (
        <Script
          nonce={nonce}
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          onLoad={() => setLoaded(true)}
        />
      )}
    </dialog>
  );
}
