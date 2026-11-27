import {UTM_KEYS, UUID} from '../intake/protocol';
import {isAdLandingKind} from '../../studio/adLandingContent';

export const SESSION_MS = 30 * 60 * 1000;
export const ARRIVAL_TIMING = 'h2-acquisition';
export const IDENTITY = 'ft_acquisition';
const clickKeys = ['fbclid', 'gclid', 'gbraid', 'wbraid'] as const;
const campaignKeys = [
  ...UTM_KEYS,
  'utm_id',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',
  'campaignid',
  'campaign_id',
  'adgroupid',
  'adgroup_id',
  'adset_id',
  'adsetid',
  'ad_id',
  'adid',
  'creative',
  'creative_id',
];

export type Identity = {visitorId: string; sessionId: string};
export type BrowserEvent = Identity & {
  id: string;
  kind: 'view' | 'inquiry_cta' | 'configurator_cta' | 'ad_attribution';
  path: string;
  occurredAt: string;
  version: string;
  referrer?: string;
  arrivalId?: string;
  viewId?: string;
  attribution?: Record<string, string>;
};
export type AcquisitionEvent = {
  id: string;
  path: string;
  occurredAt: string;
  origin: string;
  url: string;
  experience: string;
  version: string;
} & (
  | {
      kind: 'arrival';
      traffic: 'navigation' | 'prefetch' | 'known_bot';
      referrer?: string;
    }
  | BrowserEvent
  | ({kind: 'inquiry_accepted'; submissionId: string} & Identity)
);

export function publicPath(path: string) {
  const normalized = path.replace(/\/$/, '') || '/';
  const landing = normalized.match(/^\/inquire\/([a-z-]+)$/)?.[1];
  if (landing && isAdLandingKind(landing)) return normalized;
  if (
    /^\/(?:about|contact|cutting-boards|configurator|cabinet-configurator(?:\/custom-unit)?|collections|policies|blogs|search)?$/.test(
      normalized,
    )
  )
    return normalized;
  if (
    /^\/(?:collections|products|pages|policies|blogs)\/[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(
      normalized,
    )
  )
    return normalized;
  return undefined;
}

export function referrerOrigin(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const {origin, protocol} = new URL(value);
    if (protocol === 'https:' || protocol === 'http:') return origin;
  } catch {
    // External referrer can be absent or invalid.
  }
  return undefined;
}

function attributionFields(input: URLSearchParams, keys: readonly string[]) {
  const fields = Object.fromEntries(
    keys.flatMap((key) => {
      const value = input.get(key)?.trim();
      const click = clickKeys.some((entry) => entry === key);
      if (!value || value.length > (click ? 2000 : 200)) return [];
      if (
        click
          ? !/^[\w.~-]+$/.test(value)
          : !/^[\p{L}\p{N} ._~+:/()-]+$/u.test(value)
      )
        return [];
      return [[key, value]];
    }),
  );
  return Object.keys(fields).length ? fields : undefined;
}

export function campaignFields(input: URLSearchParams) {
  return attributionFields(input, campaignKeys);
}

export function advertisingClicks(input: URLSearchParams) {
  return attributionFields(input, clickKeys);
}

export function validIdentity(value: unknown): value is Identity {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Identity>;
  return (
    typeof v.visitorId === 'string' &&
    UUID.test(v.visitorId) &&
    typeof v.sessionId === 'string' &&
    UUID.test(v.sessionId)
  );
}

export function validExperienceVersion(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{1,200}$/.test(value);
}

export function browserEvent(
  input: unknown,
  marketing: boolean,
): BrowserEvent | undefined {
  if (!validIdentity(input)) return undefined;
  const v = input as Partial<BrowserEvent> & Identity;
  if (
    typeof v.id !== 'string' ||
    !UUID.test(v.id) ||
    typeof v.path !== 'string' ||
    !publicPath(v.path) ||
    !validExperienceVersion(v.version) ||
    typeof v.occurredAt !== 'string' ||
    !Number.isFinite(Date.parse(v.occurredAt))
  )
    return undefined;
  if (
    v.kind !== 'view' &&
    v.kind !== 'inquiry_cta' &&
    v.kind !== 'configurator_cta' &&
    v.kind !== 'ad_attribution'
  )
    return undefined;
  const fields = new URLSearchParams();
  if (v.attribution && typeof v.attribution === 'object') {
    for (const [key, value] of Object.entries(v.attribution)) {
      if (typeof value === 'string') fields.set(key, value);
    }
  }
  const adClicks =
    v.kind === 'ad_attribution' && marketing
      ? advertisingClicks(fields)
      : undefined;
  if (
    v.kind === 'ad_attribution' &&
    (!adClicks || typeof v.viewId !== 'string' || !UUID.test(v.viewId))
  )
    return undefined;
  return {
    id: v.id,
    kind: v.kind,
    version: v.version,
    path: publicPath(v.path)!,
    occurredAt: new Date(v.occurredAt).toISOString(),
    visitorId: v.visitorId,
    sessionId: v.sessionId,
    ...(adClicks ? {viewId: v.viewId, attribution: adClicks} : {}),
    ...(v.kind === 'view'
      ? {
          attribution: campaignFields(fields),
          referrer: referrerOrigin(v.referrer),
          arrivalId:
            typeof v.arrivalId === 'string' && UUID.test(v.arrivalId)
              ? v.arrivalId
              : undefined,
        }
      : {}),
  };
}
