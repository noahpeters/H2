import {createCookie} from 'react-router';
import {isbot} from 'isbot';
import {
  ARRIVAL_TIMING,
  IDENTITY,
  SESSION_MS,
  publicPath,
  referrerOrigin,
  validIdentity,
  validExperienceVersion,
  type AcquisitionEvent,
  type Identity,
} from './protocol';

export type AcquisitionEnv = {
  ACQUISITION_MODE?: string;
  ACQUISITION_VISITOR_TTL_SECONDS?: string;
  ACQUISITION_EXPERIENCE_VERSION?: string;
  CABINET_ROOMS_URL?: string;
  CABINET_ROOMS_TOKEN?: string;
  SESSION_SECRET?: string;
};

export function acquisitionConfig(env: AcquisitionEnv) {
  const mode = env.ACQUISITION_MODE;
  const visitorTtl = Number(env.ACQUISITION_VISITOR_TTL_SECONDS);
  if (
    mode === 'coarse-arrivals' &&
    Number.isSafeInteger(visitorTtl) &&
    visitorTtl > 0 &&
    env.CABINET_ROOMS_URL &&
    env.CABINET_ROOMS_TOKEN &&
    env.SESSION_SECRET
  ) {
    return {visitorTtl, version: acquisitionVersion(env)};
  }
  return undefined;
}

function identityCookie(secret: string) {
  return createCookie(IDENTITY, {
    secrets: [secret],
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MS / 1000,
  });
}

export function privacyOptOut(request: Request) {
  return (
    request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1'
  );
}

export async function readAcquisitionIdentity(
  request: Request,
  env: AcquisitionEnv,
): Promise<Identity | undefined> {
  if (!acquisitionConfig(env) || privacyOptOut(request)) return undefined;
  const value: unknown = await identityCookie(env.SESSION_SECRET!)
    .parse(request.headers.get('Cookie'))
    .catch(() => undefined);
  if (!validIdentity(value)) return undefined;
  const expiresAt = (value as Identity & {expiresAt?: number}).expiresAt;
  if (!expiresAt || expiresAt <= Date.now()) return undefined;
  return {visitorId: value.visitorId, sessionId: value.sessionId};
}

export function acquisitionCookie(
  env: AcquisitionEnv,
  identity?: Identity,
  occurredAt?: string,
) {
  const maxAge = Math.floor(
    (Math.min(Date.parse(occurredAt || '') || 0, Date.now()) +
      SESSION_MS -
      Date.now()) /
      1000,
  );
  return identity && maxAge > 0
    ? identityCookie(env.SESSION_SECRET!).serialize(
        {...identity, expiresAt: Date.now() + maxAge * 1000},
        {maxAge},
      )
    : identityCookie(env.SESSION_SECRET!).serialize('', {maxAge: 0});
}

function acquisitionVersion(env: AcquisitionEnv) {
  return validExperienceVersion(env.ACQUISITION_EXPERIENCE_VERSION)
    ? env.ACQUISITION_EXPERIENCE_VERSION
    : 'baseline-v1';
}

export function experience(env: AcquisitionEnv, origin: string, path: string) {
  return {
    origin,
    url: new URL(path, origin).href,
    experience: path.startsWith('/inquire/')
      ? path.slice(9)
      : path === '/'
        ? 'home'
        : path.slice(1),
    version: acquisitionVersion(env),
  };
}

export async function deliverAcquisition(
  event: AcquisitionEvent,
  env: AcquisitionEnv,
  ip?: string,
) {
  try {
    return await fetch(
      new URL('/analytics/acquisition', env.CABINET_ROOMS_URL),
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: `Bearer ${env.CABINET_ROOMS_TOKEN}`,
          'Content-Type': 'application/json',
          ...(ip ? {'X-Client-IP': ip} : {}),
        },
        body: JSON.stringify(event),
      },
    );
  } catch {
    return new Response(null, {status: 503});
  }
}

// Keep a single immutable envelope across timeouts and uncertain acknowledgements.
export async function deliverFromOxygen(
  event: AcquisitionEvent,
  env: AcquisitionEnv,
  ip?: string,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await deliverAcquisition(event, env, ip);
    if (response.ok) return;
    if (response.status < 500) break;
  }
  console.warn('acquisition_delivery_failed', {kind: event.kind, id: event.id});
}

export function captureArrival(
  request: Request,
  response: Response,
  env: AcquisitionEnv,
  waitUntil: (work: Promise<unknown>) => void,
  observedAt: string,
) {
  if (
    !acquisitionConfig(env) ||
    privacyOptOut(request) ||
    request.method !== 'GET' ||
    !response.ok ||
    !response.headers.get('Content-Type')?.startsWith('text/html')
  )
    return;
  const {origin, pathname} = new URL(request.url);
  const path = publicPath(pathname);
  const destination = request.headers.get('Sec-Fetch-Dest');
  if (!path || (destination && destination !== 'document')) return;
  const purpose = [
    request.headers.get('Sec-Purpose'),
    request.headers.get('Purpose'),
  ].join(' ');
  const traffic = /\b(?:prefetch|prerender)\b/i.test(purpose)
    ? 'prefetch'
    : isbot(request.headers.get('User-Agent') || '')
      ? 'known_bot'
      : 'navigation';
  const id = crypto.randomUUID();
  if (traffic !== 'known_bot') {
    response.headers.append('Server-Timing', `${ARRIVAL_TIMING};desc="${id}"`);
    // The arrival ID is unique to this request and must never be shared by an HTTP cache.
    response.headers.set('Cache-Control', 'private, no-store');
  }
  waitUntil(
    deliverFromOxygen(
      {
        id,
        kind: 'arrival',
        traffic,
        path,
        occurredAt: observedAt,
        referrer: referrerOrigin(request.headers.get('Referer')),
        ...experience(env, origin, path),
      },
      env,
      request.headers.get('oxygen-buyer-ip') || undefined,
    ),
  );
}
