import {useEffect, useRef, useState} from 'react';
import {useNonce} from '@shopify/hydrogen';
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
  const [attempt, setAttempt] = useState(0);
  const [verificationError, setVerificationError] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(true);
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
    if (!mount.current || !siteKey || sent) return;
    setToken('');
    setVerificationError('');
    let disposed = false;
    let rendered = false;
    let script: HTMLScriptElement | undefined;
    const fail = () => {
      if (disposed) return;
      setToken('');
      setVerificationError(
        'Verification could not complete. Please retry. If it keeps failing, check your connection or content blocker.',
      );
    };
    const timeout = window.setTimeout(fail, 30000);
    const initialize = () => {
      const service = api();
      if (disposed || rendered || !service || !mount.current) return;
      rendered = true;
      try {
        widget.current = service.render(mount.current, {
          sitekey: siteKey,
          action: 'cabinet-share',
          callback: (value: string) => {
            if (disposed) return;
            window.clearTimeout(timeout);
            setVerificationError('');
            setToken(value);
          },
          // Turnstile requires these hyphenated callback names.
          'expired-callback': fail,
          'error-callback': fail,
        });
      } catch {
        fail();
      }
    };
    // A script rendered by React after opening a dialog may be inert. Append a
    // real script element, and also handle a library already loading elsewhere.
    if (
      !api() &&
      !document.querySelector(
        'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
      )
    ) {
      script = document.createElement('script');
      script.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      if (nonce) script.nonce = nonce;
      script.addEventListener('error', fail);
      document.head.appendChild(script);
    }
    initialize();
    const poll = window.setInterval(initialize, 100);
    return () => {
      disposed = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      script?.removeEventListener('error', fail);
      script?.remove();
      if (widget.current) api()?.remove(widget.current);
      widget.current = undefined;
    };
  }, [attempt, siteKey, nonce, sent]);
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
            if (busy || !token) return;
            const form = new FormData(event.currentTarget);
            setBusy(true);
            setError('');
            void send({
              senderName: String(form.get('senderName')).trim(),
              senderEmail: String(form.get('senderEmail')).trim(),
              recipientName: String(form.get('recipientName')).trim(),
              recipientEmail: String(form.get('recipientEmail')).trim(),
              consent: form.get('consent') === 'on',
              ...(form.get('consent') === 'on' && form.get('senderPhone')
                ? {senderPhone: String(form.get('senderPhone')).trim()}
                : {}),
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
                setAttempt((value) => value + 1);
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
              <input
                name="consent"
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.currentTarget.checked)}
              />
              {CONTACT_CONSENT}
            </label>
            {consent && (
              <label>
                Phone number (optional)
                <input
                  name="senderPhone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={40}
                />
              </label>
            )}
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
          {siteKey && !token && !verificationError && (
            <p role="status">Waiting for security verification…</p>
          )}
          {verificationError && (
            <>
              <p role="alert">{verificationError}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAttempt((value) => value + 1)}
              >
                Retry verification
              </button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <button type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !token}>
            {busy ? 'Sending…' : 'Send design'}
          </button>
        </form>
      )}
    </dialog>
  );
}
