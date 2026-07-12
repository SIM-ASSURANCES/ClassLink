import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const termId    = searchParams.get('termId')
  const studentId = searchParams.get('studentId')

  const termFilter = termId
    ? `AND t.id = '${termId.replace(/'/g, "''")}'`
    : ''

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

  const rows: any[] = await tenantDb.$queryRawUnsafe(`
    SELECT
      g.id,
      g.value,
      g.coefficient,
      g.comment,
      g.created_at AS graded_at,
      s.name  AS subject_name,
      NULL::text AS subject_color,
      t.name  AS term_name,
      t.term_order
    FROM grades g
    JOIN subjects s ON s.id = g.subject_id
    JOIN terms t ON t.id = g.term_id
    WHERE g.student_id = ${studentSqlId}
    ${termFilter}
    ORDER BY t.term_order, s.name, g.created_at DESC
  `)

  // Calcul moyenne par matière et globale
  const bySubject: Record<string, { name: string; color: string; grades: any[]; average: number | null }> = {}
  for (const g of rows) {
    if (!bySubject[g.subject_name]) {
      bySubject[g.subject_name] = { name: g.subject_name, color: g.subject_color, grades: [], average: null }
    }
    bySubject[g.subject_name].grades.push({
      id: g.id, value: parseFloat(g.value), coefficient: g.coefficient,
      comment: g.comment, gradedAt: g.graded_at,
    })
  }

  // Calcul moyennes
  for (const sub of Object.values(bySubject)) {
    const totalCoef = sub.grades.reduce((s, g) => s + g.coefficient, 0)
    if (totalCoef > 0) {
      const weighted = sub.grades.reduce((s, g) => s + g.value * g.coefficient, 0)
      sub.average = Math.round((weighted / totalCoef) * 100) / 100
    }
  }

  // Termes disponibles
  const terms: any[] = await tenantDb.$queryRaw`
    SELECT id, name, term_order FROM terms ORDER BY term_order
  `

  return NextResponse.json({ subjects: Object.values(bySubject), terms })
})
