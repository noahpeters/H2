/** Inches. These are editable fabrication assumptions, never saved design edits. */
export const DEFAULT_CONSTRUCTION = {
  carcassThickness: 0.75,
  dadoDepth: 0.375,
  backThickness: 0.25,
  backGrooveDepth: 0.25,
  stretcherWidth: 3,
  drawerThickness: 0.625,
  drawerRabbetDepth: 0.3125,
  drawerBottomThickness: 0.375,
  drawerGrooveDepth: 0.25,
  drawerBottomInset: 0.5,
  drawerSideHeight: 6,
  drawerWidthDeduction: 1.25,
  drawerDepthDeduction: 3,
  shakerRailWidth: 2.25,
  shakerPanelThickness: 0.25,
  shakerGrooveDepth: 0.25,
};
export type ConstructionProfile = typeof DEFAULT_CONSTRUCTION;
export const CONSTRUCTION_FIELDS = Object.keys(
  DEFAULT_CONSTRUCTION,
) as (keyof ConstructionProfile)[];
export function constructionProfile(
  params: URLSearchParams,
): ConstructionProfile {
  const profile = {...DEFAULT_CONSTRUCTION};
  for (const key of CONSTRUCTION_FIELDS) {
    const value = params.get(key);
    if (value !== null) profile[key] = Number(value);
    if (
      !Number.isFinite(profile[key]) ||
      profile[key] <= 0 ||
      profile[key] > 12
    )
      throw new Error(`Invalid construction setting: ${key}`);
  }
  if (
    profile.dadoDepth >= profile.carcassThickness ||
    profile.backGrooveDepth >= profile.carcassThickness ||
    profile.drawerRabbetDepth >= profile.drawerThickness ||
    profile.drawerGrooveDepth >= profile.drawerThickness
  )
    throw new Error(
      'Joint depth must be less than the receiving stock thickness.',
    );
  return profile;
}
