import {Link, useActionData, useLoaderData} from 'react-router';
import type {Route} from './+types/contact';
import {ProjectForm} from '~/studio/ProjectForm';
import {acceptIntake, type IntakeEnv} from '~/lib/intake/intake.server';
import {
  attribution,
  MARKETING_DISCLOSURE,
  MARKETING_VERSION,
  UUID,
} from '~/lib/intake/protocol';
import studioStyles from '~/styles/studio.css?url';
import {StudioFooter} from '~/studio/StudioFooter';
import {StudioHeader} from '~/studio/StudioHeader';

type LoaderData = {
  turnstileSiteKey: string;
  project: string;
  submissionId: string;
};
interface Env extends IntakeEnv {
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}
type ActionData =
  | {ok: true; eventId?: string}
  | {ok: false; fieldErrors: Record<string, string>; formError?: string};

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: studioStyles},
];
export const headers: Route.HeadersFunction = () => ({
  'Cache-Control': 'private, no-store',
});

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
}: Pick<Route.LoaderArgs, 'context' | 'request'>): Promise<LoaderData> {
  const turnstileSiteKey = (context.env as Env).TURNSTILE_SITE_KEY;
  if (!turnstileSiteKey) console.warn('TURNSTILE_SITE_KEY is not set');
  const project =
    new URL(request.url).searchParams.get('project')?.slice(0, 2000) ?? '';
  return {
    turnstileSiteKey: turnstileSiteKey ?? '',
    project,
    submissionId: crypto.randomUUID(),
  };
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
    {method: 'POST', body, signal: AbortSignal.timeout(10000)},
  );
  if (!response.ok) return false;
  return !!((await response.json()) as {success?: boolean}).success;
}

export async function action({
  request,
  context,
}: Pick<Route.ActionArgs, 'context' | 'request'>): Promise<ActionData> {
  if (request.method !== 'POST')
    return {ok: false, fieldErrors: {}, formError: 'Method not allowed.'};
  const url = new URL(request.url);
  if (
    request.headers.get('Origin') &&
    request.headers.get('Origin') !== url.origin
  )
    return {ok: false, fieldErrors: {}, formError: 'Invalid origin.'};
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
  const configuratorSource = value('configuratorSource');
  const token = value('cf-turnstile-response');
  const submissionId = value('submissionId');
  const eventId = submissionId;
  const fieldErrors: Record<string, string> = {};
  if (!UUID.test(submissionId))
    fieldErrors.submissionId = 'Please reload the form and try again.';
  for (const key of [
    'name',
    'phone',
    'projectType',
    'location',
    'timeline',
    'budget',
  ])
    if (value(key).length > 2000)
      fieldErrors[key] = 'Please use fewer than 2,000 characters.';
  if (message.length > 10000)
    fieldErrors.message = 'Please use fewer than 10,000 characters.';
  if (email.length > 254) fieldErrors.email = 'Please enter a valid email.';
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
  if (!env.RESEND_API_KEY || !env.TURNSTILE_SECRET_KEY) {
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
  let verified = false;
  try {
    verified = await verifyTurnstile({
      token,
      secret: env.TURNSTILE_SECRET_KEY,
      ip,
    });
  } catch {
    /* Fail closed when verification is unavailable. */
  }
  if (!verified) {
    return {
      ok: false,
      fieldErrors: {turnstile: 'Verification failed. Please try again.'},
    };
  }
  try {
    const source =
      configuratorSource === 'table' || configuratorSource === 'cabinet'
        ? configuratorSource
        : '';
    const sourcePath =
      source === 'table'
        ? '/configurator'
        : source === 'cabinet'
          ? '/cabinet-configurator'
          : url.pathname;
    const sourceUrl = new URL(sourcePath, url);
    sourceUrl.search = source ? value('sourceQuery') : url.search;
    await acceptIntake(
      {
        submissionId: eventId,
        name,
        email: email.toLowerCase(),
        phone,
        projectType,
        location,
        timeline,
        budget,
        message,
        sourcePath,
        sourceKind: source
          ? `${source}_study`
          : url.pathname.startsWith('/inquire/')
            ? url.pathname.split('/').pop()!
            : 'contact',
        configuratorSource: source,
        utm: attribution(sourceUrl),
        marketingConsent:
          value('marketingConsent') === 'granted' ? 'granted' : 'not_provided',
        marketingVersion: MARKETING_VERSION,
        marketingDisclosure: MARKETING_DISCLOSURE,
        details: {studySummary: source ? value('studySummary') : ''},
      },
      env,
    );
    // Root revalidation consumes this receipt and tracks the accepted lead.
    // Targeted landing actions replace the kind before redirecting home.
    context.session.set('projectReceipt', {eventId, kind: 'contact'});
    return {ok: true, eventId};
  } catch (error) {
    console.error('Contact intake acceptance failed', {
      submissionId: eventId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return {
      ok: false,
      fieldErrors: {},
      formError:
        'Something went wrong sending your project details. Please try again or email us directly.',
    };
  }
}

export default function ContactPage() {
  const {turnstileSiteKey, project, submissionId} =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

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
        <ProjectForm
          turnstileSiteKey={turnstileSiteKey}
          project={project}
          submissionId={submissionId}
          fieldErrors={fieldErrors}
          formError={formError}
        />
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
