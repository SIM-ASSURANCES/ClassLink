import { NextRequest, NextResponse } from 'next/server'
import { authenticateIcsRequest } from '@/lib/ics-auth'
import { buildIcs, type IcsEvent } from '@/lib/ics'

const EVENT_LABELS: Record<string, string> = {
  EXAM: 'Examen', HOLIDAY: 'Vacances', MEETING: 'Réunion',
  ACTIVITY: 'Activité', DEADLINE: 'Échéance', GENERAL: 'Général',
}

/** Export .ics de l'agenda scolaire — parent : ?studentId= (vérifié) ; élève : le sien. */
export async function GET(req: NextRequest) {
  const auth = await authenticateIcsRequest(req)
  if (!auth) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  const { db, userId, role } = auth

  const studentId = req.nextUrl.searchParams.get('studentId')

  let targetStudentId: string | null = null
  if (role === 'PARENT') {
    if (!studentId) return NextResponse.json({ error: 'studentId requis.' }, { status: 400 })
    const check: any[] = await db.$queryRaw`
      SELECT ps.id FROM parent_students ps
      JOIN parents p ON p.id = ps.parent_id
      WHERE p.user_id = ${userId} AND ps.student_id = ${studentId}
      LIMIT 1
    `
    if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
    targetStudentId = studentId
  } else if (role === 'STUDENT') {
    const rows: any[] = await db.$queryRaw`SELECT id FROM students WHERE user_id = ${userId} LIMIT 1`
    targetStudentId = rows[0]?.id ?? null
  } else {
    return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
  }

  if (!targetStudentId) return NextResponse.json({ error: 'Élève introuvable.' }, { status: 404 })

  const rows: any[] = await db.$queryRaw`
    SELECT DISTINCT ae.id, ae.title, ae.description, ae.event_type,
           ae.start_date, ae.end_date, ae.start_time, ae.end_time
    FROM agenda_events ae
    JOIN enrollments e ON (ae.class_id = e.class_id OR ae.all_classes = TRUE)
    WHERE e.student_id = ${targetStudentId} AND e.status = 'ACTIVE'
    ORDER BY ae.start_date
  `

  const events: IcsEvent[] = rows.map(r => {
    const label = EVENT_LABELS[r.event_type] ?? 'Événement'
    const start = new Date(r.start_date)
    const end   = r.end_date ? new Date(r.end_date) : null
    if (r.start_time) {
      const [h, m] = String(r.start_time).split(':').map(Number)
      start.setHours(h, m, 0, 0)
    }
    let endDate: Date | null = end
    if (r.end_time) {
      endDate = end ?? new Date(start)
      const [h, m] = String(r.end_time).split(':').map(Number)
      endDate.setHours(h, m, 0, 0)
    }
    return {
      uid:         `agenda-${r.id}`,
      title:       `[${label}] ${r.title}`,
      description: r.description ?? undefined,
      start,
      end:         endDate,
      allDay:      !r.start_time,
    }
  })

  const ics = buildIcs('MyClassLink — Agenda scolaire', events)
  return new NextResponse(ics, {
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="agenda-myclasslink.ics"',
      'Cache-Control':       'no-store',
    },
  })
}
