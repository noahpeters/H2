import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import type {Route} from './+types/contact';
import {Script} from '@shopify/hydrogen';
import {Resend} from 'resend';
import studioStyles from '~/styles/studio.css?url';
import {StudioFooter} from '~/studio/StudioFooter';
import {StudioHeader} from '~/studio/StudioHeader';

type LoaderData = {turnstileSiteKey: string; project: string};
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

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: studioStyles},
];
export const meta: Route.MetaFunction = () => [
  {title: 'Start a Project — From Trees'},
  {
    name: 'description',
    content:
      'Tell From Trees about your custom furniture or cabinetry project in Riverside and Southern California.',
  },
];

export async function loader({
  context,
  request,
}: Route.LoaderArgs): Promise<LoaderData> {
  const turnstileSiteKey = (context.env as Env).TURNSTILE_SITE_KEY;
  if (!turnstileSiteKey) console.warn('TURNSTILE_SITE_KEY is not set');
  const project =
    new URL(request.url).searchParams.get('project')?.slice(0, 2000) ?? '';
  return {turnstileSiteKey: turnstileSiteKey ?? '', project};
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function verifyTurnstile({
  token,
  secret,
  ip,
}: {
  token: string;
  secret: string;
  ip?: string;
}) {
  const body = new URLSearchParams({secret, response: token});
  if (ip) body.set('remoteip', ip);
  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {method: 'POST', body},
  );
  if (!response.ok) return false;
  return !!((await response.json()) as {success?: boolean}).success;
}

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<ActionData> {
  const form = await request.formData();
  if (String(form.get('company') || '')) return {ok: true};
  const value = (name: string) => String(form.get(name) || '').trim();
  const name = value('name');
  const email = value('email');
  const phone = value('phone');
  const projectType = value('projectType');
  const location = value('location');
  const timeline = value('timeline');
  const budget = value('budget');
  const message = value('message');
  const token = value('cf-turnstile-response');
  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = 'Please enter your name.';
  if (!email || !isValidEmail(email))
    fieldErrors.email = 'Please enter a valid email.';
  if (!projectType) fieldErrors.projectType = 'Please choose a project type.';
  if (!location) fieldErrors.location = 'Please enter the project location.';
  if (!message || message.length < 10)
    fieldErrors.message = 'Please tell us a little more about the project.';
  if (!token) fieldErrors.turnstile = 'Please complete the verification.';
  if (Object.keys(fieldErrors).length) return {ok: false, fieldErrors};

  const env = context.env as Env;
  if (
    !env.RESEND_API_KEY ||
    !env.CONTACT_TO_EMAIL ||
    !env.CONTACT_FROM_EMAIL ||
    !env.TURNSTILE_SECRET_KEY
  ) {
    console.error('Missing env vars for contact form');
    return {
      ok: false,
      fieldErrors: {},
      formError:
        'The project form is not configured correctly. Please email us directly instead.',
    };
  }
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    undefined;
  if (!(await verifyTurnstile({token, secret: env.TURNSTILE_SECRET_KEY, ip}))) {
    return {
      ok: false,
      fieldErrors: {turnstile: 'Verification failed. Please try again.'},
    };
  }
  try {
    await new Resend(env.RESEND_API_KEY).emails.send({
      from: env.CONTACT_FROM_EMAIL,
      to: env.CONTACT_TO_EMAIL,
      replyTo: email,
      subject: `Project inquiry: ${projectType} — ${name}`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone || 'Not provided'}`,
        `Project type: ${projectType}`,
        `Project location: ${location}`,
        `Timeline: ${timeline || 'Not provided'}`,
        `Budget: ${budget || 'Not provided'}`,
        '',
        message,
      ].join('\n'),
    });
    return {ok: true};
  } catch (error) {
    console.error('Contact email send failed', error);
    return {
      ok: false,
      fieldErrors: {},
      formError:
        'Something went wrong sending your project details. Please try again or email us directly.',
    };
  }
}

export default function ContactPage() {
  const {turnstileSiteKey, project} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const busy = useNavigation().state !== 'idle';

  if (actionData?.ok)
    return (
      <main className="studio-page studio-editorial-page">
        <StudioHeader
          links={[{label: 'Shape your table ↗', to: '/configurator'}]}
        />
        <section className="contact-success">
          <div>
            <p className="eyebrow">Project received</p>
            <h1>Thank you.</h1>
            <p>We’ll review the details and get back to you soon.</p>
            <Link to="/">Return home →</Link>
          </div>
        </section>
        <StudioFooter />
      </main>
    );

  const fieldErrors =
    actionData && !actionData.ok ? actionData.fieldErrors : {};
  const formError =
    actionData && !actionData.ok ? actionData.formError : undefined;
  const error = (field: string) =>
    fieldErrors[field] ? (
      <span className="field-error">{fieldErrors[field]}</span>
    ) : null;

  return (
    <main className="studio-page studio-editorial-page">
      <StudioHeader
        links={[{label: 'Shape your table ↗', to: '/configurator'}]}
      />
      <section className="contact-layout">
        <div className="contact-intro">
          <p className="eyebrow">Have something in mind?</p>
          <h1>
            Start a<br />
            <em>project.</em>
          </h1>
          <p>
            Tell us about the piece or space you have in mind. You do not need
            every detail figured out—this is simply a place to begin.
          </p>
          <div className="contact-details">
            <span>Riverside, California</span>
            <a href="mailto:noah@fromtrees.studio">noah@fromtrees.studio</a>
            <Link to="/">Return home →</Link>
          </div>
        </div>
        <Form method="post" className="project-form">
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{position: 'absolute', left: '-10000px'}}
          />
          {formError ? <p className="form-error">{formError}</p> : null}
          <div className="project-form-grid">
            <label>
              Name
              <input name="name" autoComplete="name" required />
              {error('name')}
            </label>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
              {error('email')}
            </label>
            <label>
              Phone <span aria-hidden="true">(optional)</span>
              <input name="phone" type="tel" autoComplete="tel" />
            </label>
            <label>
              Project type
              <select name="projectType" required defaultValue="">
                <option value="" disabled>
                  Select one
                </option>
                <option>Custom furniture</option>
                <option>Kitchen or pantry</option>
                <option>Bathroom vanity</option>
                <option>Built-ins or storage</option>
                <option>Other cabinetry</option>
                <option>Something else</option>
              </select>
              {error('projectType')}
            </label>
            <label>
              Project location
              <input
                name="location"
                autoComplete="postal-code"
                placeholder="City or ZIP code"
                required
              />
              {error('location')}
            </label>
            <label>
              Approximate timeline <span aria-hidden="true">(optional)</span>
              <select name="timeline" defaultValue="">
                <option value="">Not sure yet</option>
                <option>As soon as practical</option>
                <option>Within 3 months</option>
                <option>3–6 months</option>
                <option>6–12 months</option>
                <option>More than a year</option>
              </select>
            </label>
            <label className="form-wide">
              General budget range <span aria-hidden="true">(optional)</span>
              <input
                name="budget"
                placeholder="A range is helpful, but not required"
              />
            </label>
            <label className="form-wide">
              Tell us about your project
              <textarea name="message" defaultValue={project} required />
              {error('message')}
            </label>
          </div>
          <div className="turnstile-wrap">
            {turnstileSiteKey ? (
              <div
                className="cf-turnstile"
                data-sitekey={turnstileSiteKey}
                data-theme="light"
              />
            ) : null}
            {error('turnstile')}
          </div>
          {turnstileSiteKey ? (
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js"
              async
              defer
            />
          ) : null}
          <button type="submit" disabled={busy}>
            <span>{busy ? 'Sending…' : 'Send project details'}</span>
            <span aria-hidden="true">→</span>
          </button>
        </Form>
      </section>
      <section className="contact-next">
        <h2>What happens next?</h2>
        <div>
          <p>
            We’ll review your project, location, and timing, then reach out to
            learn more. If it feels like a good fit, we’ll arrange the next
            conversation or a complimentary home visit.
          </p>
          <Link className="about-return-link" to="/">
            Return home <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
      <StudioFooter />
    </main>
  );
}
