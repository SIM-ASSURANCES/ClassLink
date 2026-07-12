import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

// Agenda scolaire d'un enfant (parent uniquement, comme sur le web —
// voir actions/parent.ts::getChildAgenda).
export const GET = withMobileAuth(['PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const month     = searchParams.get('month') // format YYYY-MM, optionnel

  if (!studentId) return NextResponse.json({ error: 'studentId requis.' }, { status: 400 })

  const check: any[] = await tenantDb.$queryRaw`
    SELECT ps.id FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE p.user_id = ${user.userId} AND ps.student_id = ${studentId}
    LIMIT 1
  `
  if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })

  const rows: any[] = await tenantDb.$queryRaw`
    SELECT DISTINCT ae.id, ae.title, ae.description, ae.event_type,
           ae.start_date, ae.end_date, ae.start_time, ae.end_time, ae.all_classes
    FROM agenda_events ae
    JOIN enrollments e ON (ae.class_id = e.class_id OR ae.all_classes = TRUE)
    WHERE e.student_id = ${studentId} AND e.status = 'ACTIVE'
      AND (${month ?? null}::text IS NULL OR to_char(ae.start_date, 'YYYY-MM') = ${month ?? null})
    ORDER BY ae.start_date, ae.start_time NULLS LAST
  `

  return NextResponse.json({
    events: rows.map(e => ({
      id:          e.id,
      title:       e.title,
      description: e.description,
      eventType:   e.event_type,
      startDate:   e.start_date,
      endDate:     e.end_date,
      startTime:   e.start_time,
      endTime:     e.end_time,
      allClasses:  e.all_classes,
    })),
  })
})
