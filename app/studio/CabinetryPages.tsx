import {Link, NavLink, useLocation, useSearchParams} from 'react-router';
import type {ReactNode} from 'react';
import {cabinetryIdeas} from './cabinetryIdeas';
import {CONSULTATION_URL} from './consultation';
import studioStyles from '~/styles/studio.css?url';
import cabinetryStyles from '~/styles/cabinetry-pages.css?url';

export const links = () => [
  {rel: 'stylesheet', href: studioStyles},
  {rel: 'stylesheet', href: cabinetryStyles},
];
export const base = '/inquire/cabinetry';
const paths = [
  ['welcome', 'Start here'],
  ['process', 'Our process'],
  ['discover', 'Explore ideas'],
  ['contact', 'Get in touch'],
] as const;

export function CabinetryPage({children}: {children: ReactNode}) {
  const {search} = useLocation();
  return (
    <main className="studio-page cabinetry-pages">
      <header>
        <Link className="brand" to={base + '/welcome' + search}>
          <img src="/from-trees-tree.png" alt="" />
          from trees
        </Link>
        <nav aria-label="Cabinetry">
          {paths.map(([path, label]) => (
            <NavLink key={path} to={base + '/' + path + search}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      {children}
    </main>
  );
}

export function Welcome() {
  const {search} = useLocation();
  return (
    <CabinetryPage>
      <section className="cab-feature">
        <div>
          <p className="eyebrow">Custom cabinetry · Riverside, California</p>
          <h1>What do you have in mind?</h1>
          <p>
            A kitchen with space to cook together. Shelves that fit an awkward
            alcove. Start with the room, or get to know the people who’ll build
            it.
          </p>
          <div className="cab-choices">
            {[
              ['process', 'I’m getting to know From Trees'],
              ['discover', 'I have a project in mind'],
              ['contact', 'I’m ready to talk'],
            ].map(([path, label]) => (
              <Link key={path} to={base + '/' + path + search}>
                {label} <span aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        </div>
        <img
          src="/studio/images/white-oak-kitchen.webp"
          alt="White oak kitchen cabinetry by From Trees"
        />
      </section>
    </CabinetryPage>
  );
}

export function Process() {
  const {search} = useLocation();
  return (
    <CabinetryPage>
      <section className="cab-feature">
        <div>
          <p className="eyebrow">Our process</p>
          <h1>From your room to our shop.</h1>
          <ol className="cab-process">
            <li>
              <h2>Walk through the room</h2>
              <p>
                Tell us what works and what gets in the way. At a free in-home
                cabinetry consultation, we can look at the space and take
                measurements together.
              </p>
            </li>
            <li>
              <h2>Work through the design</h2>
              <p>
                We refine the layout, proportions, storage, and materials with
                you. Drawings give us a shared view of the details before we
                build.
              </p>
            </li>
            <li>
              <h2>Build and fit</h2>
              <p>
                We build in our Riverside shop and coordinate installation
                around the room we measured.
              </p>
            </li>
          </ol>
          <Link to={base + '/contact' + search}>Talk about your room →</Link>
        </div>
        <img
          src="/studio/images/white-oak-built-ins.webp"
          alt="Fitted white oak built-ins by From Trees"
        />
      </section>
    </CabinetryPage>
  );
}

export function Discovery() {
  const [params] = useSearchParams();
  const focused = cabinetryIdeas.find((x) => x.id === params.get('idea'));
  const selected = cabinetryIdeas.filter((x) =>
    params.getAll('save').includes(x.id),
  );
  function ideaLink(id: string, toggle = false) {
    const next = new URLSearchParams(params);
    next.set('idea', id);
    if (toggle) {
      const ids = new Set(selected.map((x) => x.id));
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      next.delete('save');
      for (const saved of ids) next.append('save', saved);
    }
    return {
      pathname: base + '/discover',
      search: next.toString(),
      hash: '#idea',
    };
  }
  return (
    <CabinetryPage>
      <section className="cab-body">
        <p className="eyebrow">Guided project discovery</p>
        <h1>Find ideas for your room.</h1>
        <p>
          Choose a room or a detail. Save what interests you to bring it into
          your conversation with us.
        </p>
        <div className="cab-explore">
          <div>
            {Array.from(new Set(cabinetryIdeas.map((x) => x.group))).map(
              (group) => (
                <section key={group}>
                  <h2>{group}</h2>
                  <div className="cab-tags">
                    {cabinetryIdeas
                      .filter((x) => x.group === group)
                      .map((x) => (
                        <Link
                          key={x.id}
                          aria-current={focused === x ? 'true' : undefined}
                          to={ideaLink(x.id)}
                        >
                          {x.name}
                        </Link>
                      ))}
                  </div>
                </section>
              ),
            )}
          </div>
          <aside id="idea">
            {focused ? (
              <>
                <h2>{focused.name}</h2>
                <p>{focused.prompt}</p>
                <Link className="cab-action" to={ideaLink(focused.id, true)}>
                  {selected.includes(focused)
                    ? 'Remove from my project'
                    : 'Save to my project'}
                </Link>
                <h3>Related ideas</h3>
                <div className="cab-tags">
                  {cabinetryIdeas
                    .filter((x) => focused.related.includes(x.id))
                    .map((x) => (
                      <Link key={x.id} to={ideaLink(x.id)}>
                        {x.name}
                      </Link>
                    ))}
                </div>
              </>
            ) : (
              <img
                src="/studio/images/reeded-vanity.webp"
                alt="Reeded wood vanity by From Trees"
              />
            )}
            <h3>Your project</h3>
            <p>
              {selected.length
                ? selected.map((x) => x.name).join(' · ')
                : 'You can get in touch at any point.'}
            </p>
            <Link to={{pathname: base + '/contact', search: params.toString()}}>
              Discuss your project →
            </Link>
          </aside>
        </div>
      </section>
    </CabinetryPage>
  );
}

export function BookingChoices({search}: {search: string}) {
  const params = new URLSearchParams(search);
  params.set('request', 'call');
  return (
    <div className="cab-choices">
      <a href={CONSULTATION_URL}>Book a free in-home visit ↗</a>
      <Link
        to={{
          pathname: base + '/contact',
          search: params.toString(),
          hash: '#project-form',
        }}
      >
        Request a scheduled phone call →
      </Link>
    </div>
  );
}
