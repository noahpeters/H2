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
