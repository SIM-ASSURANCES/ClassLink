import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (req: NextRequest, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')

  let studentSqlId = `(SELECT id FROM students WHERE user_id = '${user.userId.replace(/'/g, "''")}' LIMIT 1)`

  if (user.role === 'PARENT' && studentId) {
    const check: any[] = await tenantDb.$queryRawUnsafe(`
      SELECT ps.id FROM parent_students ps
      JOIN parents p ON p.id = ps.parent_id
      WHERE p.user_id = '${user.userId.replace(/'/g, "''")}' AND ps.student_id = '${studentId.replace(/'/g, "''")}'
      LIMIT 1
    `)
    if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
    studentSqlId = `'${studentId.replace(/'/g, "''")}'`
  }

  const [rows, byTermRows]: [any[], any[]] = await Promise.all([
    tenantDb.$queryRawUnsafe(`
      SELECT
        a.id, a.date, a.status, a.justified, a.justification AS comment,
        s.name AS subject_name
      FROM attendances a
      LEFT JOIN schedules sc ON sc.id = a.schedule_id
      LEFT JOIN teacher_subject_classes tsc ON tsc.id = sc.teacher_subject_class_id
      LEFT JOIN subjects s ON s.id = tsc.subject_id
      WHERE a.student_id = ${studentSqlId}
      ORDER BY a.date DESC
      LIMIT 100
    `),
    // Courbe d'évolution par trimestre de l'année en cours — même requête que
    // le web (actions/parent.ts::getChildDetails / student.ts::getStudentAttendanceSummary).
    tenantDb.$queryRawUnsafe(`
      SELECT t.name AS term_name, t.term_order,
             COUNT(CASE WHEN a.status='PRESENT' THEN 1 END)::int AS present,
             COUNT(CASE WHEN a.status='LATE'    THEN 1 END)::int AS late,
             COUNT(CASE WHEN a.status='ABSENT'  THEN 1 END)::int AS absent
      FROM terms t
      JOIN academic_years ay ON ay.id = t.academic_year_id AND ay.is_current = TRUE
      LEFT JOIN attendances a ON a.term_id = t.id AND a.student_id = ${studentSqlId}
      GROUP BY t.id, t.name, t.term_order
      ORDER BY t.term_order
    `),
  ])

  const stats = {
    absent:    rows.filter(r => r.status === 'ABSENT').length,
    late:      rows.filter(r => r.status === 'LATE').length,
    justified: rows.filter(r => r.justified).length,
  }

  return NextResponse.json({
    records: rows.map(r => ({
      id:          r.id,
      date:        r.date,
      status:      r.status,
      justified:   r.justified,
      comment:     r.comment,
      subjectName: r.subject_name,
    })),
    stats,
    byTerm: byTermRows.map(t => ({
      termName: t.term_name, present: t.present, late: t.late, absent: t.absent,
    })),
  })
})

// Justifie une absence — voir actions/parent.ts::submitJustification (web).
export const POST = withMobileAuth(['PARENT'], async (req: NextRequest, { user, tenantDb }) => {
  const { attendanceId, justification } = await req.json()
  if (!attendanceId || !justification?.trim()) {
    return NextResponse.json({ error: 'Identifiant de présence et justification requis.' }, { status: 400 })
  }

  const attendance: any[] = await tenantDb.$queryRaw`
    SELECT a.student_id, a.status FROM attendances a WHERE a.id = ${attendanceId} LIMIT 1
  `
  if (!attendance[0]) return NextResponse.json({ error: 'Absence introuvable.' }, { status: 404 })
  if (attendance[0].status !== 'ABSENT') {
    return NextResponse.json({ error: 'Seule une absence peut être justifiée.' }, { status: 400 })
  }

  const check: any[] = await tenantDb.$queryRaw`
    SELECT ps.id FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE p.user_id = ${user.userId} AND ps.student_id = ${attendance[0].student_id}
    LIMIT 1
  `
  if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })

  await tenantDb.$executeRaw`
    UPDATE attendances SET justified = TRUE, justification = ${justification.trim()} WHERE id = ${attendanceId}
  `

  return NextResponse.json({ ok: true })
})
