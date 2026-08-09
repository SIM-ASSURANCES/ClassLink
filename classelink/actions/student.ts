'use server'

import { getTenantPrisma } from '@/lib/db/tenant'
import { requireRole } from '@/lib/auth/rbac'

async function getStudentDb() {
  const session = await requireRole('STUDENT')
  const db = getTenantPrisma(session.user.schemaName) as any
  return { db, session }
}

// grade_disputes est une nouvelle table tenant — auto-création idempotente au
// premier usage (voir actions/transport.ts::ensureBusSubscriptionsTable pour
// le contexte de ce pattern).
async function ensureGradeDisputesTable(db: any) {
  await db.$executeRawUnsafe(`
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
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_grade_disputes_grade ON grade_disputes(grade_id)`
  )
}

export async function getStudentProfile() {
  const { db, session } = await getStudentDb()
  const rows: any[] = await db.$queryRaw`
    SELECT s.id, s.student_id AS student_number, s.date_of_birth, s.gender,
           u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
           c.id AS class_id, c.name AS class_name,
           l.name AS level_name,
           ay.name AS year_name, ay.id AS year_id
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN enrollments e  ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c      ON c.id = e.class_id
    LEFT JOIN levels l       ON l.id = c.level_id
    LEFT JOIN academic_years ay ON ay.is_current = TRUE
    WHERE s.user_id = ${session.user.id}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getStudentTerms() {
  const { db } = await getStudentDb()
  return db.$queryRaw`
    SELECT t.id, t.name, t.term_order, t.start_date, t.end_date
    FROM terms t
    JOIN academic_years ay ON ay.id = t.academic_year_id
    WHERE ay.is_current = TRUE
    ORDER BY t.term_order
  ` as Promise<any[]>
}

export async function getStudentGrades(termId: string) {
  const { db, session } = await getStudentDb()

  const student: any[] = await db.$queryRaw`
    SELECT s.id, c.level_id FROM students s
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c ON c.id = e.class_id
    WHERE s.user_id = ${session.user.id} LIMIT 1
  `
  if (!student[0]) return { subjects: [], rows: [] }

  const { id: studentId, level_id: levelId } = student[0]

  const subjectRows: any[] = await db.$queryRaw`
    SELECT s.id, s.name, s.code, COALESCE(ls.coefficient, 1) AS coefficient
    FROM subjects s
    LEFT JOIN level_subjects ls ON ls.subject_id = s.id AND ls.level_id = ${levelId}
    WHERE EXISTS (
      SELECT 1 FROM grades g WHERE g.subject_id = s.id AND g.student_id = ${studentId} AND g.term_id = ${termId}
    )
    ORDER BY s.name
  `
  const subjects = subjectRows.map(s => ({ ...s, coefficient: Number(s.coefficient) }))

  await ensureGradeDisputesTable(db)
  const [gradeRows, disputeRows]: [any[], any[]] = await Promise.all([
    db.$queryRaw`
      SELECT g.id, g.subject_id, g.type, g.value, g.coefficient, g.comment, g.created_at
      FROM grades g
      WHERE g.student_id = ${studentId} AND g.term_id = ${termId}
      ORDER BY g.created_at
    `,
    db.$queryRaw`
      SELECT gd.grade_id, gd.id, gd.status FROM grade_disputes gd
      JOIN grades g ON g.id = gd.grade_id
      WHERE g.student_id = ${studentId} AND g.term_id = ${termId}
    `,
  ])
  const disputeByGrade = new Map(disputeRows.map(d => [d.grade_id, { id: d.id, status: d.status }]))
  const grades = gradeRows.map(g => ({
    ...g, value: Number(g.value), coefficient: Number(g.coefficient),
    dispute: disputeByGrade.get(g.id) ?? null,
  }))

  const gradesBySubject: Record<string, any[]> = {}
  for (const g of grades) {
    if (!gradesBySubject[g.subject_id]) gradesBySubject[g.subject_id] = []
    gradesBySubject[g.subject_id].push(g)
  }

  let generalWeightedSum = 0
  let generalCoeffSum = 0

  const rows = subjects.map(sub => {
    const subGrades = gradesBySubject[sub.id] ?? []
    const weightedSum = subGrades.reduce((s: number, g: any) => s + parseFloat(g.value) * parseFloat(g.coefficient), 0)
    const coeffSum    = subGrades.reduce((s: number, g: any) => s + parseFloat(g.coefficient), 0)
    const average     = coeffSum > 0 ? Math.round((weightedSum / coeffSum) * 100) / 100 : null

    if (average !== null) {
      generalWeightedSum += average * parseFloat(sub.coefficient)
      generalCoeffSum    += parseFloat(sub.coefficient)
    }

    return { ...sub, grades: subGrades, average }
  })

  const generalAverage = generalCoeffSum > 0
    ? Math.round((generalWeightedSum / generalCoeffSum) * 100) / 100
    : null

  return { rows, generalAverage }
}

/** Moyenne générale de l'élève par trimestre de l'année en cours — pour la courbe d'évolution. */
export async function getStudentTermAverages() {
  const { db, session } = await getStudentDb()

  const student: any[] = await db.$queryRaw`
    SELECT s.id, c.level_id FROM students s
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c ON c.id = e.class_id
    WHERE s.user_id = ${session.user.id} LIMIT 1
  `
  if (!student[0]) return []
  const { id: studentId, level_id: levelId } = student[0]

  const averages: any[] = await db.$queryRaw`
    SELECT g.term_id, t.name AS term_name, t.term_order,
           ROUND(
             SUM(
               (SUM(g.value * g.coefficient) / NULLIF(SUM(g.coefficient), 0))
               * COALESCE(ls.coefficient, 1)
             ) OVER (PARTITION BY g.term_id)
             /
             NULLIF(SUM(COALESCE(ls.coefficient, 1)) OVER (PARTITION BY g.term_id), 0),
             2
           ) AS general_average
    FROM grades g
    JOIN terms t ON t.id = g.term_id
    JOIN academic_years ay ON ay.id = t.academic_year_id AND ay.is_current = TRUE
    LEFT JOIN level_subjects ls ON ls.subject_id = g.subject_id AND ls.level_id = ${levelId}
    WHERE g.student_id = ${studentId}
    GROUP BY g.term_id, g.subject_id, t.name, t.term_order, ls.coefficient
  `

  const byTerm: Record<string, { term_id: string; term_name: string; term_order: number; average: number | null }> = {}
  for (const a of averages) {
    if (!byTerm[a.term_id]) {
      byTerm[a.term_id] = {
        term_id: a.term_id, term_name: a.term_name, term_order: a.term_order,
        average: a.general_average ? parseFloat(a.general_average) : null,
      }
    }
  }

  const allTerms: any[] = await db.$queryRaw`
    SELECT id, name, term_order FROM terms t
    JOIN academic_years ay ON ay.id = t.academic_year_id AND ay.is_current = TRUE
    ORDER BY term_order
  `
  return allTerms.map(t => ({ name: t.name, average: byTerm[t.id]?.average ?? null }))
}

export async function getStudentAttendanceSummary() {
  const { db, session } = await getStudentDb()
  return db.$queryRaw`
    SELECT
      t.id, t.name, t.term_order,
      COUNT(a.id)::int                                          AS total,
      COUNT(CASE WHEN a.status = 'PRESENT'  THEN 1 END)::int   AS present,
      COUNT(CASE WHEN a.status = 'ABSENT'   THEN 1 END)::int   AS absent,
      COUNT(CASE WHEN a.status = 'LATE'     THEN 1 END)::int   AS late,
      COUNT(CASE WHEN a.status = 'EXCUSED'  THEN 1 END)::int   AS excused,
      COUNT(CASE WHEN a.status = 'ABSENT'
                  AND a.justified = FALSE THEN 1 END)::int     AS unjustified
    FROM terms t
    JOIN academic_years ay ON ay.id = t.academic_year_id AND ay.is_current = TRUE
    LEFT JOIN attendances a
      ON a.term_id = t.id
      AND a.student_id = (
        SELECT s.id FROM students s WHERE s.user_id = ${session.user.id} LIMIT 1
      )
    GROUP BY t.id, t.name, t.term_order
    ORDER BY t.term_order
  ` as Promise<any[]>
}

export async function getStudentPayments() {
  const { db, session } = await getStudentDb()
  return db.$queryRaw`
    SELECT p.id, p.amount, p.status, p.paid_at, p.due_date,
           ft.name AS fee_name
    FROM payments p
    JOIN fee_types ft ON ft.id = p.fee_type_id
    WHERE p.student_id = (
      SELECT s.id FROM students s WHERE s.user_id = ${session.user.id} LIMIT 1
    )
    ORDER BY p.created_at DESC
  ` as Promise<any[]>
}

export async function getStudentSchedule() {
  const { db, session } = await getStudentDb()
  return db.$queryRaw`
    SELECT sc.id, sc.day_of_week, sc.start_time, sc.end_time, sc.room,
           s.name  AS subject_name, s.code AS subject_code,
           u.first_name AS teacher_first, u.last_name AS teacher_last
    FROM schedules sc
    JOIN teacher_subject_classes tsc ON tsc.id = sc.teacher_subject_class_id
    JOIN subjects s ON s.id = tsc.subject_id
    JOIN teachers t ON t.id = tsc.teacher_id
    JOIN users u    ON u.id = t.user_id
    WHERE sc.class_id = (
      SELECT e.class_id FROM enrollments e
      JOIN students st ON st.id = e.student_id
      WHERE st.user_id = ${session.user.id} AND e.status = 'ACTIVE'
      LIMIT 1
    )
    ORDER BY sc.day_of_week, sc.start_time
  ` as Promise<any[]>
}
