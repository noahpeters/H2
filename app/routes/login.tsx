import {Form, useActionData, useSearchParams} from 'react-router';
import type {Route} from './+types/login';
import {authenticateAdmin, getAuthenticatedUser, loginResponse} from '~/lib/auth.server';

export const meta: Route.MetaFunction = () => [
  {title: 'Sign in | From Trees'},
  {name: 'robots', content: 'noindex,nofollow'},
];

export async function loader({request, context}: Route.LoaderArgs) {
  const user = await getAuthenticatedUser(request, context);
  if (user) {
    const url = new URL(request.url);
    const returnTo = url.searchParams.get('returnTo') ?? '/';
    return new Response(null, {status: 302, headers: {Location: returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'}});
  }
  return null;
}

export async function action({request, context}: Route.ActionArgs) {
  if (request.headers.get('Origin') !== new URL(request.url).origin)
    return {error: 'Invalid origin'};
  const form = await request.formData();
  const username = String(form.get('username') ?? '');
  const password = String(form.get('password') ?? '');
  const returnTo = String(form.get('returnTo') ?? '/');
  const user = await authenticateAdmin(context, username, password);
  if (!user) return {error: 'Invalid username or password'};
  return loginResponse(request, context, user, returnTo);
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  return (
    <main style={{maxWidth: 420, margin: '10vh auto', padding: '2rem'}}>
      <h1>Sign in</h1>
      <p>Use your From Trees administrator credentials.</p>
      <Form method="post">
        <input type="hidden" name="returnTo" value={searchParams.get('returnTo') ?? '/'} />
        <label style={{display: 'block', marginBottom: '1rem'}}>
          Username
          <input name="username" autoComplete="username" required style={{display: 'block', width: '100%'}} />
        </label>
        <label style={{display: 'block', marginBottom: '1rem'}}>
          Password
          <input name="password" type="password" autoComplete="current-password" required style={{display: 'block', width: '100%'}} />
        </label>
        {actionData?.error ? <p role="alert">{actionData.error}</p> : null}
        <button type="submit">Sign in</button>
      </Form>
    </main>
  );
}
