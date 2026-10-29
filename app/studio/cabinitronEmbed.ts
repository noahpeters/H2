const DESIGNER = 'https://cabinitron.com/t/from-trees/cabinet-configurator';
export function cabinitronEmbedUrl(input: string) {
  const query = new URL(input).searchParams,
    target = new URL(DESIGNER);
  for (const key of [
    'design',
    'preset',
    'project',
    'share',
    'revision',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'fbclid',
  ]) {
    const value = query.get(key);
    if (value && value.length <= 2048) target.searchParams.set(key, value);
  }
  target.searchParams.set('embed', 'studio');
  return target.href;
}
export async function cabinitronMigrationReady(fetcher: typeof fetch = fetch) {
  try {
    const response = await fetcher(
      'https://cabinitron.com/t/from-trees/api/h2-migration-status',
      {
        signal: AbortSignal.timeout(5000),
        headers: {Accept: 'application/json'},
        cache: 'no-store',
      },
    );
    if (!response.ok) return false;
    const result = (await response.json()) as {ready?: boolean};
    return result.ready === true;
  } catch {
    return false;
  }
}

// Match Cabinitron's embed loader protocol while retaining this storefront's
// full-height frame and existing design/share query parameters.
const INSTALLATION_TEST_KEY =
  'cabinitron:https://cabinitron.com:from-trees:test';
export function cabinitronInstallationUrl(
  designerUrl: string,
  browser: Pick<Window, 'location' | 'history' | 'sessionStorage'>,
) {
  const fragment = new URLSearchParams(browser.location.hash.slice(1));
  const token = fragment.get('cabinitron-test') ?? '';
  let test = /^[a-f0-9]{64}$/.test(token) ? token : '';
  try {
    if (test) browser.sessionStorage.setItem(INSTALLATION_TEST_KEY, 'staff');
    else if (browser.sessionStorage.getItem(INSTALLATION_TEST_KEY))
      test = 'staff';
  } catch {
    // The current test still works when browser storage is unavailable.
  }
  if (fragment.has('cabinitron-test')) {
    fragment.delete('cabinitron-test');
    const remaining = fragment.toString();
    try {
      browser.history.replaceState(
        browser.history.state,
        '',
        browser.location.pathname +
          browser.location.search +
          (remaining ? `#${remaining}` : ''),
      );
    } catch {
      // History restrictions must not prevent passing the test to the frame.
    }
  }
  const target = new URL(designerUrl);
  if (test) target.searchParams.set('installTest', test);
  return target.href;
}
