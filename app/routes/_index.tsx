import type {Route} from './+types/_index';
import studioStyles from '~/styles/studio.css?url';
import Home from '~/studio/Home';
import {useRouteLoaderData} from 'react-router';
import type {RootLoader} from '~/root';

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

export default function HomePage() {
  const root = useRouteLoaderData<RootLoader>('root');
  return (
    <>
      {root?.projectReceipt ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '5%',
            right: '5%',
            zIndex: 100,
            background: '#fff9ea',
            color: '#134232',
            padding: 20,
            border: '1px solid #134232',
          }}
        >
          Thank you. Your project details have been received. We’ll be in touch
          to discuss the next step.
        </div>
      ) : null}
      <Home />
    </>
  );
}
