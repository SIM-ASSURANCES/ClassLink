import { publicPrisma } from '@/lib/db/public'
import { getTenantPrisma } from '@/lib/db/tenant'
import { sendDataPush, isPushEnabled } from '@/lib/firebase-admin'
import { PARENT_FEATURES, type FeatureOverride } from '@/lib/parent-feature-flags'

/** Renvoie la carte { clé -> override } pour toutes les fonctionnalités (null si non défini = auto). */
export async function getFeatureOverrides(): Promise<Record<string, FeatureOverride>> {
  const rows = await (publicPrisma as any).parentFeatureFlag.findMany()
  const map: Record<string, FeatureOverride> = {}
  for (const f of PARENT_FEATURES) map[f.key] = null
  for (const row of rows) map[row.key] = row.override as FeatureOverride
  return map
}

/**
 * Notifie instantanément toutes les apps mobiles parent (toutes écoles
 * confondues, ces verrous étant globaux à la plateforme) qu'un verrou de
 * fonctionnalité vient de changer, via un push FCM silencieux (data-only,
 * `{"type": "sync"}`) qui déclenche un rafraîchissement côté app — voir
 * AutoRefresh dans classlink_mobile/lib/main.dart. Best-effort : ne doit
 * jamais faire échouer l'action super-admin appelante.
 */
export async function notifyAllParentsFeatureFlagsChanged(): Promise<void> {
  if (!isPushEnabled()) return
  try {
    const schools = await (publicPrisma as any).school.findMany({
      select: { schemaName: true },
    })

    await Promise.all(schools.map(async (school: { schemaName: string }) => {
      try {
        const tenantDb = getTenantPrisma(school.schemaName) as any
        const devices: any[] = await tenantDb.$queryRaw`
          SELECT dt.token FROM device_tokens dt
          JOIN users u ON u.id = dt.user_id
          WHERE u.role = 'PARENT'
        `
        if (devices.length === 0) return

        const tokens = devices.map(d => d.token as string)
        const result = await sendDataPush(tokens, { type: 'sync' })

        if (result.invalidTokens.length > 0) {
          await tenantDb.$executeRaw`
            DELETE FROM device_tokens WHERE token = ANY(${result.invalidTokens})
          `
        }
      } catch {
        // École sans schéma tenant accessible (ou table device_tokens absente) — on l'ignore.
      }
    }))
  } catch (e) {
    console.error('[notifyAllParentsFeatureFlagsChanged] Échec envoi push (ignoré) :', e)
  }
}
