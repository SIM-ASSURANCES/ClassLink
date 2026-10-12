'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/rbac'
import { getTenantPrisma } from '@/lib/db/tenant'
import { publicPrisma } from '@/lib/db/public'
import { toActionError } from '@/lib/errors'
import { generateApiKey } from '@/lib/enrollment/api-auth'
import { ensureEnrollmentSchema } from '@/lib/enrollment/schema'
import type { ActionResult } from '@/types'

// Un compte « clé API » donne le pouvoir de créer des élèves : réservé à l'ADMIN
// (pas CENSOR/STAFF, contrairement à la lecture des candidatures).
const MAX_ACTIVE_KEYS = 5

async function getAdminDb() {
  const session = await requireRole('ADMIN')
  const db = getTenantPrisma(session.user.schemaName) as any
  await ensureEnrollmentSchema(db)
  return { db, session }
}

export async function listApiKeys(): Promise<ActionResult<any[]>> {
  try {
    const { db } = await getAdminDb()
    const rows: any[] = await db.$queryRaw`
      SELECT id, name, key_prefix, is_active, last_used_at, created_at, revoked_at
      FROM enrollment_api_keys
      ORDER BY created_at DESC
    `
    return { success: true, data: rows }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

/** Crée une clé. La valeur complète n'est renvoyée QU'ICI, une seule fois : seul son hash est conservé. */
export async function createApiKey(name: string): Promise<ActionResult<{ id: string; fullKey: string }>> {
  const label = name.trim()
  if (label.length < 2 || label.length > 60) {
    return { success: false, error: 'Donnez un nom de 2 à 60 caractères (ex. « Logiciel de scolarité »).' }
  }

  try {
    const { db, session } = await getAdminDb()

    const active: any[] = await db.$queryRaw`SELECT COUNT(*)::int AS n FROM enrollment_api_keys WHERE is_active = TRUE`
    if (active[0].n >= MAX_ACTIVE_KEYS) {
      return { success: false, error: `Maximum ${MAX_ACTIVE_KEYS} clés actives. Révoquez-en une d'abord.` }
    }

    const school = await (publicPrisma as any).school.findUnique({
      where: { schemaName: session.user.schemaName }, select: { slug: true },
    })
    if (!school) return { success: false, error: 'Établissement introuvable.' }

    const { fullKey, prefix, hash } = generateApiKey(school.slug)
    const rows: any[] = await db.$queryRaw`
      INSERT INTO enrollment_api_keys (name, key_prefix, key_hash, created_by)
      VALUES (${label}, ${prefix}, ${hash}, ${session.user.id})
      RETURNING id
    `

    revalidatePath('/admin/enrollments')
    return { success: true, data: { id: rows[0].id, fullKey } }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

export async function revokeApiKey(keyId: string): Promise<ActionResult> {
  try {
    const { db } = await getAdminDb()
    await db.$executeRaw`
      UPDATE enrollment_api_keys SET is_active = FALSE, revoked_at = NOW()
      WHERE id = ${keyId} AND is_active = TRUE
    `
    revalidatePath('/admin/enrollments')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}
