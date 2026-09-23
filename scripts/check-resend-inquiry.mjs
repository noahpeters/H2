// Read-only release guard. An Events API success alone does not prove an automation runs.
const key = process.env.RESEND_API_KEY;
if (!key) throw new Error('Missing RESEND_API_KEY');
async function read(path) {
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: {Authorization: `Bearer ${key}`},
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(`Resend readiness lookup failed: ${response.status}`);
  return response.json();
}
let after;
let ready = false;
do {
  const page = await read(
    `/automations?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`,
  );
  for (const automation of page.data ?? []) {
    if (automation.status !== 'enabled') continue;
    const detail = await read(
      `/automations/${encodeURIComponent(automation.id)}`,
    );
    if (
      detail.status === 'enabled' &&
      detail.steps?.some(
        (step) =>
          step.type === 'trigger' &&
          step.config?.event_name === 'inquiry.received',
      )
    ) {
      ready = true;
      break;
    }
  }
  if (ready || !page.has_more) break;
  after = page.data?.at(-1)?.id;
  if (!after) throw new Error('Invalid Resend pagination response');
} while (after);
if (!ready)
  throw new Error(
    'No enabled inquiry.received automation. Enable and smoke-test recipient routing before replacing direct inquiry email.',
  );
