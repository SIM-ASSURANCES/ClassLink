import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

// Bulletin scolaire — élève : le sien ; parent : celui d'un enfant (?studentId=).
// Fidèle à actions/bulletin.ts::getBulletinData (web) : moyenne par matière
// pondérée par le coefficient de chaque note, moyenne générale pondérée par le
// coefficient MATIÈRE (level_subjects), moyenne de classe, rang, assiduité du
// trimestre et décision du conseil de classe.
export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const termId    = searchParams.get('termId')

  try {
    // Résoudre le studentId cible
    let targetStudentId: string | null = null

    if (user.role === 'STUDENT') {
      const rows: any[] = await tenantDb.$queryRaw`
        SELECT id FROM students WHERE user_id = ${user.userId} LIMIT 1
      `
      targetStudentId = rows[0]?.id ?? null
    } else if (user.role === 'PARENT' && studentId) {
      const rows: any[] = await tenantDb.$queryRaw`
        SELECT ps.student_id FROM parent_students ps
        JOIN parents p ON p.id = ps.parent_id
        WHERE p.user_id = ${user.userId} AND ps.student_id = ${studentId}
        LIMIT 1
      `
      if (!rows[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
      targetStudentId = rows[0].student_id
    }

    if (!targetStudentId) return NextResponse.json({ terms: [] })

    // Infos élève (mêmes champs que le bulletin web)
    const studentRows: any[] = await tenantDb.$queryRaw`
      SELECT
        u.first_name, u.last_name, s.student_id AS student_number,
        s.date_of_birth,
        c.name  AS class_name,
        l.name  AS level_name,
        ay.name AS year_name,
        c.id    AS class_id,
        l.id    AS level_id
      FROM students s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN enrollments e   ON e.student_id = s.id AND e.status = 'ACTIVE'
      LEFT JOIN classes c       ON c.id = e.class_id
      LEFT JOIN levels l        ON l.id = c.level_id
      LEFT JOIN academic_years ay ON ay.is_current = TRUE
      WHERE s.id = ${targetStudentId}
      LIMIT 1
    `
    const student = studentRows[0] ?? null
    if (!student) return NextResponse.json({ error: 'Élève introuvable.' }, { status: 404 })

    const studentInfo = {
      firstName:     student.first_name,
      lastName:      student.last_name,
      studentNumber: student.student_number,
      dateOfBirth:   student.date_of_birth,
      className:     student.class_name,
      levelName:     student.level_name,
      yearName:      student.year_name,
    }

    // Sans termId → liste des trimestres de l'année en cours, avec moyenne
    // générale pondérée par le coefficient matière (même calcul que le web).
    if (!termId) {
      const rows: any[] = await tenantDb.$queryRaw`
        SELECT
          t.id   AS term_id,
          t.name AS term_name,
          t.term_order,
          t.start_date,
          t.end_date,
          (ROUND(SUM(sa.subject_avg * sa.coef)::numeric / NULLIF(SUM(sa.coef), 0), 2))::float8 AS average,
          SUM(sa.grade_count)::int AS grade_count
        FROM (
          SELECT
            g.term_id,
            g.subject_id,
            SUM(g.value * g.coefficient) / NULLIF(SUM(g.coefficient), 0) AS subject_avg,
            COALESCE(ls.coefficient, 1) AS coef,
            COUNT(g.id) AS grade_count
          FROM grades g
          LEFT JOIN level_subjects ls
            ON ls.subject_id = g.subject_id
            AND ls.level_id  = ${student.level_id}
          WHERE g.student_id = ${targetStudentId}
          GROUP BY g.term_id, g.subject_id, ls.coefficient
        ) sa
        JOIN terms t ON t.id = sa.term_id
        GROUP BY t.id, t.name, t.term_order, t.start_date, t.end_date
        ORDER BY t.term_order
      `
      return NextResponse.json({
        student: studentInfo,
        terms: rows.map(r => ({
          term_id:     r.term_id,
          term_name:   r.term_name,
          term_order:  r.term_order,
          start_date:  r.start_date,
          end_date:    r.end_date,
          average:     r.average,
          grade_count: r.grade_count,
        })),
      })
    }

    // Avec termId → données complètes du bulletin (mêmes requêtes que le web)
    const [termRows, schoolRows, subjects, avgRows]: [any[], any[], any[], any[]] = await Promise.all([
      tenantDb.$queryRaw`
        SELECT id, name, term_order FROM terms WHERE id = ${termId} LIMIT 1
      `,
      tenantDb.$queryRaw`
        SELECT school_name, director_name AS principal_name, address, city, phone, email
        FROM school_settings LIMIT 1
      `,
      tenantDb.$queryRaw`
        SELECT
          sub.id   AS subject_id,
          sub.name AS subject_name,
          COALESCE(ls.coefficient, 1)::float AS coefficient,
          (ROUND(SUM(g.value * g.coefficient)::numeric / NULLIF(SUM(g.coefficient), 0), 2))::float8 AS subject_avg,
          COUNT(g.id)::int AS grade_count,
          JSON_AGG(JSON_BUILD_OBJECT('value', g.value::float8, 'coefficient', g.coefficient::float8)
                   ORDER BY g.created_at) AS grades
        FROM grades g
        JOIN subjects sub ON sub.id = g.subject_id
        LEFT JOIN level_subjects ls
          ON ls.subject_id = g.subject_id
          AND ls.level_id  = ${student.level_id}
        WHERE g.student_id = ${targetStudentId}
          AND g.term_id    = ${termId}
        GROUP BY sub.id, sub.name, ls.coefficient
        ORDER BY sub.name
      `,
      tenantDb.$queryRaw`
        SELECT
          (ROUND(SUM(t.subject_avg * t.coef)::numeric / NULLIF(SUM(t.coef), 0), 2))::float8 AS general_average
        FROM (
          SELECT
            g.subject_id,
            SUM(g.value * g.coefficient) / NULLIF(SUM(g.coefficient), 0) AS subject_avg,
            COALESCE(ls.coefficient, 1) AS coef
          FROM grades g
          LEFT JOIN level_subjects ls
            ON ls.subject_id = g.subject_id
            AND ls.level_id  = ${student.level_id}
          WHERE g.student_id = ${targetStudentId}
            AND g.term_id    = ${termId}
          GROUP BY g.subject_id, ls.coefficient
        ) t
      `,
    ])

    const generalAverage = avgRows[0]?.general_average ?? null

    const [classAvgRows, rankRows, attendanceRows, councilRows]: [any[], any[], any[], any[]] = await Promise.all([
      tenantDb.$queryRaw`
        SELECT (ROUND(AVG(student_avg)::numeric, 2))::float8 AS class_average
        FROM (
          SELECT
            t.student_id,
            SUM(t.subject_avg * t.coef) / NULLIF(SUM(t.coef), 0) AS student_avg
          FROM (
            SELECT
              g.student_id,
              g.subject_id,
              SUM(g.value * g.coefficient) / NULLIF(SUM(g.coefficient), 0) AS subject_avg,
              COALESCE(ls.coefficient, 1) AS coef
            FROM grades g
            JOIN enrollments e ON e.student_id = g.student_id AND e.status = 'ACTIVE'
            LEFT JOIN level_subjects ls
              ON ls.subject_id = g.subject_id
              AND ls.level_id  = ${student.level_id}
            WHERE g.term_id   = ${termId}
              AND e.class_id  = ${student.class_id}
            GROUP BY g.student_id, g.subject_id, ls.coefficient
          ) t
          GROUP BY t.student_id
        ) class_avgs
      `,
      tenantDb.$queryRaw`
        SELECT (COUNT(*) + 1)::int AS rank
        FROM (
          SELECT
            t.student_id,
            SUM(t.subject_avg * t.coef) / NULLIF(SUM(t.coef), 0) AS student_avg
          FROM (
            SELECT
              g.student_id,
              g.subject_id,
              SUM(g.value * g.coefficient) / NULLIF(SUM(g.coefficient), 0) AS subject_avg,
              COALESCE(ls.coefficient, 1) AS coef
            FROM grades g
            JOIN enrollments e ON e.student_id = g.student_id AND e.status = 'ACTIVE'
            LEFT JOIN level_subjects ls
              ON ls.subject_id = g.subject_id
              AND ls.level_id  = ${student.level_id}
            WHERE g.term_id  = ${termId}
              AND e.class_id = ${student.class_id}
            GROUP BY g.student_id, g.subject_id, ls.coefficient
          ) t
          GROUP BY t.student_id
          HAVING SUM(t.subject_avg * t.coef) / NULLIF(SUM(t.coef), 0) > ${generalAverage ?? 0}::numeric
        ) better_students
      `,
      tenantDb.$queryRaw`
        SELECT
          COUNT(a.id)::int                                                  AS total,
          COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END)::int             AS absent,
          COUNT(CASE WHEN a.status = 'LATE'   THEN 1 END)::int             AS late,
          COUNT(CASE WHEN a.status = 'ABSENT' AND a.justified = FALSE THEN 1 END)::int AS unjustified
        FROM attendances a
        WHERE a.student_id = ${targetStudentId}
          AND a.term_id    = ${termId}
      `,
      tenantDb.$queryRaw`
        SELECT cs.decision, cs.appreciation, cs.council_comment
        FROM council_students cs
        JOIN class_councils cc ON cc.id = cs.council_id
        WHERE cs.student_id = ${targetStudentId}
          AND cc.term_id    = ${termId}
        LIMIT 1
      `,
    ])

    const school  = schoolRows[0] ?? null
    const council = councilRows[0] ?? null

    return NextResponse.json({
      student: studentInfo,
      term: termRows[0] ? {
        id:        termRows[0].id,
        name:      termRows[0].name,
        termOrder: termRows[0].term_order,
      } : null,
      school: school ? {
        schoolName:    school.school_name,
        principalName: school.principal_name,
        address:       school.address,
        city:          school.city,
        phone:         school.phone,
        email:         school.email,
      } : null,
      subjects: subjects.map((s: any) => ({
        name:        s.subject_name,
        coefficient: s.coefficient,
        average:     s.subject_avg,
        gradeCount:  s.grade_count,
        grades:      typeof s.grades === 'string' ? JSON.parse(s.grades) : s.grades ?? [],
      })),
      generalAverage,
      classAverage: classAvgRows[0]?.class_average ?? null,
      rank:         generalAverage !== null ? (rankRows[0]?.rank ?? null) : null,
      attendance:   attendanceRows[0] ?? { total: 0, absent: 0, late: 0, unjustified: 0 },
      council: council ? {
        decision:       council.decision,
        appreciation:   council.appreciation,
        councilComment: council.council_comment,
      } : null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})
