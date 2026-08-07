import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

// Enseignants intervenant dans la classe active d'un enfant (pour la prise de
// RDV) — même requête que actions/appointments.ts::getChildTeachers (web).
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

  const rows: any[] = await tenantDb.$queryRaw`
    SELECT DISTINCT t.id AS teacher_id, u.first_name, u.last_name, sub.name AS subject_name
    FROM enrollments e
    JOIN teacher_subject_classes tsc ON tsc.class_id = e.class_id
    JOIN teachers t ON t.id = tsc.teacher_id
    JOIN users u ON u.id = t.user_id
    JOIN subjects sub ON sub.id = tsc.subject_id
    WHERE e.student_id = ${studentId} AND e.status = 'ACTIVE'
    ORDER BY u.last_name, u.first_name
  `

  return NextResponse.json({
    teachers: rows.map(r => ({
      teacherId:   r.teacher_id,
      firstName:   r.first_name,
      lastName:    r.last_name,
      subjectName: r.subject_name,
    })),
  })
})
