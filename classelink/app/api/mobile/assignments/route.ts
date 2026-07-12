import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

// Devoirs & exercices — élève : les siens ; parent : ceux d'un enfant
// (?studentId=). Même schéma que actions/assignments.ts::getStudentAssignments
// et actions/parent.ts::getChildAssignments (web).
export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')

  let targetStudentId: string | null = null

  if (user.role === 'PARENT') {
    if (!studentId) return NextResponse.json({ error: 'studentId requis.' }, { status: 400 })
    const check: any[] = await tenantDb.$queryRaw`
      SELECT ps.id FROM parent_students ps
      JOIN parents p ON p.id = ps.parent_id
      WHERE p.user_id = ${user.userId} AND ps.student_id = ${studentId}
      LIMIT 1
    `
    if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
    targetStudentId = studentId
  } else {
    const rows: any[] = await tenantDb.$queryRaw`
      SELECT id FROM students WHERE user_id = ${user.userId} LIMIT 1
    `
    targetStudentId = rows[0]?.id ?? null
  }

  if (!targetStudentId) return NextResponse.json({ assignments: [] })

  const rows: any[] = await tenantDb.$queryRaw`
    SELECT
      a.id, a.title, a.description, a.due_date, a.max_score::float8 AS max_score,
      s.name AS subject_name,
      u.first_name AS teacher_first, u.last_name AS teacher_last,
      sub.id AS submission_id, sub.submitted_at, sub.score::float8 AS score,
      sub.feedback, sub.status AS submission_status
    FROM assignments a
    JOIN subjects s ON s.id = a.subject_id
    JOIN teachers t ON t.id::text = a.teacher_id
    JOIN users u ON u.id = t.user_id
    LEFT JOIN submissions sub
      ON sub.assignment_id = a.id AND sub.student_id = ${targetStudentId}
    WHERE a.class_id = (
      SELECT e.class_id FROM enrollments e
      WHERE e.student_id = ${targetStudentId} AND e.status = 'ACTIVE'
      LIMIT 1
    )
    ORDER BY a.due_date DESC NULLS LAST
    LIMIT 60
  `

  return NextResponse.json({
    assignments: rows.map(a => ({
      id:               a.id,
      title:            a.title,
      description:      a.description,
      dueDate:          a.due_date,
      maxScore:         a.max_score,
      subjectName:      a.subject_name,
      teacherName:      `${a.teacher_first ?? ''} ${a.teacher_last ?? ''}`.trim(),
      submissionId:     a.submission_id,
      submittedAt:      a.submitted_at,
      score:            a.score,
      feedback:         a.feedback,
      submissionStatus: a.submission_status,
    })),
  })
})
