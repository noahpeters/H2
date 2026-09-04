import type {Route} from './+types/_index';
import studioStyles from '~/styles/studio.css?url';
import Home from '~/studio/Home';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: studioStyles},
];

export const meta: Route.MetaFunction = () => [
  {title: 'from trees — Custom Fine Furniture & Cabinetry'},
  {
    name: 'description',
    content:
      'Design-led cabinetry and custom heirloom furniture, built by hand in Riverside, California.',
  },
  {property: 'og:image', content: '/og.png'},
  {name: 'twitter:card', content: 'summary_large_image'},
  {name: 'twitter:image', content: '/og.png'},
];

export default Home;
