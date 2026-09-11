import studioStyles from '~/styles/studio.css?url';
import {StudioHeader} from '~/studio/StudioHeader';
import type {Route} from './+types/cabinet-configurator_.custom-unit';
import {CustomUnitEditor} from '~/studio/cabinet-configurator/custom-unit/CustomUnitEditor';
import styles from '~/styles/custom-unit-editor.css?url';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: studioStyles},
  {rel: 'stylesheet', href: styles},
];
export const meta: Route.MetaFunction = () => [
  {title: 'Cabinet workshop | From Trees'},
  {name: 'robots', content: 'noindex, nofollow'},
];
export default function CustomUnitHarness() {
  return (
    <div className="studio-cabinet-page">
      <StudioHeader
        links={[
          {label: 'Studio', to: '/'},
          {label: 'Cabinet library', to: '/admin/custom-cabinets'},
        ]}
      />
      <CustomUnitEditor />
    </div>
  );
}
