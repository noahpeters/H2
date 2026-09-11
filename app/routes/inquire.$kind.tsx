import {data, Link, redirect, useActionData, useLoaderData} from 'react-router';
import type {Route} from './+types/inquire.$kind';
import {loader as contactLoader, action as contactAction} from './contact';
import {adLandings, isAdLandingKind} from '~/studio/adLandingContent';
import {ProjectForm} from '~/studio/ProjectForm';
import studioStyles from '~/styles/studio.css?url';
import landingStyles from '~/styles/ad-landings.css?url';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: studioStyles},
  {rel: 'stylesheet', href: landingStyles},
];
export const headers: Route.HeadersFunction = () => ({
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'private, no-store',
});

export const meta: Route.MetaFunction = ({data: loaded}) => [
  {
    title: loaded
      ? `${adLandings[loaded.kind].title} — From Trees`
      : 'From Trees',
  },
  {name: 'robots', content: 'noindex, nofollow'},
];
export async function loader(args: Route.LoaderArgs) {
  if (!isAdLandingKind(args.params.kind))
    throw new Response('Not found', {status: 404});
  return data(
    {...(await contactLoader(args)), kind: args.params.kind},
    {
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
export async function action(args: Route.ActionArgs) {
  if (!isAdLandingKind(args.params.kind))
    throw new Response('Not found', {status: 404});
  const result = await contactAction(args);
  if (!result.ok) return data(result, {status: 400});
  // A honeypot response is intentionally not a real lead.
  if (result.eventId)
    args.context.session.set('projectReceipt', {
      eventId: result.eventId,
      kind: args.params.kind,
    });
  return redirect('/', {status: 303});
}
export default function AdLandingPage() {
  const {kind, turnstileSiteKey, submissionId} = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const page = adLandings[kind];
  return (
    <main className={`studio-page ad-page ad-${kind}`}>
      <header className="ad-header">
        <Link className="brand" to="/" aria-label="From Trees home">
          <img className="brand-tree" src="/from-trees-tree.png" alt="" />
          <span>from trees</span>
        </Link>
        <a href="#inquiry">
          Start a conversation <span aria-hidden="true">↗</span>
        </a>
      </header>
      <section className="ad-hero">
        <div className="ad-hero-copy">
          <p className="eyebrow">{page.label}</p>
          <h1>{page.title}</h1>
          <p className="ad-intro">{page.intro}</p>
          <a className="ad-button" href="#inquiry">
            {kind === 'designers'
              ? 'Tell us about your project'
              : 'Start your project'}{' '}
            <span aria-hidden="true">↗</span>
          </a>
        </div>
        <figure>
          <img src={page.hero} alt={page.heroAlt} loading="eager" />
          <figcaption>{page.caption}</figcaption>
        </figure>
      </section>
      <section className="ad-detail">
        <figure>
          <img src={page.image} alt={page.imageAlt} loading="lazy" />
          <figcaption>{page.evidence}</figcaption>
        </figure>
        <div>
          <p className="eyebrow">Made for the project</p>
          <h2>{page.detailTitle}</h2>
          <p>{page.detail}</p>
          <a className="ad-text-link" href="#inquiry">
            Let’s work through it <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>
      <section className="ad-process">
        <div>
          <p className="eyebrow">From the first conversation</p>
          <h2>A clear way forward.</h2>
          <p>
            From Trees is a family- and veteran-owned studio in Riverside,
            California.{' '}
            {kind === 'designers'
              ? 'Our team of experienced craftsmen and project managers works with you to carry your design intent through fabrication and the final fit.'
              : 'Our team of experienced craftsmen, project managers, and designers guides the work from design through the final fit.'}
          </p>
        </div>
        <ol>
          {page.process.map((step, i) => (
            <li key={step}>
              <span aria-hidden="true">0{i + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="ad-inquiry" id="inquiry">
        <div>
          <p className="eyebrow">A place to begin</p>
          <h2>{page.formTitle}</h2>
          <p>{page.formIntro}</p>
          <div className="ad-next">
            <h3>What happens next?</h3>
            <p>
              We’ll review your project, location, and timing, then reach out to
              learn more and discuss the next step.
            </p>
          </div>
          <a href="mailto:noah@fromtrees.studio">noah@fromtrees.studio</a>
        </div>
        <ProjectForm
          turnstileSiteKey={turnstileSiteKey}
          submissionId={submissionId}
          defaultProjectType={page.projectType}
          fieldErrors={result && !result.ok ? result.fieldErrors : {}}
          formError={result && !result.ok ? result.formError : undefined}
        />
      </section>
      <footer className="ad-footer">
        <Link to="/">from trees / Riverside, California</Link>
        <Link to="/policies/privacy-policy">Privacy</Link>
        <Link to="/pages/data-sharing-opt-out">Your privacy choices</Link>
      </footer>
    </main>
  );
}
