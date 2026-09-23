import {
  attribution,
  resendEvent,
  ftopsEvent,
  type StoredIntake,
  MARKETING_DISCLOSURE,
  MARKETING_VERSION,
  type Intake,
} from './protocol';
export type IntakeEnv = {
  RESEND_API_KEY?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  FTOPS_INTAKE_URL?: string;
  FTOPS_INTAKE_TOKEN?: string;
};
/** Sends from Oxygen. The shop email and event must both be accepted; ftops is best effort. */
export async function acceptIntake(intake: Intake, env: IntakeEnv) {
  if (!env.RESEND_API_KEY) throw new Error('resend_not_configured');
  const event: StoredIntake = {
    ...intake,
    submittedAt: new Date().toISOString(),
  };
  // Restore the direct owner notification. It is addressed independently of
  // Resend Automations, whose email step always targets the event contact.
  await sendInquiryEmail(event, env);

  const response = await fetch('https://api.resend.com/events/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Idempotency-Key': `inquiry-${intake.submissionId}`,
    },
    body: JSON.stringify(resendEvent(event)),
    signal: AbortSignal.timeout(10000),
    redirect: 'manual',
  });
  if (!response.ok) throw new Error(`resend_not_accepted:${response.status}`);
  const receipt = (await response.json()) as {object?: string; event?: string};
  if (receipt.object !== 'event' || receipt.event !== 'inquiry.received')
    throw new Error('resend_invalid_receipt');

  // One bounded attempt, no queue and no automatic retry. Never undo Resend success.
  try {
    if (!env.FTOPS_INTAKE_URL || !env.FTOPS_INTAKE_TOKEN)
      throw new Error('not_configured');
    if (
      !/^https:\/\/[^/?#]+\/website-intake\/[^/?#]+$/.test(env.FTOPS_INTAKE_URL)
    )
      throw new Error('invalid_endpoint');
    const result = await fetch(env.FTOPS_INTAKE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.FTOPS_INTAKE_TOKEN}`,
        'Idempotency-Key': `inquiry-${intake.submissionId}`,
      },
      body: JSON.stringify(ftopsEvent(event)),
      signal: AbortSignal.timeout(2000),
      redirect: 'manual',
    });
    if (!result.ok) throw new Error(`http_${result.status}`);
    const received = (await result.json()) as {
      submissionId?: string;
      status?: string;
    };
    if (
      !received.submissionId ||
      !['linked', 'needs_review'].includes(received.status || '')
    )
      throw new Error('invalid_receipt');
  } catch (error) {
    console.error('ftops_intake_failed', {
      submissionId: intake.submissionId,
      reason:
        error instanceof Error &&
        /^(not_configured|invalid_endpoint|http_\d{3}|invalid_receipt)$/.test(
          error.message,
        )
          ? error.message
          : 'network_or_timeout',
    });
  }
}

async function sendInquiryEmail(intake: StoredIntake, env: IntakeEnv) {
  if (!env.CONTACT_TO_EMAIL || !env.CONTACT_FROM_EMAIL)
    throw new Error('contact_email_not_configured');
  const subjectField = (value: string) =>
    value
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 160);
  const text = [
    `Source: ${intake.sourcePath}`,
    ...Object.entries(intake.utm).map(([key, value]) => `${key}: ${value}`),
    `Name: ${intake.name}`,
    `Email: ${intake.email}`,
    `Phone: ${intake.phone || 'Not provided'}`,
    `Project type: ${intake.projectType}`,
    `Project location: ${intake.location}`,
    `Timeline: ${intake.timeline || 'Not provided'}`,
    `Budget: ${intake.budget || 'Not provided'}`,
    `Configurator source: ${intake.configuratorSource || 'Not provided'}`,
    `Source kind: ${intake.sourceKind}`,
    `Submission ID: ${intake.submissionId}`,
    `Submitted at: ${intake.submittedAt}`,
    `Marketing email consent: ${intake.marketingConsent}`,
    '',
    intake.message,
  ].join('\n');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Idempotency-Key': `project-${intake.submissionId}`,
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL,
      to: env.CONTACT_TO_EMAIL,
      reply_to: intake.email,
      subject: `Project inquiry: ${subjectField(intake.projectType)} — ${subjectField(intake.name)}`,
      text,
    }),
    signal: AbortSignal.timeout(10000),
    redirect: 'manual',
  });
  if (!response.ok)
    throw new Error(`contact_email_not_accepted:${response.status}`);
  const receipt = (await response.json()) as {id?: string};
  if (!receipt.id) throw new Error('contact_email_invalid_receipt');
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
