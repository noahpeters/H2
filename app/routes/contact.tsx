import {Form, useActionData, useLoaderData, useNavigation} from 'react-router';
import type {Route} from './+types/contact';
import {Script} from '@shopify/hydrogen';
import {Resend} from 'resend';
import {useCallback, useEffect, useRef} from 'react';
import stylex from '~/lib/stylex';

type LoaderData = {
  turnstileSiteKey: string;
};

interface Env {
  TURNSTILE_SITE_KEY?: string;
  RESEND_API_KEY?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  TURNSTILE_SECRET_KEY?: string;
}

type ActionData =
  | {ok: true}
  | {ok: false; fieldErrors: Record<string, string>; formError?: string};

export const meta: Route.MetaFunction = () => {
  return [{title: 'Contact'}];
};

export async function loader({context}: Route.LoaderArgs): Promise<LoaderData> {
  // Public key is safe to expose to the browser
  const turnstileSiteKey = (context.env as Env).TURNSTILE_SITE_KEY;

  if (!turnstileSiteKey) {
    // Fail loudly in dev / logs; page can still render but captcha won't.
    console.warn('TURNSTILE_SITE_KEY is not set');
  }

  return {turnstileSiteKey: turnstileSiteKey ?? ''};
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function verifyTurnstile(args: {
  token: string;
  secret: string;
  ip?: string;
}) {
  const body = new URLSearchParams();
  body.set('secret', args.secret);
  body.set('response', args.token);
  if (args.ip) body.set('remoteip', args.ip);

  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      body,
    },
  );

  if (!res.ok) return false;

  const data = (await res.json()) as {success?: boolean};
  return !!data.success;
}

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<ActionData> {
  const form = await request.formData();

  // Honeypot (bots fill hidden fields)
  const company = String(form.get('company') || '');
  if (company) return {ok: true};

  const name = String(form.get('name') || '').trim();
  const email = String(form.get('email') || '').trim();
  const message = String(form.get('message') || '').trim();
  const token = String(form.get('cf-turnstile-response') || '');

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = 'Please enter your name.';
  if (!email || !isValidEmail(email))
    fieldErrors.email = 'Please enter a valid email.';
  if (!message || message.length < 10)
    fieldErrors.message = 'Please enter a message (10+ characters).';
  if (!token) fieldErrors.turnstile = 'Please complete the verification.';

  if (Object.keys(fieldErrors).length) {
    return {ok: false, fieldErrors};
  }

  const resendKey = (context.env as Env).RESEND_API_KEY;
  const to = (context.env as Env).CONTACT_TO_EMAIL;
  const from = (context.env as Env).CONTACT_FROM_EMAIL;
  const turnstileSecret = (context.env as Env).TURNSTILE_SECRET_KEY;

  if (!resendKey || !to || !from || !turnstileSecret) {
    console.error('Missing env vars for contact form');
    return {
      ok: false,
      fieldErrors: {},
      formError:
        'Contact form is not configured correctly. Please try again later.',
    };
  }

  // Best-effort IP for Turnstile; Oxygen usually sets CF-Connecting-IP
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    undefined;

  const captchaOk = await verifyTurnstile({
    token,
    secret: turnstileSecret,
    ip,
  });

  if (!captchaOk) {
    return {
      ok: false,
      fieldErrors: {turnstile: 'Verification failed. Please try again.'},
    };
  }

  try {
    const resend = new Resend(resendKey);

    const result = await resend.emails.send({
      from,
      to,
      replyTo: email, // so replying goes to the customer
      subject: `Contact form: ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    });

    return {ok: true};
  } catch (err) {
    console.error('Contact email send failed', err);
    return {
      ok: false,
      fieldErrors: {},
      formError: 'Something went wrong sending your message. Please try again.',
    };
  }
}

const styles = stylex.create({
  formContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '2rem',
  },
  form: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    color: 'var(--color-primary)',
  },
  field: {
    width: '40vw',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'var(--color-primary)',
    borderStyle: 'solid',
    backgroundColor: 'var(--color-light)',
    color: 'var(--color-primary)',
    padding: 6,
    fontSize: '1rem',
    '@media (max-width: 640px)': {
      width: '90vw',
    },
  },
  button: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-light)',
    borderStyle: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 'bold',
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
});

export default function ContactPage() {
  const {turnstileSiteKey} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const busy = nav.state !== 'idle';

  const renderTurnstile = useCallback(() => {
    const turnstile = (
      window as Window & {
        turnstile?: {
          render: (
            element: HTMLElement,
            options: {sitekey: string},
          ) => string;
        };
      }
    ).turnstile;

    if (!turnstile || !turnstileRef.current || widgetIdRef.current) return;

    widgetIdRef.current = turnstile.render(turnstileRef.current, {
      sitekey: turnstileSiteKey,
    });
  }, [turnstileSiteKey]);

  useEffect(() => {
    if (!turnstileSiteKey || !turnstileRef.current) return;
    if ((window as Window & {turnstile?: unknown}).turnstile) {
      renderTurnstile();
    }
  }, [renderTurnstile, turnstileSiteKey]);

  if (actionData?.ok) {
    return (
      <div className="page">
        <h1>Thanks!</h1>
        <p>Your message has been sent. I’ll get back to you soon.</p>
      </div>
    );
  }

  const fieldErrors =
    actionData && !actionData.ok ? actionData.fieldErrors : {};
  const formError =
    actionData && !actionData.ok ? actionData.formError : undefined;

  return (
    <div className={stylex(styles.formContainer)}>
      <h1 className={stylex(styles.form)}>Contact</h1>

      {formError && <p style={{color: 'red'}}>{formError}</p>}
      <br />
      <Form method="post" className={stylex(styles.form)}>
        {/* Honeypot */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{position: 'absolute', left: '-10000px'}}
        />

        <label>
          Name
          <br />
          <input
            name="name"
            autoComplete="name"
            className={stylex(styles.field)}
          />
        </label>
        {fieldErrors?.name && <p style={{color: 'red'}}>{fieldErrors.name}</p>}
        <br />
        <label>
          Email
          <br />
          <input
            name="email"
            type="email"
            autoComplete="email"
            className={stylex(styles.field)}
          />
        </label>
        {fieldErrors?.email && (
          <p style={{color: 'red'}}>{fieldErrors.email}</p>
        )}
        <br />
        <label>
          Message
          <br />
          <textarea name="message" rows={15} className={stylex(styles.field)} />
        </label>
        <br />
        {fieldErrors?.message && (
          <p style={{color: 'red'}}>{fieldErrors.message}</p>
        )}
        <br />
        {/* Turnstile */}
        <div ref={turnstileRef} className="cf-turnstile" />
        {turnstileSiteKey ? (
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            async
            defer
            onLoad={renderTurnstile}
          />
        ) : null}

        <button type="submit" disabled={busy} className={stylex(styles.button)}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </Form>
    </div>
  );
}
