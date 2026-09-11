import type {Route} from './+types/cabinet-configurator.custom-unit';
import {CustomUnitEditor} from '~/studio/cabinet-configurator/custom-unit/CustomUnitEditor';
import styles from '~/styles/custom-unit-editor.css?url';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: styles},
];
export const meta: Route.MetaFunction = () => [
  {title: 'Custom unit development harness | From Trees'},
  {name: 'robots', content: 'noindex, nofollow'},
];
export default function CustomUnitHarness() {
  return <CustomUnitEditor />;
}
