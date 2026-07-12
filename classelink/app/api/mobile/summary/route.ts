import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

// Aperçu / résumé hebdomadaire d'un enfant (parent uniquement, comme sur le
// web — voir actions/parent.ts::getChildWeeklySummary).
export const GET = withMobileAuth(['PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')

  if (!studentId) return NextResponse.json({ error: 'studentId requis.' }, { status: 400 })

  const check: any[] = await tenantDb.$queryRaw`
    SELECT ps.id FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE p.user_id = ${user.userId} AND ps.student_id = ${studentId}
    LIMIT 1
  `
  if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })

  const [recentGrades, weekAttendance, pendingCount, recentSanctions] = await Promise.all([
    tenantDb.$queryRaw`
      SELECT g.value::float8 AS value, g.max_value::float8 AS max_value, g.type, g.published_at,
             s.name AS subject_name
      FROM grades g
      JOIN subjects s ON s.id = g.subject_id
      WHERE g.student_id = ${studentId} AND g.published_at IS NOT NULL
      ORDER BY g.published_at DESC LIMIT 5
    ` as Promise<any[]>,

    tenantDb.$queryRaw`
      SELECT
        COUNT(CASE WHEN status='PRESENT' THEN 1 END)::int AS present,
        COUNT(CASE WHEN status='ABSENT'  THEN 1 END)::int AS absent,
        COUNT(CASE WHEN status='LATE'    THEN 1 END)::int AS late
      FROM attendances
      WHERE student_id = ${studentId}
        AND date >= date_trunc('week', CURRENT_DATE)
        AND date <  date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
    ` as Promise<any[]>,

    tenantDb.$queryRaw`
      SELECT COUNT(a.id)::int AS cnt
      FROM assignments a
      LEFT JOIN submissions sm ON sm.assignment_id = a.id AND sm.student_id = ${studentId}
      WHERE a.class_id = (
        SELECT e.class_id FROM enrollments e
        WHERE e.student_id = ${studentId} AND e.status = 'ACTIVE' LIMIT 1
      )
      AND a.due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
      AND sm.id IS NULL
    ` as Promise<any[]>,

    tenantDb.$queryRaw`
      SELECT s.type, s.reason, s.date
      FROM sanctions s
      WHERE s.student_id = ${studentId}
      ORDER BY s.date DESC LIMIT 2
    ` as Promise<any[]>,
  ])

  return NextResponse.json({
    recentGrades: recentGrades.map(g => ({
      value: g.value, maxValue: g.max_value, type: g.type,
      publishedAt: g.published_at, subjectName: g.subject_name,
    })),
    weekAttendance: weekAttendance[0] ?? { present: 0, absent: 0, late: 0 },
    pendingAssignments: pendingCount[0]?.cnt ?? 0,
    recentSanctions: recentSanctions.map(s => ({
      type: s.type, reason: s.reason, date: s.date,
    })),
  })
})
