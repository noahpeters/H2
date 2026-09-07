import type {Route} from './+types/cabinet-configurator';
import {useLoaderData} from 'react-router';
import cabinetStyles from '~/styles/cabinet-configurator.css?url';
import {CabinetConfigurator} from '~/studio/cabinet-configurator/CabinetConfigurator';
import {CabinetStartSheet} from '~/studio/cabinet-configurator/CabinetStartSheet';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: cabinetStyles},
];

export const meta: Route.MetaFunction = () => [
  {title: 'Cabinet configurator | from trees'},
  {
    name: 'description',
    content:
      'Explore room dimensions and a preliminary cabinet layout in plan and 3D.',
  },
  {name: 'robots', content: 'noindex,nofollow'},
];

export function loader({context, request}: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  return {
    showStartSheet: !params.get('design') && !params.get('preset'),
    turnstileSiteKey:
      (context.env as unknown as {TURNSTILE_SITE_KEY?: string})
        .TURNSTILE_SITE_KEY ?? '',
  };
}
export default function CabinetPage() {
  const {turnstileSiteKey, showStartSheet} = useLoaderData<typeof loader>();
  if (showStartSheet) return <CabinetStartSheet />;
  return <CabinetConfigurator turnstileSiteKey={turnstileSiteKey} />;
}
