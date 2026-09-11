export type AuthRole = 'admin';

export interface AuthUser {
  id: string;
  role: AuthRole;
}

export interface AuthEnv {
  AUTH_ADMIN_CREDENTIALS?: string;
  AUTH_SESSION_SECRET?: string;
  // Backward compatibility for the custom-cabinet admin credential introduced in #98.
  CABINET_ADMIN_CREDENTIALS?: string;
}

const COOKIE_NAME = '__Host-ft_auth';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();

function envFrom(context: {env: unknown}) {
  return context.env as AuthEnv;
}

function adminCredentials(env: AuthEnv) {
  return env.AUTH_ADMIN_CREDENTIALS ?? env.CABINET_ADMIN_CREDENTIALS;
}

function sessionSecret(env: AuthEnv) {
  // AUTH_SESSION_SECRET lets credentials rotate independently later. Falling back to
  // the admin credential keeps the initial migration deployable with one existing secret.
  return env.AUTH_SESSION_SECRET ?? adminCredentials(env);
}

function base64UrlEncode(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get('Cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

function safeReturnTo(value: string | null | undefined, fallback = '/') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

export async function authenticateAdmin(
  context: {env: unknown},
  username: string,
  password: string,
): Promise<AuthUser | null> {
  const configured = adminCredentials(envFrom(context));
  if (!configured) return null;
  const separator = configured.indexOf(':');
  if (separator < 1) return null;
  const expectedUsername = configured.slice(0, separator);
  const expectedPassword = configured.slice(separator + 1);
  const supplied = encoder.encode(`${username}\0${password}`);
  const expected = encoder.encode(`${expectedUsername}\0${expectedPassword}`);
  return constantTimeEqual(supplied, expected)
    ? {id: expectedUsername, role: 'admin'}
    : null;
}

export async function createSessionCookie(context: {env: unknown}, user: AuthUser) {
  const env = envFrom(context);
  const secret = sessionSecret(env);
  if (!secret) throw new Response('Authentication is not configured', {status: 503});
  const payload = base64UrlEncode(
    JSON.stringify({id: user.id, role: user.role, exp: Date.now() + SESSION_TTL_SECONDS * 1000}),
  );
  const signature = base64UrlEncode(await sign(payload, secret));
  return `${COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getAuthenticatedUser(
  request: Request,
  context: {env: unknown},
): Promise<AuthUser | null> {
  const secret = sessionSecret(envFrom(context));
  const token = readCookie(request, COOKIE_NAME);
  if (!secret || !token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const suppliedSignature = token.slice(dot + 1);
  try {
    const expectedSignature = await sign(payload, secret);
    if (!constantTimeEqual(base64UrlDecode(suppliedSignature), expectedSignature)) return null;
    const decoded = new TextDecoder().decode(base64UrlDecode(payload));
    const value = JSON.parse(decoded) as {id?: unknown; role?: unknown; exp?: unknown};
    if (
      typeof value.id !== 'string' ||
      value.role !== 'admin' ||
      typeof value.exp !== 'number' ||
      value.exp <= Date.now()
    )
      return null;
    return {id: value.id, role: value.role};
  } catch {
    return null;
  }
}

export async function requireAuth(
  request: Request,
  context: {env: unknown},
): Promise<AuthUser> {
  const user = await getAuthenticatedUser(request, context);
  if (user) return user;
  const url = new URL(request.url);
  const returnTo = `${url.pathname}${url.search}`;
  throw new Response(null, {
    status: 302,
    headers: {Location: `/login?returnTo=${encodeURIComponent(returnTo)}`},
  });
}

export async function requireAdmin(request: Request, context: {env: unknown}) {
  const user = await requireAuth(request, context);
  if (user.role !== 'admin') throw new Response('Forbidden', {status: 403});
  return user;
}

export async function loginResponse(
  request: Request,
  context: {env: unknown},
  user: AuthUser,
  returnTo?: string | null,
) {
  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: safeReturnTo(returnTo ?? url.searchParams.get('returnTo')),
      'Set-Cookie': await createSessionCookie(context, user),
    },
  });
}

export function logoutResponse(returnTo = '/') {
  return new Response(null, {
    status: 302,
    headers: {Location: safeReturnTo(returnTo), 'Set-Cookie': clearSessionCookie()},
  });
}
