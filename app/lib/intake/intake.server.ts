import {
  attribution,
  MARKETING_DISCLOSURE,
  MARKETING_VERSION,
  type Intake,
} from './protocol';
export type IntakeEnv = {
  CABINET_ROOMS_URL?: string;
  CABINET_ROOMS_TOKEN?: string;
};
/** Acceptance means the complete immutable event is durably committed, not merely queued in memory. */
export async function acceptIntake(intake: Intake, env: IntakeEnv) {
  if (!env.CABINET_ROOMS_URL || !env.CABINET_ROOMS_TOKEN)
    throw new Error('intake_not_configured');
  const response = await fetch(new URL('/intake', env.CABINET_ROOMS_URL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.CABINET_ROOMS_TOKEN}`,
    },
    body: JSON.stringify(intake),
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
  });
  const receipt = (await response.json()) as {
    accepted?: boolean;
    submissionId?: string;
  };
  if (response.status === 409) throw new Error('intake_conflict');
  if (
    !response.ok ||
    !receipt.accepted ||
    receipt.submissionId !== intake.submissionId
  )
    throw new Error(`intake_not_accepted:${response.status}`);
}
export function cabinetIntake(
  body: {
    requestId: string;
    senderName: string;
    senderEmail: string;
    senderPhone?: string;
    consent: boolean;
    slug: string;
    revision: number;
    marketingConsent?: string;
    sourceQuery?: string;
  },
  request: Request,
  purpose: 'share' | 'price',
): Intake {
  const source = new URL('/cabinet-configurator', request.url);
  source.search = body.sourceQuery || '';
  return {
    submissionId: body.requestId,
    name: body.senderName.trim(),
    email: body.senderEmail.trim().toLowerCase(),
    phone: body.consent ? body.senderPhone || '' : '',
    projectType: 'Kitchen or pantry',
    location: '',
    timeline: '',
    budget: '',
    message: `Cabinet ${purpose} request. Design: ${source.origin}/cabinet-configurator?design=${body.slug}. Revision: ${body.revision}. Project contact permission: ${body.consent ? 'granted' : 'not_provided'}.`,
    sourcePath: source.pathname,
    sourceKind: `cabinet_${purpose}`,
    configuratorSource: 'cabinet',
    utm: attribution(source),
    marketingConsent:
      body.marketingConsent === 'granted' ? 'granted' : 'not_provided',
    marketingVersion: MARKETING_VERSION,
    marketingDisclosure: MARKETING_DISCLOSURE,
    details: {
      designSlug: body.slug,
      revision: body.revision,
      projectContactConsent: body.consent ? 'granted' : 'not_provided',
    },
  };
}
