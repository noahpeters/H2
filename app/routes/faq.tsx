import {redirect} from 'react-router';
import type {Route} from './+types/faq';

export function loader(_: Route.LoaderArgs) {
  throw redirect('/about', 301);
}

export default function FaqRedirect() {
  return null;
}
