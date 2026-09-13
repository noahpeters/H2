import type {Route} from './+types/configurator';
import studioStyles from '~/styles/studio.css?url';
import Configurator from '~/studio/configurator/Configurator';
import {useLoaderData} from 'react-router';

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

export function loader({context}: Route.LoaderArgs) {
  return {
    turnstileSiteKey:
      (context.env as unknown as {TURNSTILE_SITE_KEY?: string})
        .TURNSTILE_SITE_KEY ?? '',
  };
}

export default function ConfiguratorPage() {
  const {turnstileSiteKey} = useLoaderData<typeof loader>();
  return <Configurator turnstileSiteKey={turnstileSiteKey} />;
}
