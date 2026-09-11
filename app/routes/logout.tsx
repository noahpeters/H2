import type {Route} from './+types/logout';
import {logoutResponse} from '~/lib/auth.server';

export async function action({request}: Route.ActionArgs) {
  if (request.headers.get('Origin') !== new URL(request.url).origin)
    return new Response('Invalid origin', {status: 403});
  return logoutResponse('/login');
}

export async function loader() {
  return logoutResponse('/login');
}
