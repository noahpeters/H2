import type {Route} from './+types/cabinet-configurator';
import cabinetStyles from '~/styles/cabinet-configurator.css?url';
import {CabinetConfigurator} from '~/studio/cabinet-configurator/CabinetConfigurator';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: cabinetStyles},
];

export const meta: Route.MetaFunction = () => [
  {title: 'Cabinet configurator prototype | from trees'},
  {
    name: 'description',
    content:
      'Explore room dimensions and a preliminary cabinet layout in plan and 3D.',
  },
  {name: 'robots', content: 'noindex,nofollow'},
];

export default CabinetConfigurator;
