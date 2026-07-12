import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const termId    = searchParams.get('termId')

  try {
    // Résoudre le studentId cible
    let targetStudentId: string | null = null
    let studentInfo: any = null

    if (user.role === 'STUDENT') {
      const rows: any[] = await tenantDb.$queryRawUnsafe(`
        SELECT s.id, u.first_name, u.last_name
        FROM students s JOIN users u ON u.id = s.user_id
        WHERE s.user_id = '${user.userId.replace(/'/g, "''")}' LIMIT 1
      `)
      targetStudentId = rows[0]?.id ?? null
      studentInfo = rows[0]
    } else if (user.role === 'PARENT' && studentId) {
      const rows: any[] = await tenantDb.$queryRawUnsafe(`
        SELECT s.id, u.first_name, u.last_name
        FROM parent_students ps
        JOIN parents p  ON p.id  = ps.parent_id
        JOIN students s ON s.id  = ps.student_id
        JOIN users u    ON u.id  = s.user_id
        WHERE p.user_id = '${user.userId.replace(/'/g, "''")}' AND ps.student_id = '${studentId.replace(/'/g, "''")}'
        LIMIT 1
      `)
      if (!rows[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
      targetStudentId = rows[0].id
      studentInfo = rows[0]
    }

    if (!targetStudentId) return NextResponse.json({ terms: [] })

    // Sans termId → liste des trimestres avec moyenne
    if (!termId) {
      const rows: any[] = await tenantDb.$queryRawUnsafe(`
        SELECT
          t.id   AS term_id,
          t.name AS term_name,
          t.term_order,
          t.start_date,
          t.end_date,
          AVG(g.value)::numeric(5,2)  AS average,
          COUNT(g.id)::int            AS grade_count
        FROM grades g
        JOIN terms t ON t.id = g.term_id
        WHERE g.student_id = '${targetStudentId.replace(/'/g, "''")}'
        GROUP BY t.id, t.name, t.term_order, t.start_date, t.end_date
        ORDER BY t.term_order
      `)
      return NextResponse.json({ student: studentInfo, terms: rows })
    }

    // Avec termId → données complètes du bulletin
    const safeTermId = termId.replace(/'/g, "''")

    const [gradeRows, termRows]: [any[], any[]] = await Promise.all([
      tenantDb.$queryRawUnsafe(`
        SELECT
          g.value, g.coefficient, g.comment, g.created_at AS graded_at,
          s.name AS subject_name, NULL::text AS subject_color
        FROM grades g
        JOIN subjects s ON s.id = g.subject_id
        WHERE g.student_id = '${targetStudentId.replace(/'/g, "''")}' AND g.term_id = '${safeTermId}'
        ORDER BY s.name, g.created_at
      `),
      tenantDb.$queryRaw`
        SELECT id, name, term_order, start_date, end_date FROM terms WHERE id = ${termId} LIMIT 1
      `,
    ])

    // Grouper par matière + calculer moyennes
    const bySubject: Record<string, any> = {}
    for (const g of gradeRows) {
      if (!bySubject[g.subject_name]) {
        bySubject[g.subject_name] = { name: g.subject_name, color: g.subject_color, grades: [], average: null }
      }
      bySubject[g.subject_name].grades.push({
        value:       parseFloat(g.value),
        coefficient: g.coefficient,
        comment:     g.comment,
        gradedAt:    g.graded_at,
      })
    }

    for (const sub of Object.values(bySubject)) {
      const totalCoef = sub.grades.reduce((s: number, g: any) => s + g.coefficient, 0)
      if (totalCoef > 0) {
        sub.average = Math.round(
          (sub.grades.reduce((s: number, g: any) => s + g.value * g.coefficient, 0) / totalCoef) * 100
        ) / 100
      }
    }

    const subjects = Object.values(bySubject)
    const withAvg  = subjects.filter((s: any) => s.average !== null)
    const globalAverage = withAvg.length
      ? Math.round(withAvg.reduce((s: number, sub: any) => s + sub.average, 0) / withAvg.length * 100) / 100
      : null

    return NextResponse.json({
      student:       studentInfo,
      term:          termRows[0] ?? null,
      subjects,
      globalAverage,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})
