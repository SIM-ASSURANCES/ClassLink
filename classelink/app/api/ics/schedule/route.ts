import { NextRequest, NextResponse } from 'next/server'
import { authenticateIcsRequest } from '@/lib/ics-auth'
import { buildIcs, type IcsEvent } from '@/lib/ics'

/** Prochaine date (>= from) tombant sur le jour ISO donné (1 = lundi … 7 = dimanche). */
function nextDateForIsoWeekday(from: Date, isoWeekday: number): Date {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  const currentIso = d.getDay() === 0 ? 7 : d.getDay()
  const diff = (isoWeekday - currentIso + 7) % 7
  d.setDate(d.getDate() + diff)
  return d
}

function withTime(date: Date, time: string): Date {
  const d = new Date(date)
  const [h, m] = time.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d
}

function icsUntil(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

/** Export .ics de l'emploi du temps (récurrence hebdomadaire) — parent : ?studentId= (vérifié) ; élève : le sien. */
export async function GET(req: NextRequest) {
  const auth = await authenticateIcsRequest(req)
  if (!auth) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  const { db, userId, role } = auth

  const studentId = req.nextUrl.searchParams.get('studentId')

  let targetUserId = userId
  if (role === 'PARENT') {
    if (!studentId) return NextResponse.json({ error: 'studentId requis.' }, { status: 400 })
    const check: any[] = await db.$queryRaw`
      SELECT s.user_id FROM parent_students ps
      JOIN parents p  ON p.id = ps.parent_id
      JOIN students s ON s.id = ps.student_id
      WHERE p.user_id = ${userId} AND ps.student_id = ${studentId}
      LIMIT 1
    `
    if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
    targetUserId = check[0].user_id
  } else if (role !== 'STUDENT') {
    return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
  }

  const [slots, yearRows]: [any[], any[]] = await Promise.all([
    db.$queryRaw`
      SELECT
        sc.day_of_week, sc.start_time, sc.end_time, sc.room,
        s.name  AS subject_name,
        u.first_name || ' ' || u.last_name AS teacher_name
      FROM schedules sc
      JOIN teacher_subject_classes tsc ON tsc.id = sc.teacher_subject_class_id
      JOIN subjects s ON s.id = tsc.subject_id
      JOIN teachers t ON t.id = tsc.teacher_id
      JOIN users u ON u.id = t.user_id
      WHERE sc.class_id = (
        SELECT e.class_id FROM enrollments e
        JOIN students st ON st.id = e.student_id
        WHERE st.user_id = ${targetUserId} AND e.status = 'ACTIVE'
        LIMIT 1
      )
      ORDER BY sc.day_of_week, sc.start_time
    `,
    db.$queryRaw`SELECT end_date FROM academic_years WHERE is_current = TRUE LIMIT 1`,
  ])

  const until = yearRows[0]?.end_date
    ? new Date(yearRows[0].end_date)
    : new Date(Date.now() + 120 * 86400000) // repli : 4 mois si pas d'année scolaire active

  const now = new Date()
  const events: IcsEvent[] = slots.map((s, i) => {
    const day = nextDateForIsoWeekday(now, Number(s.day_of_week))
    return {
      uid:         `schedule-${targetUserId}-${i}`,
      title:       `${s.subject_name}${s.room ? ` (salle ${s.room})` : ''}`,
      description: s.teacher_name?.trim() ? `Enseignant : ${s.teacher_name.trim()}` : undefined,
      start:       withTime(day, String(s.start_time).slice(0, 5)),
      end:         withTime(day, String(s.end_time).slice(0, 5)),
      rrule:       `FREQ=WEEKLY;UNTIL=${icsUntil(until)}`,
    }
  })

  const ics = buildIcs('MyClassLink — Emploi du temps', events)
  return new NextResponse(ics, {
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="emploi-du-temps-myclasslink.ics"',
      'Cache-Control':       'no-store',
    },
  })
}
