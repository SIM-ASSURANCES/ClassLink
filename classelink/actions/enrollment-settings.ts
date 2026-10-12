'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/rbac'
import { getTenantPrisma } from '@/lib/db/tenant'
import { publicPrisma } from '@/lib/db/public'
import { toActionError } from '@/lib/errors'
import { DOCUMENT_DEFS, FIELD_DEFS, loadEnrollmentSettings, type EnrollmentSettings, type FieldMode } from '@/lib/enrollment/config'
import type { ActionResult } from '@/types'

const MODES: FieldMode[] = ['required', 'optional', 'hidden']

async function getAdminDb() {
  const session = await requireRole('ADMIN')
  return { db: getTenantPrisma(session.user.schemaName) as any, session }
}

export interface EnrollmentSettingsView {
  settings:  EnrollmentSettings
  levels:    { id: string; name: string }[]
  slug:      string | null
  publicUrl: string | null
}

/** Configuration courante + niveaux disponibles + lien public, pour l'écran admin. */
export async function getEnrollmentSettingsAdmin(): Promise<ActionResult<EnrollmentSettingsView>> {
  try {
    const { db, session } = await getAdminDb()
    const settings = await loadEnrollmentSettings(db)
    const levels: any[] = await db.$queryRaw`SELECT id, name FROM levels ORDER BY level_order`
    const school = await (publicPrisma as any).school.findUnique({
      where: { schemaName: session.user.schemaName }, select: { slug: true },
    })
    const slug = school?.slug ?? null
    const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
    return {
      success: true,
      data: { settings, levels, slug, publicUrl: slug ? `${base}/enroll/${slug}` : null },
    }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

export interface EnrollableClass { id: string; name: string; level: string; capacity: number | null; enrolled: number }

/** Classes de l'année courante avec leurs places — pour choisir la classe à l'acceptation d'une candidature. */
export async function getEnrollableClasses(): Promise<EnrollableClass[]> {
  const session = await requireRole('ADMIN', 'CENSOR')
  const db = getTenantPrisma(session.user.schemaName) as any
  const rows: any[] = await db.$queryRaw`
    SELECT c.id, c.name, l.name AS level, c.max_students,
           (SELECT COUNT(*)::int FROM enrollments e WHERE e.class_id = c.id AND e.status = 'ACTIVE') AS enrolled
    FROM classes c
    JOIN levels l ON l.id = c.level_id
    JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current = TRUE
    ORDER BY l.level_order, c.name
  `
  return rows.map(r => ({ id: r.id, name: r.name, level: r.level, capacity: r.max_students, enrolled: r.enrolled }))
}

function text(formData: FormData, key: string, max: number): string | null {
  const v = (formData.get(key) as string | null)?.trim()
  return v ? v.slice(0, max) : null
}

function date(formData: FormData, key: string): Date | null {
  const v = (formData.get(key) as string | null)?.trim()
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

export async function saveEnrollmentSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { db } = await getAdminDb()
    await loadEnrollmentSettings(db) // garantit l'existence des tables

    const isOpen            = formData.get('is_open') === 'on'
    const requireConditions = formData.get('require_conditions') === 'on'
    const notifyAdmins      = formData.get('notify_admins') === 'on'
    const opensAt           = date(formData, 'opens_at')
    const closesAt          = date(formData, 'closes_at')
    const welcomeTitle      = text(formData, 'welcome_title', 120)
    const welcomeMessage    = text(formData, 'welcome_message', 1000)
    const conditionsText    = text(formData, 'conditions_text', 4000)

    if (opensAt && closesAt && closesAt <= opensAt) {
      return { success: false, error: 'La date de fermeture doit être postérieure à la date d\'ouverture.' }
    }
    if (requireConditions && !conditionsText) {
      return { success: false, error: 'Saisissez les conditions d\'admission à faire accepter, ou désactivez l\'obligation.' }
    }

    // Niveaux : on ne garde que ceux qui existent réellement (jamais un id venu du client tel quel).
    const requested = formData.getAll('level').map(String)
    const existing: any[] = await db.$queryRaw`SELECT id FROM levels`
    const knownIds = new Set(existing.map(l => l.id as string))
    const levelIds = requested.filter(id => knownIds.has(id))

    const fieldConfig: Record<string, FieldMode> = {}
    for (const def of FIELD_DEFS) {
      const v = formData.get(`field_${def.key}`) as FieldMode | null
      fieldConfig[def.key] = v && MODES.includes(v) ? v : def.defaultMode
    }
    const documentsConfig: Record<string, FieldMode> = {}
    for (const def of DOCUMENT_DEFS) {
      const v = formData.get(`doc_${def.key}`) as FieldMode | null
      documentsConfig[def.key] = v && MODES.includes(v) ? v : 'hidden'
    }

    // Le niveau n'a de sens que s'il y a des niveaux à proposer.
    if (fieldConfig.level !== 'hidden' && levelIds.length === 0) {
      return { success: false, error: 'Cochez au moins un niveau proposé, ou masquez le champ « Niveau souhaité ».' }
    }

    const existingRow: any[] = await db.$queryRaw`SELECT id FROM enrollment_settings LIMIT 1`
    const fieldJson = JSON.stringify(fieldConfig)
    const docJson   = JSON.stringify(documentsConfig)

    if (existingRow[0]) {
      await db.$executeRaw`
        UPDATE enrollment_settings SET
          is_open = ${isOpen}, opens_at = ${opensAt}, closes_at = ${closesAt},
          welcome_title = ${welcomeTitle}, welcome_message = ${welcomeMessage},
          conditions_text = ${conditionsText}, require_conditions = ${requireConditions},
          offered_level_ids = ${levelIds}::text[],
          field_config = ${fieldJson}::jsonb, documents_config = ${docJson}::jsonb,
          notify_admins = ${notifyAdmins}, updated_at = NOW()
        WHERE id = ${existingRow[0].id}
      `
    } else {
      await db.$executeRaw`
        INSERT INTO enrollment_settings
          (is_open, opens_at, closes_at, welcome_title, welcome_message, conditions_text,
           require_conditions, offered_level_ids, field_config, documents_config, notify_admins)
        VALUES
          (${isOpen}, ${opensAt}, ${closesAt}, ${welcomeTitle}, ${welcomeMessage}, ${conditionsText},
           ${requireConditions}, ${levelIds}::text[], ${fieldJson}::jsonb, ${docJson}::jsonb, ${notifyAdmins})
      `
    }

    revalidatePath('/admin/enrollments')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}
