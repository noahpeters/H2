export const featureFlagNames = [
  "table-shape-rectangle",
  "table-shape-circle",
  "table-shape-oval",
] as const;

export type FeatureFlagName = (typeof featureFlagNames)[number];
export type FeatureFlags = Record<FeatureFlagName, boolean>;

function environmentBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return !["0", "false", "no", "off", "disabled"].includes(value.trim().toLowerCase());
}

// These values are intentionally public: they control presentation only and
// contain no secrets. Vite exposes the same defaults to the client.
export const environmentFeatureFlags: FeatureFlags = {
  "table-shape-rectangle": environmentBoolean(
    import.meta.env.VITE_FEATURE_TABLE_SHAPE_RECTANGLE,
    true,
  ),
  "table-shape-circle": environmentBoolean(
    import.meta.env.VITE_FEATURE_TABLE_SHAPE_CIRCLE,
    false,
  ),
  "table-shape-oval": environmentBoolean(
    import.meta.env.VITE_FEATURE_TABLE_SHAPE_OVAL,
    false,
  ),
};

function canonicalFlagName(value: string): FeatureFlagName | null {
  let normalized = value
    .trim()
    .replace(/^NEXT_PUBLIC_FEATURE_/i, "")
    .replace(/^FEATURE_/i, "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (["rectangle", "circle", "oval"].includes(normalized)) {
    normalized = `table-shape-${normalized}`;
  }
  return featureFlagNames.find((name) => name === normalized) ?? null;
}

function requestedFlags(search: URLSearchParams, parameter: "env_enable" | "env_disable") {
  return search
    .getAll(parameter)
    .flatMap((value) => value.split(/[\s,]+/))
    .map(canonicalFlagName)
    .filter((name): name is FeatureFlagName => name !== null);
}

export function featureFlagsForRequest(
  search: URLSearchParams,
  defaults: FeatureFlags = environmentFeatureFlags,
) {
  const result = { ...defaults };
  requestedFlags(search, "env_enable").forEach((name) => {
    result[name] = true;
  });
  // An explicit disable wins if a flag appears in both parameters.
  requestedFlags(search, "env_disable").forEach((name) => {
    result[name] = false;
  });
  return result;
}

export function featureOverrideSuffix(search: URLSearchParams) {
  const overrides = new URLSearchParams();
  for (const parameter of ["env_enable", "env_disable"] as const) {
    search.getAll(parameter).forEach((value) => overrides.append(parameter, value));
  }
  const encoded = overrides.toString();
  return encoded ? `&${encoded}` : "";
}
