import {Link} from 'react-router';
import type {Route} from './+types/about';
import studioStyles from '~/styles/studio.css?url';
import {StudioFooter} from '~/studio/StudioFooter';
import {StudioHeader} from '~/studio/StudioHeader';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: studioStyles},
];

export const meta: Route.MetaFunction = () => [
  {title: 'About From Trees — Furniture & Cabinetry Studio'},
  {
    name: 'description',
    content:
      'Meet From Trees, a family- and veteran-owned custom furniture and cabinetry studio led by designer and craftsman Noah Peters in Riverside, California.',
  },
];

export default function AboutPage() {
  return (
    <main className="studio-page studio-editorial-page">
      <StudioHeader
        links={[{label: 'Shape your table ↗', to: '/configurator'}]}
      />
      <section className="editorial-hero">
        <div>
          <p className="eyebrow">About from trees</p>
          <h1>
            Local hands.
            <br />
            <em>Lasting work.</em>
          </h1>
        </div>
        <p>
          From trees is a California-based, family- and veteran-owned furniture
          and cabinetry studio focused on creating thoughtful, well-crafted
          spaces that balance beauty, function, and longevity.
        </p>
      </section>
      <section className="about-story">
        <div className="about-story-grid">
          <div>
            <p className="eyebrow">Our philosophy</p>
            <h2>Built with clarity and intention.</h2>
          </div>
          <div className="about-story-copy">
            <p>
              We believe the best spaces are built at the intersection of
              craftsmanship, clarity, and intention. That means understanding
              how a space will be used, selecting materials that age gracefully,
              and paying close attention to proportion, detail, and execution.
            </p>
            <p>
              We do not chase trends or shortcuts. We focus on work that feels
              grounded, purposeful, and built to last. Clear communication is
              central to the process, helping our clients feel confident from
              early inspiration through the final fit.
            </p>
          </div>
        </div>
        <div className="about-story-grid">
          <div>
            <p className="eyebrow">What we make</p>
            <h2>Made for the way you live.</h2>
          </div>
          <div className="about-story-copy">
            <p>
              We design and build custom furniture and cabinetry for residential
              spaces. Every project is tailored to the room, the client’s needs,
              and the realities of daily use.
            </p>
            <ul className="about-services">
              <li>Custom furniture</li>
              <li>Kitchens and pantries</li>
              <li>Bathroom vanities</li>
              <li>Built-ins and storage</li>
              <li>Mudrooms and closets</li>
              <li>Entertainment and feature walls</li>
            </ul>
          </div>
        </div>
        <div className="about-story-grid">
          <div>
            <p className="eyebrow">Craftsmanship &amp; materials</p>
            <h2>The unseen details matter.</h2>
          </div>
          <div className="about-story-copy">
            <p>
              From solid wood and high-quality sheet goods to durable finishes
              and thoughtfully chosen hardware, every element is selected with
              longevity in mind. Our Riverside shop emphasizes precision,
              accuracy, and attention to detail—because the things you do not
              immediately see matter just as much as the ones you do.
            </p>
            <h3>Local roots and responsible making</h3>
            <p>
              Wherever practical, we prioritize responsible material sourcing,
              low-VOC finishes, and efficient production practices that reduce
              waste. For us, sustainability begins with smart choices and work
              made to serve its purpose for years to come.
            </p>
          </div>
        </div>
        <div className="about-story-grid">
          <div>
            <p className="eyebrow">Meet the owner</p>
            <h2>One point of responsibility.</h2>
          </div>
          <div className="about-story-copy">
            <p>
              From trees is owned and operated by Noah Peters, who leads the
              day-to-day work and remains closely involved in every project.
            </p>
            <p>
              As designer and lead craftsman, Noah works across both the
              creative and technical sides—from early design conversations to
              shop production and on-site installation. Clients work directly
              with the person responsible for bringing their project to life,
              creating consistency and accountability from start to finish.
            </p>
          </div>
        </div>
      </section>
      <div className="about-owner-image">
        <img
          src="/studio/images/studio-cabinetry.webp"
          alt="Custom From Trees cabinetry in a California home"
        />
      </div>
      <section className="about-return">
        <p>Continue exploring the studio from where the story begins.</p>
        <Link className="about-return-link" to="/">
          Return home <span aria-hidden="true">→</span>
        </Link>
      </section>
      <StudioFooter />
    </main>
  );
}
