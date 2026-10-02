import {
  jsonResponse,
  validStudy,
} from '../../app/studio/cabinet-configurator/savedRoomProtocol';
import {constructionProfile} from '../../app/studio/cabinet-configurator/fabrication/profile';
import {resolveFabrication} from '../../app/studio/cabinet-configurator/fabrication/resolve';
import {FabricationError} from '../../app/studio/cabinet-configurator/fabrication/model';
import {exportBundle} from '../../app/studio/cabinet-configurator/fabrication/bundle';
import {sessionId, type AnalyticsDB} from './analytics';

export async function fabricationExport(request: Request, db: AnalyticsDB) {
  if (request.method !== 'GET')
    return jsonResponse({error: 'Method not allowed'}, 405);
  const params = new URL(request.url).searchParams;
  const slug = sessionId(params.get('slug'));
  const revision = Number(params.get('revision'));
  if (
    !slug ||
    !params.has('revision') ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    return jsonResponse({error: 'Invalid design revision'}, 400);
  let profile;
  try {
    profile = constructionProfile(params);
  } catch (error) {
    return jsonResponse(
      {
        error: 'invalid_construction_profile',
        issues: [error instanceof Error ? error.message : 'Invalid settings'],
      },
      400,
    );
  }
  const row = await db
    .prepare('SELECT slug,data,updated_at,revision FROM rooms WHERE slug=?')
    .bind(slug)
    .first<{
      slug: string;
      data: string;
      updated_at: string;
      revision: number;
    }>();
  if (!row) return jsonResponse({error: 'design_not_found'}, 404);
  if (row.revision !== revision)
    return jsonResponse({error: 'design_revision_changed'}, 409);
  let design;
  try {
    design = JSON.parse(row.data);
  } catch {
    return jsonResponse({error: 'invalid_saved_design'}, 422);
  }
  if (!validStudy(design))
    return jsonResponse({error: 'invalid_saved_design'}, 422);
  try {
    const manifest = resolveFabrication(
      design as Parameters<typeof resolveFabrication>[0],
      {slug, revision, updatedAt: row.updated_at},
      profile,
    );
    return jsonResponse(exportBundle(manifest));
  } catch (error) {
    if (error instanceof FabricationError)
      return jsonResponse(
        {error: 'fabrication_needs_review', issues: error.issues},
        422,
      );
    throw error;
  }
}
