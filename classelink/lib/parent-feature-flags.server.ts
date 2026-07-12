import { publicPrisma } from '@/lib/db/public'
import { PARENT_FEATURES, type FeatureOverride } from '@/lib/parent-feature-flags'

/** Renvoie la carte { clé -> override } pour toutes les fonctionnalités (null si non défini = auto). */
export async function getFeatureOverrides(): Promise<Record<string, FeatureOverride>> {
  const rows = await (publicPrisma as any).parentFeatureFlag.findMany()
  const map: Record<string, FeatureOverride> = {}
  for (const f of PARENT_FEATURES) map[f.key] = null
  for (const row of rows) map[row.key] = row.override as FeatureOverride
  return map
}
