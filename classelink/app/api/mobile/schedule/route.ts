import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId') // pour les parents

  let targetUserId = user.userId
  if (user.role === 'PARENT' && studentId) {
    // Vérifier la parenté
    const check: any[] = await tenantDb.$queryRawUnsafe(`
      SELECT ps.id FROM parent_students ps
      JOIN parents p ON p.id = ps.parent_id
      WHERE p.user_id = '${user.userId.replace(/'/g, "''")}' AND ps.student_id = '${studentId.replace(/'/g, "''")}'
      LIMIT 1
    `)
    if (!check[0]) {
      return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
    }
    // Récupérer user_id de l'élève
    const studentUsers: any[] = await tenantDb.$queryRawUnsafe(`
      SELECT user_id FROM students WHERE id = '${studentId.replace(/'/g, "''")}' LIMIT 1
    `)
    if (studentUsers[0]) targetUserId = studentUsers[0].user_id
  }

  const rows: any[] = await tenantDb.$queryRawUnsafe(`
    SELECT
      sc.id, sc.day_of_week, sc.start_time, sc.end_time, sc.room,
      s.name  AS subject_name,
      NULL::text AS subject_color,
      u.first_name || ' ' || u.last_name AS teacher_name
    FROM schedules sc
    JOIN teacher_subject_classes tsc ON tsc.id = sc.teacher_subject_class_id
    JOIN subjects s ON s.id = tsc.subject_id
    JOIN teachers t ON t.id = tsc.teacher_id
    JOIN users u ON u.id = t.user_id
    WHERE sc.class_id = (
      SELECT e.class_id FROM enrollments e
      JOIN students st ON st.id = e.student_id
      WHERE st.user_id = '${targetUserId}'
        AND e.status = 'ACTIVE'
      LIMIT 1
    )
    ORDER BY sc.day_of_week, sc.start_time
  `)

  // Grouper par jour
  const days: Record<number, any[]> = {}
  for (const slot of rows) {
    const day = slot.day_of_week as number
    if (!days[day]) days[day] = []
    days[day].push({
      id: slot.id,
      startTime:   slot.start_time,
      endTime:     slot.end_time,
      room:        slot.room,
      subjectName: slot.subject_name,
      subjectColor:slot.subject_color,
      teacherName: slot.teacher_name,
    })
  }

  return NextResponse.json({ schedule: days })
})
