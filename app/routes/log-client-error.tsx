import type {Route} from './+types/log-client-error';

export async function action({request}: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {status: 405});
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = {message: 'Invalid JSON payload'};
  }

  console.error('[client-error]', payload);
  return new Response('ok', {status: 200});
}
