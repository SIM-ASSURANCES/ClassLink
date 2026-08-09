import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'
import { notifyUser } from '@/lib/notifications/create'

const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000

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
            'published_at', g.published_at,
            'created_at', g.created_at
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

  // grade_disputes est une nouvelle table tenant — auto-création idempotente au
  // premier usage (voir actions/transport.ts::ensureBusSubscriptionsTable).
  await tenantDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS grade_disputes (
      id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      grade_id       TEXT NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
      raised_by      TEXT NOT NULL REFERENCES users(id),
      reason         TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
      admin_response TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      resolved_at    TIMESTAMPTZ
    )
  `)

  const disputeRows: any[] = await tenantDb.$queryRaw`
    SELECT gd.grade_id, gd.id, gd.status FROM grade_disputes gd
    JOIN grades g ON g.id = gd.grade_id
    WHERE g.student_id = ${targetStudentId}
  `
  const disputeByGrade = new Map(disputeRows.map(d => [d.grade_id, { id: d.id, status: d.status }]))

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
        createdAt:   g.created_at,
        dispute:     disputeByGrade.get(g.id) ?? null,
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

// Conteste une note (élève ou parent), dans les 24h suivant sa saisie — voir
// actions/grade-disputes.ts::disputeGrade (web).
export const POST = withMobileAuth(['STUDENT', 'PARENT'], async (req: NextRequest, { user, tenantDb }) => {
  const { gradeId, reason } = await req.json()
  if (!gradeId || !reason?.trim()) {
    return NextResponse.json({ error: 'Note et motif requis.' }, { status: 400 })
  }

  const grade: any[] = await tenantDb.$queryRaw`
    SELECT g.id, g.student_id, g.created_at, g.created_by,
           sub.name AS subject_name, u.first_name, u.last_name
    FROM grades g
    JOIN subjects sub ON sub.id = g.subject_id
    JOIN students s ON s.id = g.student_id
    JOIN users u ON u.id = s.user_id
    WHERE g.id = ${gradeId}
    LIMIT 1
  `
  if (!grade[0]) return NextResponse.json({ error: 'Note introuvable.' }, { status: 404 })
  const g = grade[0]

  if (user.role === 'STUDENT') {
    const own: any[] = await tenantDb.$queryRaw`SELECT id FROM students WHERE user_id = ${user.userId} AND id = ${g.student_id} LIMIT 1`
    if (!own[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
  } else {
    const check: any[] = await tenantDb.$queryRaw`
      SELECT ps.id FROM parent_students ps
      JOIN parents p ON p.id = ps.parent_id
      WHERE p.user_id = ${user.userId} AND ps.student_id = ${g.student_id}
      LIMIT 1
    `
    if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
  }

  if (Date.now() - new Date(g.created_at).getTime() > DISPUTE_WINDOW_MS) {
    return NextResponse.json({ error: 'Le délai de 24h pour contester cette note est dépassé.' }, { status: 400 })
  }

  const existing: any[] = await tenantDb.$queryRaw`SELECT id FROM grade_disputes WHERE grade_id = ${gradeId} LIMIT 1`
  if (existing[0]) return NextResponse.json({ error: 'Cette note fait déjà l\'objet d\'une réclamation.' }, { status: 409 })

  const inserted: any[] = await tenantDb.$queryRaw`
    INSERT INTO grade_disputes (grade_id, raised_by, reason)
    VALUES (${gradeId}, ${user.userId}, ${reason.trim()})
    RETURNING id, status
  `

  const staff: any[] = await tenantDb.$queryRaw`SELECT id FROM users WHERE role IN ('ADMIN','CENSOR') AND is_active = TRUE`
  const title = 'Note contestée'
  const body  = `${g.first_name} ${g.last_name} conteste une note en ${g.subject_name}.`
  await Promise.all([
    ...staff.map((s: any) => notifyUser(tenantDb, { userId: s.id, type: 'GRADE_DISPUTED', title, body, href: '/admin/grades' })),
    g.created_by
      ? notifyUser(tenantDb, { userId: g.created_by, type: 'GRADE_DISPUTED', title, body, href: '/teacher/grades' })
      : Promise.resolve(),
  ])

  return NextResponse.json({ id: inserted[0].id, status: inserted[0].status })
})
