'use server'

import { revalidatePath } from 'next/cache'
import { getTenantPrisma } from '@/lib/db/tenant'
import { requireRole } from '@/lib/auth/rbac'
import { notifyUser } from '@/lib/notifications/create'
import { toActionError } from '@/lib/errors'
import type { ActionResult } from '@/types'

// Fenêtre pendant laquelle un élève/parent peut contester une note, à compter
// de sa saisie — même délai que la fenêtre d'annulation enseignant (voir
// actions/teacher.ts::GRADE_EDIT_WINDOW_MS).
const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000

// La table grade_disputes est une nouvelle table tenant : elle peut ne pas
// encore exister tant que le schéma n'a pas été resynchronisé. Auto-création
// idempotente au premier usage (même pattern que
// actions/transport.ts::ensureBusSubscriptionsTable).
async function ensureGradeDisputesTable(db: any) {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS grade_disputes (
      id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      grade_id       TEXT NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
      raised_by      TEXT NOT NULL REFERENCES users(id),
      reason         TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
      admin_response TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      resolved_at    TIMESTAMPTZ
    )
  `)
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_grade_disputes_grade ON grade_disputes(grade_id)`
  )
}

/** Élève ou parent conteste une note, dans les 24h suivant sa saisie. */
export async function disputeGrade(gradeId: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return { success: false, error: 'Veuillez préciser le motif de la contestation.' }

  try {
    const session = await requireRole('STUDENT', 'PARENT')
    const db = getTenantPrisma(session.user.schemaName) as any
    await ensureGradeDisputesTable(db)

    const grade: any[] = await db.$queryRaw`
      SELECT g.id, g.student_id, g.created_at, sub.name AS subject_name, u.first_name, u.last_name
      FROM grades g
      JOIN subjects sub ON sub.id = g.subject_id
      JOIN students s ON s.id = g.student_id
      JOIN users u ON u.id = s.user_id
      WHERE g.id = ${gradeId}
      LIMIT 1
    `
    if (!grade[0]) return { success: false, error: 'Note introuvable.' }
    const g = grade[0]

    // Vérifier que le demandeur a le droit de contester cette note.
    if (session.user.role === 'STUDENT') {
      const own: any[] = await db.$queryRaw`SELECT id FROM students WHERE user_id = ${session.user.id} AND id = ${g.student_id} LIMIT 1`
      if (!own[0]) return { success: false, error: 'Accès non autorisé.' }
    } else {
      const check: any[] = await db.$queryRaw`
        SELECT ps.id FROM parent_students ps
        JOIN parents p ON p.id = ps.parent_id
        WHERE p.user_id = ${session.user.id} AND ps.student_id = ${g.student_id}
        LIMIT 1
      `
      if (!check[0]) return { success: false, error: 'Accès non autorisé.' }
    }

    if (Date.now() - new Date(g.created_at).getTime() > DISPUTE_WINDOW_MS) {
      return { success: false, error: 'Le délai de 24h pour contester cette note est dépassé.' }
    }

    const existing: any[] = await db.$queryRaw`SELECT id FROM grade_disputes WHERE grade_id = ${gradeId} LIMIT 1`
    if (existing[0]) return { success: false, error: 'Cette note fait déjà l\'objet d\'une réclamation.' }

    await db.$executeRaw`
      INSERT INTO grade_disputes (grade_id, raised_by, reason)
      VALUES (${gradeId}, ${session.user.id}, ${reason.trim()})
    `

    // Notifie les admins/censeurs et l'enseignant à l'origine de la note (best-effort).
    const staff: any[] = await db.$queryRaw`SELECT id FROM users WHERE role IN ('ADMIN','CENSOR') AND is_active = TRUE`
    const teacher: any[] = await db.$queryRaw`SELECT created_by FROM grades WHERE id = ${gradeId}`
    const title = 'Note contestée'
    const body  = `${g.first_name} ${g.last_name} conteste une note en ${g.subject_name}.`
    await Promise.all([
      ...staff.map((s: any) => notifyUser(db, { userId: s.id, type: 'GRADE_DISPUTED', title, body, href: '/admin/grades' })),
      teacher[0]?.created_by
        ? notifyUser(db, { userId: teacher[0].created_by, type: 'GRADE_DISPUTED', title, body, href: '/teacher/grades' })
        : Promise.resolve(),
    ])

    revalidatePath('/admin/grades')
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

/** Toutes les réclamations, pour la supervision admin (voir /admin/grades). */
export async function getGradeDisputes(): Promise<ActionResult<any[]>> {
  try {
    const session = await requireRole('ADMIN', 'CENSOR')
    const db = getTenantPrisma(session.user.schemaName) as any
    await ensureGradeDisputesTable(db)

    const rows: any[] = await db.$queryRaw`
      SELECT
        gd.id, gd.reason, gd.status, gd.admin_response, gd.created_at, gd.resolved_at,
        g.id AS grade_id, g.value, g.type, g.created_at AS grade_created_at,
        sub.name AS subject_name,
        su.first_name AS student_first_name, su.last_name AS student_last_name,
        ru.first_name AS raised_by_first_name, ru.last_name AS raised_by_last_name, ru.role AS raised_by_role
      FROM grade_disputes gd
      JOIN grades g ON g.id = gd.grade_id
      JOIN subjects sub ON sub.id = g.subject_id
      JOIN students st ON st.id = g.student_id
      JOIN users su ON su.id = st.user_id
      JOIN users ru ON ru.id = gd.raised_by
      ORDER BY gd.created_at DESC
    `
    return { success: true, data: rows }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

const VALID_DISPUTE_STATUSES = ['RESOLVED', 'DISMISSED']

/** Admin/censeur clôt une réclamation (note corrigée, ou réclamation rejetée). */
export async function resolveGradeDispute(
  disputeId: string,
  status: string,
  adminResponse: string
): Promise<ActionResult> {
  if (!VALID_DISPUTE_STATUSES.includes(status)) return { success: false, error: 'Statut invalide.' }
  try {
    const session = await requireRole('ADMIN', 'CENSOR')
    const db = getTenantPrisma(session.user.schemaName) as any
    await ensureGradeDisputesTable(db)

    const dispute: any[] = await db.$queryRaw`
      SELECT gd.raised_by, g.id AS grade_id, sub.name AS subject_name
      FROM grade_disputes gd
      JOIN grades g ON g.id = gd.grade_id
      JOIN subjects sub ON sub.id = g.subject_id
      WHERE gd.id = ${disputeId}
      LIMIT 1
    `
    if (!dispute[0]) return { success: false, error: 'Réclamation introuvable.' }

    await db.$executeRaw`
      UPDATE grade_disputes
      SET status = ${status}, admin_response = ${adminResponse.trim() || null}, resolved_at = NOW()
      WHERE id = ${disputeId}
    `

    await notifyUser(db, {
      userId: dispute[0].raised_by,
      type:   'GRADE_DISPUTE_RESOLVED',
      title:  status === 'RESOLVED' ? 'Réclamation traitée' : 'Réclamation rejetée',
      body:   `Votre réclamation concernant une note en ${dispute[0].subject_name} a été ${status === 'RESOLVED' ? 'traitée' : 'rejetée'}.`,
      href:   '/grades',
    })

    revalidatePath('/admin/grades')
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}
