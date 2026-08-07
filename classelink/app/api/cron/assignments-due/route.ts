import { NextRequest, NextResponse } from 'next/server'
import { publicPrisma } from '@/lib/db/public'
import { getTenantPrisma } from '@/lib/db/tenant'
import { notifyUser } from '@/lib/notifications/create'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'

export const maxDuration = 300

/**
 * Cron quotidien (voir vercel.json) : notifie chaque élève — et ses parents —
 * ayant un devoir dû dans les prochaines 24h sans rendu déposé. Toutes écoles
 * confondues, une école en erreur n'empêche pas les autres d'être traitées.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const schools = await (publicPrisma as any).school.findMany({
    select: { schemaName: true },
  })

  let notified = 0
  for (const school of schools) {
    try {
      const db = getTenantPrisma(school.schemaName) as any

      const rows: any[] = await db.$queryRaw`
        SELECT
          a.id AS assignment_id, a.title, a.due_date,
          sub.name AS subject_name,
          s.id AS student_id, s.user_id,
          u.first_name, u.last_name
        FROM assignments a
        JOIN subjects sub ON sub.id = a.subject_id
        JOIN enrollments e ON e.class_id = a.class_id AND e.status = 'ACTIVE'
        JOIN students s ON s.id = e.student_id
        JOIN users u ON u.id = s.user_id
        LEFT JOIN submissions sm ON sm.assignment_id = a.id AND sm.student_id = s.id
        WHERE a.due_date BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
          AND sm.id IS NULL
      `

      await Promise.all(rows.map(async (r) => {
        const dueLabel = new Date(r.due_date).toLocaleString('fr-FR', {
          weekday: 'long', hour: '2-digit', minute: '2-digit',
        })
        const body = `${r.title} (${r.subject_name}) à rendre ${dueLabel}.`
        await notifyUser(db, { userId: r.user_id, type: 'ASSIGNMENT_DUE_SOON', title: 'Devoir à rendre bientôt', body, href: '/assignments' })
        // Parents de l'élève
        const parents: any[] = await db.$queryRaw`
          SELECT p.user_id FROM parent_students ps JOIN parents p ON p.id = ps.parent_id WHERE ps.student_id = ${r.student_id}
        `
        await Promise.all(parents.map((p: any) => notifyUser(db, {
          userId: p.user_id, type: 'ASSIGNMENT_DUE_SOON', title: 'Devoir à rendre bientôt',
          body: `${r.first_name} ${r.last_name} — ${body}`, href: '/parent',
        })))
        notified++
      }))
    } catch (e) {
      console.error(`[cron/assignments-due] Échec pour l'école ${school.schemaName} (ignoré) :`, e)
    }
  }

  return NextResponse.json({ ok: true, notified })
}
