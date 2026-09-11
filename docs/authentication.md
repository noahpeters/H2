# Authentication

H2 uses a shared, server-side authentication layer in `app/lib/auth.server.ts` for protected application routes.

## Environment

Preferred variables:

- `AUTH_ADMIN_CREDENTIALS`: administrator login as `username:password`.
- `AUTH_SESSION_SECRET`: independent signing secret for authentication cookies.

For the initial migration, `CABINET_ADMIN_CREDENTIALS` remains supported as a fallback for both administrator login and cookie signing. This allows the existing custom-cabinet admin deployment to move to shared authentication without requiring a second production secret immediately.

For production, set `AUTH_SESSION_SECRET` separately so administrator credentials can rotate without invalidating the signing key.

## Protecting routes

Use `requireAuth(request, context)` for any signed-in user and `requireAdmin(request, context)` for administrator-only routes.

```ts
import {requireAdmin} from '~/lib/auth.server';

export async function loader({request, context}: Route.LoaderArgs) {
  const user = await requireAdmin(request, context);
  // protected work
}
```

Unauthenticated requests are redirected to `/login?returnTo=...`. The login route validates credentials on the server and writes a signed, expiring `__Host-ft_auth` cookie with `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`.

Use `/logout` to clear the shared session cookie.

## Roles

The current role model contains only `admin`, but the session payload and route guards are structured so additional application roles can be added without creating feature-specific authentication systems.
