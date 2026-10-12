import { NextRequest, NextResponse } from 'next/server'
import { authenticateEnrollmentKey } from '@/lib/enrollment/api-auth'

export const runtime = 'nodejs'

/**
 * GET /api/v1/classes — classes de l'année scolaire courante, avec leur
 * capacité et leur effectif. Permet à l'application source de découvrir les
 * `classId` à utiliser (ou de vérifier les places avant d'envoyer un élève).
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateEnrollmentKey(req)
  if (auth instanceof NextResponse) return auth

  const rows: any[] = await auth.db.$queryRaw`
    SELECT c.id, c.name, l.name AS level, c.max_students,
           (SELECT COUNT(*)::int FROM enrollments e WHERE e.class_id = c.id AND e.status = 'ACTIVE') AS enrolled
    FROM classes c
    JOIN levels l ON l.id = c.level_id
    JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current = TRUE
    ORDER BY l.level_order, c.name
  `

  return NextResponse.json({
    data: rows.map(r => ({
      id:       r.id,
      name:     r.name,
      level:    r.level,
      capacity: r.max_students,
      enrolled: r.enrolled,
      full:     r.max_students != null && r.enrolled >= r.max_students,
    })),
  })
}
