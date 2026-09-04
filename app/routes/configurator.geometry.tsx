import type {Route} from './+types/configurator.geometry';
import studioStyles from '~/styles/studio.css?url';
import GeometryPage from '~/studio/configurator/geometry/GeometryPage';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: studioStyles},
];

export const meta: Route.MetaFunction = () => [
  {title: 'Table geometry study | from trees'},
  {
    name: 'description',
    content:
      'Explore a dimensioned spatial study for a custom From Trees table.',
  },
];

export default GeometryPage;
