/** Shared wire contract between Oxygen and H2's authenticated durable intake service. */
export const MARKETING_VERSION = 'website-inquiry-v1';
export const MARKETING_DISCLOSURE =
  'Email me occasional From Trees news, new work, and offers. Optional; unsubscribe at any time.';
export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;
export type Intake = {
  submissionId: string;
  name: string;
  email: string;
  phone: string;
  projectType: string;
  location: string;
  timeline: string;
  budget: string;
  message: string;
  sourcePath: string;
  sourceKind: string;
  configuratorSource: '' | 'table' | 'cabinet';
  utm: Record<(typeof UTM_KEYS)[number], string>;
  marketingConsent: 'granted' | 'not_provided';
  marketingVersion: typeof MARKETING_VERSION;
  marketingDisclosure: typeof MARKETING_DISCLOSURE;
  details: Record<string, unknown>;
};
export type StoredIntake = Intake & {submittedAt: string};
export const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function attribution(url: URL) {
  return Object.fromEntries(
    UTM_KEYS.map((key) => [
      key,
      (url.searchParams.get(key) || '').slice(0, 200),
    ]),
  ) as Intake['utm'];
}
export function validIntake(value: unknown): value is Intake {
  if (!value || typeof value !== 'object') return false;
  const v = value as Intake;
  return (
    typeof v.submissionId === 'string' &&
    UUID.test(v.submissionId) &&
    typeof v.email === 'string' &&
    v.email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) &&
    [
      'name',
      'phone',
      'projectType',
      'location',
      'timeline',
      'budget',
      'sourcePath',
      'sourceKind',
    ].every(
      (k) =>
        typeof v[k as keyof Intake] === 'string' &&
        (v[k as keyof Intake] as string).length <= 2000,
    ) &&
    !!v.name.trim() &&
    typeof v.message === 'string' &&
    v.message.length <= 10000 &&
    ['', 'table', 'cabinet'].includes(v.configuratorSource) &&
    ['granted', 'not_provided'].includes(v.marketingConsent) &&
    v.marketingVersion === MARKETING_VERSION &&
    v.marketingDisclosure === MARKETING_DISCLOSURE &&
    !!v.utm &&
    UTM_KEYS.every(
      (k) => typeof v.utm[k] === 'string' && v.utm[k].length <= 200,
    ) &&
    !!v.details &&
    typeof v.details === 'object' &&
    !Array.isArray(v.details)
  );
}
export function resendEvent(v: StoredIntake) {
  return {
    event: 'inquiry.received',
    email: v.email,
    payload: {
      submission_id: v.submissionId,
      submitted_at: v.submittedAt,
      name: v.name,
      // The live configured notification template also binds event.customer_email.
      customer_email: v.email,
      phone: v.phone,
      project_type: v.projectType,
      project_location: v.location,
      timeline: v.timeline,
      budget: v.budget,
      message: v.message,
      source_path: v.sourcePath,
      source_kind: v.sourceKind,
      configurator_source: v.configuratorSource,
      ...v.utm,
      marketing_email_consent: v.marketingConsent,
      marketing_consent_version: v.marketingVersion,
    },
  };
}
/** ftops PR #11 rejects unknown fields. Preserve metadata losslessly inside its message. */
export function ftopsEvent(v: StoredIntake) {
  return {
    externalEventId: v.submissionId,
    email: v.email,
    name: v.name,
    phone: v.phone,
    projectType: v.projectType,
    location: v.location,
    timeline: v.timeline,
    budget: v.budget,
    sourcePath: v.sourcePath,
    message: JSON.stringify({
      format: 'h2-inquiry-v1',
      message: v.message,
      submitted_at: v.submittedAt,
      source_kind: v.sourceKind,
      configurator_source: v.configuratorSource,
      ...v.utm,
      marketing_disclosure: v.marketingDisclosure,
      details: v.details,
    }),
    marketingConsent: {
      state: v.marketingConsent,
      disclosureVersion: v.marketingVersion,
      capturedAt: v.submittedAt,
    },
  };
}
