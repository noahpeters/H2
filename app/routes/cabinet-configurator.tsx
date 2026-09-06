import type {Route} from './+types/cabinet-configurator';
import {useLoaderData} from 'react-router';
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

export function loader({context}: Route.LoaderArgs) {
  return {
    turnstileSiteKey:
      (context.env as unknown as {TURNSTILE_SITE_KEY?: string})
        .TURNSTILE_SITE_KEY ?? '',
  };
}
export default function CabinetPage() {
  const {turnstileSiteKey} = useLoaderData<typeof loader>();
  return <CabinetConfigurator turnstileSiteKey={turnstileSiteKey} />;
}
