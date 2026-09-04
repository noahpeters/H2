import {Link} from 'react-router';

type StudioHeaderLink = {label: string; to: string};

export function StudioHeader({
  links,
  home = false,
}: {
  links: StudioHeaderLink[];
  home?: boolean;
}) {
  return (
    <header
      className={`site-header studio-page-header${home ? ' studio-home-header' : ''}`}
    >
      <Link className="brand" to="/" aria-label="From Trees home">
        <img className="brand-tree" src="/from-trees-tree.png" alt="" />
        <span>from trees</span>
      </Link>
      <nav className="studio-header-links" aria-label="Primary navigation">
        {links.map((link) => (
          <Link key={link.to} to={link.to}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
