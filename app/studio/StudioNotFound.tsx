import {Link} from 'react-router';
import studioStyles from '~/styles/studio.css?url';
import notFoundStyles from '~/styles/studio-not-found.css?url';
import {StudioHeader} from './StudioHeader';
import {StudioFooter} from './StudioFooter';

export function StudioNotFound() {
  return (
    <div className="studio-page studio-not-found">
      <link rel="stylesheet" href={studioStyles} />
      <link rel="stylesheet" href={notFoundStyles} />
      <StudioHeader
        links={[
          {label: 'Selected work', to: '/#work'},
          {label: 'Process', to: '/#process'},
          {label: 'About', to: '/about'},
          {label: 'Shape your table ↗', to: '/configurator'},
        ]}
      />
      <main className="not-found-content" aria-labelledby="not-found-title">
        <section className="not-found-copy">
          <p className="eyebrow">404 · Page not found</p>
          <h1 id="not-found-title">
            Wandered<br />
            <em>off trail?</em>
          </h1>
          <p className="not-found-description">
            This page seems to have lost its way. Let’s get you back to
            thoughtfully made furniture and spaces that feel like home.
          </p>
          <div className="not-found-actions">
            <Link className="not-found-home" to="/">
              Back home <span aria-hidden="true">↗</span>
            </Link>
            <Link className="about-return-link" to="/#work">
              Explore our work <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
        <figure className="not-found-image">
          <img
            src="/studio/images/studio-cabinetry.webp"
            alt="Custom From Trees cabinetry, thoughtfully fitted to a California home"
            width="1000"
            height="1200"
          />
          <figcaption>
            <span className="eyebrow">A place for everything.</span>
            <span>Even a fresh start.</span>
          </figcaption>
        </figure>
        <nav className="not-found-explore" aria-label="Explore From Trees">
          <p className="eyebrow">Find your next direction</p>
          <Link className="about-return-link" to="/configurator">
            Shape your table <span aria-hidden="true">↗</span>
          </Link>
          <Link className="about-return-link" to="/cabinet-configurator">
            Design your space <span aria-hidden="true">↗</span>
          </Link>
          <Link className="about-return-link" to="/about">
            Meet the studio <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </main>
      <StudioFooter />
    </div>
  );
}
