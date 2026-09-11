import {useEffect, useState} from 'react';
import {readSavedRooms} from '~/studio/cabinet-configurator/useSavedRooms';
import type {Route} from './+types/cabinet-configurator';
import {useLoaderData} from 'react-router';
import cabinetStyles from '~/styles/cabinet-configurator.css?url';
import studioStyles from '~/styles/studio.css?url';
import {StudioHeader} from '~/studio/StudioHeader';
import {CabinetConfigurator} from '~/studio/cabinet-configurator/CabinetConfigurator';
import {CabinetStartSheet} from '~/studio/cabinet-configurator/CabinetStartSheet';
import type {CustomCabinetLibraryItem} from '~/studio/cabinet-configurator/custom-unit/library';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: studioStyles},
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

export async function loader({context, request}: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const env = context.env as unknown as {
    CABINET_ROOMS_URL?: string;
    CABINET_ROOMS_TOKEN?: string;
  };
  let customCabinets: CustomCabinetLibraryItem[] = [];
  if (env.CABINET_ROOMS_URL && env.CABINET_ROOMS_TOKEN) {
    try {
      const response = await fetch(
        new URL('/custom-cabinets', env.CABINET_ROOMS_URL),
        {headers: {Authorization: `Bearer ${env.CABINET_ROOMS_TOKEN}`}},
      );
      if (response.ok)
        customCabinets = (await response.json()) as CustomCabinetLibraryItem[];
    } catch {
      /* The standard catalog remains usable during a library outage. */
    }
  }
  return {
    showStartSheet: !params.get('design') && !params.get('preset'),
    turnstileSiteKey:
      (context.env as unknown as {TURNSTILE_SITE_KEY?: string})
        .TURNSTILE_SITE_KEY ?? '',
    customCabinets,
  };
}
export default function CabinetPage() {
  const {turnstileSiteKey, showStartSheet, customCabinets} =
    useLoaderData<typeof loader>();
  const [hasSavedRoom, setHasSavedRoom] = useState<boolean | null>(null);
  useEffect(() => {
    setHasSavedRoom(readSavedRooms().length > 0);
  }, []);
  return (
    <div className="studio-cabinet-page">
      <StudioHeader
        links={[
          {label: 'Back to the studio', to: '/'},
          {label: 'Shape Your Table', to: '/configurator'},
        ]}
      />
      {showStartSheet && hasSavedRoom === null ? (
        <p role="status">Opening room…</p>
      ) : showStartSheet && !hasSavedRoom ? (
        <CabinetStartSheet />
      ) : (
        <CabinetConfigurator
          turnstileSiteKey={turnstileSiteKey}
          customCabinets={customCabinets}
        />
      )}
    </div>
  );
}
