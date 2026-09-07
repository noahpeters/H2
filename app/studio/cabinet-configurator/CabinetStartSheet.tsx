import {useEffect, useState} from 'react';
import {
  blankStudy,
  migrateStudy,
  ThreeStudy,
  type Study,
} from './CabinetConfigurator';
import {roomRequest} from './useSavedRooms';

export const STARTER_DESIGNS = [
  {slug: 'c1ffb4a1ae48f831b2c0c0096f88d606', title: 'Example one'},
  {slug: 'cb6ffbf973edae6b7bdaea75f704219e', title: 'Example two'},
  {slug: 'e0e91340643e5575b73ee6f8a6ba9771', title: 'Example three'},
];

function StarterCard({slug, title}: {slug?: string; title: string}) {
  const [study, setStudy] = useState<Study | null>(() =>
    slug ? null : blankStudy(),
  );
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!slug) return;
    let current = true;
    setFailed(false);
    roomRequest('GET', slug)
      .then((source) => {
        if (current) setStudy({...migrateStudy(source.study), selected: null});
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [slug, attempt]);
  return (
    <article className="cc-starter-card">
      <div
        className="cc-starter-preview"
        aria-label={`${title} read-only 3D preview`}
      >
        {study ? (
          <ThreeStudy study={study} />
        ) : failed ? (
          <div role="status">
            Preview unavailable.{' '}
            <button onClick={() => setAttempt(attempt + 1)}>Retry</button>
          </div>
        ) : (
          <p role="status">Loading 3D preview…</p>
        )}
      </div>
      <div className="cc-starter-card-copy">
        <h2>{title}</h2>
        <p>
          {slug
            ? 'Explore this layout, then make it your own.'
            : 'An empty room, ready for your ideas.'}
        </p>
        <a
          href={
            slug
              ? `/cabinet-configurator?design=${slug}`
              : '/cabinet-configurator?preset=blank'
          }
          aria-label={`Start here: ${title}`}
        >
          Start here <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}

export function CabinetStartSheet() {
  return (
    <main className="cc-start-sheet">
      <a className="cc-start-home" href="/">
        From Trees · Back home
      </a>
      <header>
        <p className="cc-start-eyebrow">Cabinet design study</p>
        <h1>A beginning, not a blueprint.</h1>
        <p>
          Start exploring the layout, proportions, and character of your
          cabinetry. This is just the beginning of your design—our professional
          designers will work with you to refine the fit and add the custom
          details when the time comes.
        </p>
        <p>
          Choose an example below or begin with an empty room. Drag a 3D preview
          to look around; your changes will be made in a separate copy.
        </p>
      </header>
      <section
        className="cc-starter-grid"
        aria-label="Choose a starting configuration"
      >
        {STARTER_DESIGNS.map((design) => (
          <StarterCard key={design.slug} {...design} />
        ))}
        <StarterCard title="Start from scratch" />
      </section>
    </main>
  );
}
