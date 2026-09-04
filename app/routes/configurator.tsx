import type {Route} from './+types/configurator';
import studioStyles from '~/styles/studio.css?url';
import Configurator from '~/studio/configurator/Configurator';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: studioStyles},
];

export const meta: Route.MetaFunction = () => [
  {title: 'Table configurator | from trees'},
  {
    name: 'description',
    content:
      'Explore timber, proportions, edge profiles, and base designs for a custom From Trees table.',
  },
];

export default Configurator;
