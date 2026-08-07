import { NextRequest, NextResponse } from 'next/server'
import { publicPrisma } from '@/lib/db/public'
import { getTenantPrisma } from '@/lib/db/tenant'
import { notifyUser } from '@/lib/notifications/create'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'

export const maxDuration = 300

/**
 * Cron hebdomadaire (dimanche soir, voir vercel.json) : envoie à chaque
 * parent un résumé de la semaine écoulée pour l'ensemble de ses enfants
 * (présences, devoirs à rendre, notes et sanctions récentes) — même source
 * de données que actions/parent.ts::getChildWeeklySummary, agrégée par parent
 * plutôt que par enfant pour n'envoyer qu'un seul push.
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

      const parents: any[] = await db.$queryRaw`
        SELECT DISTINCT p.user_id
        FROM parents p
        JOIN parent_students ps ON ps.parent_id = p.id
      `

      await Promise.all(parents.map(async (parent: any) => {
        const [grades, absences, pending, sanctions]: [any[], any[], any[], any[]] = await Promise.all([
          db.$queryRaw`
            SELECT COUNT(*)::int AS cnt
            FROM grades g
            JOIN parent_students ps ON ps.student_id = g.student_id
            JOIN parents p ON p.id = ps.parent_id
            WHERE p.user_id = ${parent.user_id}
              AND g.published_at >= date_trunc('week', CURRENT_DATE)
          `,
          db.$queryRaw`
            SELECT COUNT(*)::int AS cnt
            FROM attendances a
            JOIN parent_students ps ON ps.student_id = a.student_id
            JOIN parents p ON p.id = ps.parent_id
            WHERE p.user_id = ${parent.user_id}
              AND a.status = 'ABSENT'
              AND a.date >= date_trunc('week', CURRENT_DATE)
          `,
          db.$queryRaw`
            SELECT COUNT(DISTINCT a.id)::int AS cnt
            FROM assignments a
            JOIN enrollments e ON e.class_id = a.class_id AND e.status = 'ACTIVE'
            JOIN parent_students ps ON ps.student_id = e.student_id
            JOIN parents p ON p.id = ps.parent_id
            LEFT JOIN submissions sm ON sm.assignment_id = a.id AND sm.student_id = e.student_id
            WHERE p.user_id = ${parent.user_id}
              AND a.due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
              AND sm.id IS NULL
          `,
          db.$queryRaw`
            SELECT COUNT(*)::int AS cnt
            FROM sanctions s
            JOIN parent_students ps ON ps.student_id = s.student_id
            JOIN parents p ON p.id = ps.parent_id
            WHERE p.user_id = ${parent.user_id}
              AND s.date >= date_trunc('week', CURRENT_DATE)
          `,
        ])

        const gradeCount     = grades[0]?.cnt ?? 0
        const absenceCount   = absences[0]?.cnt ?? 0
        const pendingCount   = pending[0]?.cnt ?? 0
        const sanctionCount  = sanctions[0]?.cnt ?? 0

        // Rien à signaler : pas de notification (évite le bruit chaque dimanche).
        if (gradeCount === 0 && absenceCount === 0 && pendingCount === 0 && sanctionCount === 0) return

        const parts: string[] = []
        if (gradeCount > 0)    parts.push(`${gradeCount} nouvelle${gradeCount > 1 ? 's' : ''} note${gradeCount > 1 ? 's' : ''}`)
        if (absenceCount > 0)  parts.push(`${absenceCount} absence${absenceCount > 1 ? 's' : ''}`)
        if (pendingCount > 0)  parts.push(`${pendingCount} devoir${pendingCount > 1 ? 's' : ''} à venir`)
        if (sanctionCount > 0) parts.push(`${sanctionCount} sanction${sanctionCount > 1 ? 's' : ''}`)

        await notifyUser(db, {
          userId: parent.user_id,
          type:   'WEEKLY_SUMMARY',
          title:  'Résumé de la semaine',
          body:   parts.join(' · '),
          href:   '/parent',
        })
        notified++
      }))
    } catch (e) {
      console.error(`[cron/weekly-summary] Échec pour l'école ${school.schemaName} (ignoré) :`, e)
    }
  }

  return NextResponse.json({ ok: true, notified })
}
