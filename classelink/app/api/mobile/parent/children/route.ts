import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

export const GET = withMobileAuth(['PARENT'], async (_req, { user, tenantDb }) => {
  const children: any[] = await tenantDb.$queryRaw`
    SELECT
      s.id          AS student_id,
      s.student_id  AS student_number,
      u.first_name, u.last_name, u.avatar_url,
      c.name        AS class_name,
      ay.name       AS academic_year,
      ps.relation
    FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    JOIN students s ON s.id = ps.student_id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c ON c.id = e.class_id
    LEFT JOIN academic_years ay ON ay.is_current = true
    WHERE p.user_id = ${user.userId}
    ORDER BY u.last_name, u.first_name
  `

  return NextResponse.json({
    children: children.map(c => ({
      studentId:     c.student_id,
      studentNumber: c.student_number,
      firstName:     c.first_name,
      lastName:      c.last_name,
      avatarUrl:     c.avatar_url,
      className:     c.class_name,
      academicYear:  c.academic_year,
      relation:      c.relation,
    })),
  })
})
