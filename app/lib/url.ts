type UrlParamValue = string | null | undefined;
type UrlParamsInput = Record<string, UrlParamValue> | URLSearchParams | null;

type BuildUrlWithParamsOptions = {
  basePath: string;
  origin?: string;
  params?: UrlParamsInput;
  preserveParams?: UrlParamsInput;
  returnAbsolute?: boolean;
};

type SelectedOptionLike = {
  name?: string | null;
  value?: string | null;
};

export function getUrlOrigin(explicitOrigin?: string) {
  if (explicitOrigin) return explicitOrigin;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost';
}

function applyParams(
  target: URLSearchParams,
  params?: UrlParamsInput,
): void {
  if (!params) return;
  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => {
      if (value !== '') target.set(key, value);
    });
    return;
  }
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      target.set(key, value);
    }
  });
}

// Builds an internal URL with encoded query params using URL + URLSearchParams.
export function buildUrlWithParams({
  basePath,
  origin,
  params,
  preserveParams,
  returnAbsolute,
}: BuildUrlWithParamsOptions) {
  const resolvedOrigin = getUrlOrigin(origin);
  const url = new URL(basePath, resolvedOrigin);
  const search = new URLSearchParams();

  applyParams(search, preserveParams);
  applyParams(search, params);

  url.search = search.toString();

  return returnAbsolute ? url.toString() : `${url.pathname}${url.search}`;
}

export function buildProductUrl({
  handle,
  selectedOptions,
  origin,
  pathnameOverride,
  preserveParams,
  returnAbsolute,
}: {
  handle: string;
  selectedOptions?: SelectedOptionLike[];
  origin?: string;
  pathnameOverride?: string;
  preserveParams?: UrlParamsInput;
  returnAbsolute?: boolean;
}) {
  const params: Record<string, string> = {};
  selectedOptions?.forEach((option) => {
    if (!option?.name || !option?.value) return;
    params[option.name] = option.value;
  });

  return buildUrlWithParams({
    basePath: pathnameOverride ?? `/products/${handle}`,
    origin,
    params,
    preserveParams,
    returnAbsolute,
  });
}

if (import.meta.env?.DEV) {
  const sample = buildUrlWithParams({
    basePath: '/products/example',
    origin: 'https://example.com',
    params: {'Seating Capacity': 'Seats 4\u20136'},
  });
  if (!sample.includes('%E2%80%93')) {
    console.warn(
      '[url] Expected Unicode option values to be percent-encoded in query params.',
    );
  }
}
