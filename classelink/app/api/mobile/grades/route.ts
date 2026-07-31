import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

// Notes & moyennes — élève : les siennes ; parent : celles d'un enfant
// (?studentId=). Même structure que actions/parent.ts::getChildGrades (web) :
// groupées par trimestre de l'année en cours, coefficient MATIÈRE issu de
// level_subjects, moyenne par matière pondérée par le coefficient de chaque
// note, type de note (DEVOIR/INTERROGATION/COMPOSITION/EXAM) et published_at.
export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')

  let targetStudentId: string | null = null

  if (user.role === 'PARENT' && studentId) {
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

  if (!targetStudentId) return NextResponse.json({ terms: [] })

  const [terms, rows]: [any[], any[]] = await Promise.all([
    tenantDb.$queryRaw`
      SELECT t.id, t.name, t.term_order
      FROM terms t
      JOIN academic_years ay ON ay.id = t.academic_year_id AND ay.is_current = TRUE
      ORDER BY t.term_order
    ` as Promise<any[]>,

    tenantDb.$queryRaw`
      SELECT
        g.term_id,
        sub.id   AS subject_id,
        sub.name AS subject_name,
        COALESCE(ls.coefficient, 1)::float        AS coefficient,
        (ROUND(SUM(g.value * g.coefficient)::numeric
              / NULLIF(SUM(g.coefficient), 0), 2))::float8 AS subject_avg,
        COUNT(g.id)::int                           AS grade_count,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', g.id, 'value', g.value::float8,
            'coefficient', g.coefficient::float8,
            'type', g.type,
            'comment', g.comment,
            'published_at', g.published_at
          ) ORDER BY g.published_at DESC NULLS LAST
        ) AS grades
      FROM grades g
      JOIN subjects sub ON sub.id = g.subject_id
      JOIN terms t ON t.id = g.term_id
      JOIN academic_years ay ON ay.id = t.academic_year_id AND ay.is_current = TRUE
      LEFT JOIN enrollments e ON e.student_id = ${targetStudentId} AND e.status = 'ACTIVE'
      LEFT JOIN level_subjects ls
        ON ls.subject_id = g.subject_id
        AND ls.level_id = (
          SELECT c.level_id FROM classes c WHERE c.id = e.class_id LIMIT 1
        )
      WHERE g.student_id = ${targetStudentId}
      GROUP BY g.term_id, sub.id, sub.name, ls.coefficient
      ORDER BY sub.name
    ` as Promise<any[]>,
  ])

  const byTerm: Record<string, any[]> = {}
  for (const r of rows) {
    if (!byTerm[r.term_id]) byTerm[r.term_id] = []
    byTerm[r.term_id].push({
      subjectId:   r.subject_id,
      subjectName: r.subject_name,
      coefficient: r.coefficient,
      average:     r.subject_avg,
      gradeCount:  r.grade_count,
      grades: (typeof r.grades === 'string' ? JSON.parse(r.grades) : r.grades ?? []).map((g: any) => ({
        id:          g.id,
        value:       g.value,
        coefficient: g.coefficient,
        type:        g.type,
        comment:     g.comment,
        publishedAt: g.published_at,
      })),
    })
  }

  return NextResponse.json({
    terms: terms.map(t => ({
      id:        t.id,
      name:      t.name,
      termOrder: t.term_order,
      subjects:  byTerm[t.id] ?? [],
    })),
  })
})
