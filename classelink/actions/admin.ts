'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/rbac'
import { getTenantPrisma } from '@/lib/db/tenant'
import { hash } from 'bcryptjs'
import { nanoid } from 'nanoid'
import { signPaymentToken } from '@/lib/payments/payment-link'
import type { ActionResult } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function dbError(e: any): string {
  if (e?.code === '23505' || e?.message?.includes('23505')) {
    const detail: string = e?.meta?.details ?? e?.message ?? ''
    if (detail.includes('email')) return 'Cette adresse email est déjà utilisée.'
    return 'Un enregistrement avec ces informations existe déjà.'
  }
  return e?.message ?? 'Une erreur est survenue.'
}

async function getDb() {
  const session = await requireRole('ADMIN', 'CENSOR', 'ACCOUNTANT', 'STAFF')
  return { db: getTenantPrisma(session.user.schemaName) as any, session }
}

// grade_disputes est une nouvelle table tenant — auto-création idempotente au
// premier usage (voir actions/grade-disputes.ts::ensureGradeDisputesTable pour
// le contexte, même pattern dupliqué ici car non exportable depuis un fichier
// 'use server').
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

const GRADE_VALIDATION_WINDOW_MS = 24 * 60 * 60 * 1000

/** Flux de supervision : toutes les notes récemment saisies, statut de validation, réclamations. */
export async function getRecentGrades(): Promise<ActionResult<any[]>> {
  try {
    const session = await requireRole('ADMIN', 'CENSOR')
    const db = getTenantPrisma(session.user.schemaName) as any
    await ensureGradeDisputesTable(db)

    const rows: any[] = await db.$queryRaw`
      SELECT
        g.id, g.value, g.max_value, g.coefficient, g.type, g.comment, g.created_at,
        sub.name AS subject_name,
        su.first_name AS student_first_name, su.last_name AS student_last_name,
        c.name AS class_name,
        tu.first_name AS teacher_first_name, tu.last_name AS teacher_last_name,
        gd.id AS dispute_id, gd.status AS dispute_status, gd.reason AS dispute_reason
      FROM grades g
      JOIN subjects sub ON sub.id = g.subject_id
      JOIN students st  ON st.id = g.student_id
      JOIN users su     ON su.id = st.user_id
      LEFT JOIN enrollments e ON e.student_id = st.id AND e.status = 'ACTIVE'
      LEFT JOIN classes c     ON c.id = e.class_id
      LEFT JOIN users tu      ON tu.id = g.created_by
      LEFT JOIN grade_disputes gd ON gd.grade_id = g.id
      ORDER BY g.created_at DESC
      LIMIT 300
    `
    return {
      success: true,
      data: rows.map(r => ({
        ...r,
        validated: Date.now() - new Date(r.created_at).getTime() > GRADE_VALIDATION_WINDOW_MS,
      })),
    }
  } catch (error: any) {
    return { success: false, error: dbError(error) }
  }
}

// ─── KPIs Dashboard ──────────────────────────────────────────────────────────

export async function getAdminKPIs() {
  const { db } = await getDb()

  const [
    studentsResult,
    teachersResult,
    classesResult,
    currentYear,
    absencesResult,
    unpaidResult,
  ] = await Promise.all([
    db.$queryRaw`SELECT COUNT(*)::int AS count FROM students`,
    db.$queryRaw`SELECT COUNT(*)::int AS count FROM teachers`,
    db.$queryRaw`SELECT COUNT(*)::int AS count FROM classes`,
    db.$queryRaw`SELECT id, name FROM academic_years WHERE is_current = TRUE LIMIT 1`,
    db.$queryRaw`
      SELECT COUNT(*)::int AS count FROM attendances
      WHERE status = 'ABSENT' AND justified = FALSE
      AND date >= NOW() - INTERVAL '30 days'
    `,
    db.$queryRaw`
      SELECT COUNT(*)::int AS count FROM payments
      WHERE status = 'PENDING' AND due_date < NOW()
    `,
  ])

  return {
    totalStudents: (studentsResult as any[])[0]?.count ?? 0,
    totalTeachers: (teachersResult as any[])[0]?.count ?? 0,
    totalClasses:  (classesResult as any[])[0]?.count ?? 0,
    currentYear:   (currentYear as any[])[0] ?? null,
    absencesMonth: (absencesResult as any[])[0]?.count ?? 0,
    unpaidFees:    (unpaidResult as any[])[0]?.count ?? 0,
  }
}

// ─── Années scolaires ─────────────────────────────────────────────────────────

export async function getAcademicYears() {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT ay.*, COUNT(t.id)::int AS terms_count
    FROM academic_years ay
    LEFT JOIN terms t ON t.academic_year_id = ay.id
    GROUP BY ay.id
    ORDER BY ay.start_date DESC
  ` as Promise<any[]>
}

export async function createAcademicYear(formData: FormData): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    const name      = formData.get('name') as string
    const startDate = formData.get('startDate') as string
    const endDate   = formData.get('endDate') as string
    const isCurrent = formData.get('isCurrent') === 'on'

    if (!name || !startDate || !endDate) {
      return { success: false, error: 'Tous les champs sont requis.' }
    }

    if (isCurrent) {
      await db.$executeRaw`UPDATE academic_years SET is_current = FALSE`
    }

    await db.$executeRaw`
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES (${name}, ${toDate(startDate)}, ${toDate(endDate)}, ${isCurrent})
    `

    // Créer les 3 trimestres automatiquement
    const year = await db.$queryRaw`
      SELECT id FROM academic_years WHERE name = ${name} ORDER BY created_at DESC LIMIT 1
    ` as { id: string }[]

    if (year[0]) {
      const yid = year[0].id
      const terms = [
        { name: '1er Trimestre', order: 1 },
        { name: '2ème Trimestre', order: 2 },
        { name: '3ème Trimestre', order: 3 },
      ]
      for (const t of terms) {
        await db.$executeRaw`
          INSERT INTO terms (academic_year_id, name, term_order, start_date, end_date)
          VALUES (${yid}, ${t.name}, ${t.order}, ${toDate(startDate)}, ${toDate(endDate)})
        `
      }
    }

    revalidatePath('/admin/academic-years')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function setCurrentYear(yearId: string): Promise<void> {
  const { db } = await getDb()
  await db.$executeRaw`UPDATE academic_years SET is_current = FALSE`
  await db.$executeRaw`UPDATE academic_years SET is_current = TRUE WHERE id = ${yearId}`
}

// ─── Niveaux ──────────────────────────────────────────────────────────────────

export async function getLevels() {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT * FROM levels ORDER BY level_order ASC
  ` as Promise<any[]>
}

export async function createLevel(formData: FormData): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    const name  = formData.get('name') as string
    const order = parseInt(formData.get('order') as string) || 1

    if (!name) return { success: false, error: 'Le nom est requis.' }

    await db.$executeRaw`
      INSERT INTO levels (name, level_order) VALUES (${name}, ${order})
    `
    revalidatePath('/admin/subjects')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Matières ─────────────────────────────────────────────────────────────────

export async function getSubjects() {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT s.*,
           json_agg(
             json_build_object('level_id', ls.level_id, 'level_name', l.name, 'coefficient', ls.coefficient)
           ) FILTER (WHERE ls.id IS NOT NULL) AS level_assignments
    FROM subjects s
    LEFT JOIN level_subjects ls ON ls.subject_id = s.id
    LEFT JOIN levels l ON l.id = ls.level_id
    GROUP BY s.id
    ORDER BY s.name
  ` as Promise<any[]>
}

export async function createSubject(formData: FormData): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    const name = formData.get('name') as string
    const code = formData.get('code') as string

    if (!name || !code) return { success: false, error: 'Nom et code requis.' }

    await db.$executeRaw`INSERT INTO subjects (name, code) VALUES (${name}, ${code})`
    revalidatePath('/admin/subjects')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Classes ──────────────────────────────────────────────────────────────────

export async function getClasses() {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT c.*, l.name AS level_name, s.name AS stream_name,
           ay.name AS year_name,
           COUNT(DISTINCT e.id)::int AS student_count,
           u.first_name || ' ' || u.last_name AS head_teacher_name
    FROM classes c
    JOIN levels l ON l.id = c.level_id
    LEFT JOIN streams s ON s.id = c.stream_id
    JOIN academic_years ay ON ay.id = c.academic_year_id
    LEFT JOIN enrollments e ON e.class_id = c.id AND e.status = 'ACTIVE'
    LEFT JOIN teachers t ON t.id = c.head_teacher_id
    LEFT JOIN users u ON u.id = t.user_id
    GROUP BY c.id, l.name, l.level_order, s.name, ay.name, u.first_name, u.last_name
    ORDER BY l.level_order, c.name
  ` as Promise<any[]>
}

export async function createClass(formData: FormData): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    const name           = formData.get('name') as string
    const levelId        = formData.get('levelId') as string
    const academicYearId = formData.get('academicYearId') as string
    const maxStudents    = parseInt(formData.get('maxStudents') as string) || 40
    const room           = formData.get('room') as string || null

    if (!name || !levelId || !academicYearId) {
      return { success: false, error: 'Nom, niveau et année scolaire requis.' }
    }

    await db.$executeRaw`
      INSERT INTO classes (name, level_id, academic_year_id, max_students, room)
      VALUES (${name}, ${levelId}, ${academicYearId}, ${maxStudents}, ${room})
    `
    revalidatePath('/admin/classes')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Enseignants ──────────────────────────────────────────────────────────────

export async function getTeachers() {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT t.*, u.first_name, u.last_name, u.email, u.phone, u.avatar_url, u.is_active,
           COUNT(DISTINCT tsc.class_id)::int AS class_count
    FROM teachers t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN teacher_subject_classes tsc ON tsc.teacher_id = t.id
    GROUP BY t.id, u.first_name, u.last_name, u.email, u.phone, u.avatar_url, u.is_active
    ORDER BY u.last_name, u.first_name
  ` as Promise<any[]>
}

export async function getTeacherById(id: string) {
  const { db } = await getDb()
  const rows: any[] = await db.$queryRaw`
    SELECT t.id, t.user_id, t.employee_id, t.specialty, t.hire_date,
           u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
           u.is_active, u.created_at,
           COUNT(DISTINCT tsc.class_id)::int  AS class_count,
           COUNT(DISTINCT tsc.subject_id)::int AS subject_count,
           json_agg(DISTINCT jsonb_build_object(
             'tsc_id',       tsc.id,
             'class_id',     tsc.class_id,
             'subject_id',   tsc.subject_id,
             'class_name',   c.name,
             'subject_name', s.name,
             'subject_code', s.code
           )) FILTER (WHERE tsc.id IS NOT NULL) AS assignments
    FROM teachers t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN teacher_subject_classes tsc ON tsc.teacher_id = t.id
    LEFT JOIN classes c ON c.id = tsc.class_id
    LEFT JOIN subjects s ON s.id = tsc.subject_id
    WHERE t.id = ${id}
    GROUP BY t.id, t.user_id, t.employee_id, t.specialty, t.hire_date,
             u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
             u.is_active, u.created_at
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function resetTeacherPassword(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult<any>> {
  const { db } = await getDb()
  const userId = formData.get('userId') as string
  if (!userId) return { success: false, error: 'Utilisateur introuvable.' }

  try {
    const tempPassword = nanoid(12)
    const passwordHash = await hash(tempPassword, 12)
    await db.$executeRaw`
      UPDATE users SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE id = ${userId}
    `
    return { success: true, data: { tempPassword } }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function createTeacher(_prev: ActionResult | null, formData: FormData): Promise<ActionResult<any>> {
  try {
    const { db } = await getDb()
    const firstName  = formData.get('firstName') as string
    const lastName   = formData.get('lastName') as string
    const email      = formData.get('email') as string
    const phone      = formData.get('phone') as string || null
    const specialty  = formData.get('specialty') as string || null
    const employeeId = formData.get('employeeId') as string || null

    if (!firstName || !lastName || !email) {
      return { success: false, error: 'Prénom, nom et email requis.' }
    }

    const tempPassword = nanoid(12)
    const passwordHash = await hash(tempPassword, 12)

    await db.$executeRaw`
      INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
      VALUES (${email}, ${passwordHash}, ${firstName}, ${lastName}, ${phone}, 'TEACHER')
    `

    const user = await db.$queryRaw`
      SELECT id FROM users WHERE email = ${email} LIMIT 1
    ` as { id: string }[]

    if (!user[0]) return { success: false, error: 'Erreur lors de la création de l\'utilisateur.' }

    await db.$executeRaw`
      INSERT INTO teachers (user_id, employee_id, specialty)
      VALUES (${user[0].id}, ${employeeId}, ${specialty})
    `

    revalidatePath('/admin/teachers')
    return { success: true, data: { tempPassword } }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Élèves ───────────────────────────────────────────────────────────────────

export async function getStudents(search?: string, classId?: string) {
  const { db } = await getDb()

  if (classId) {
    return db.$queryRaw`
      SELECT s.*, u.first_name, u.last_name, u.email, u.phone, u.avatar_url, u.is_active,
             c.name AS class_name, e.status AS enrollment_status
      FROM students s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
      LEFT JOIN classes c ON c.id = e.class_id
      WHERE e.class_id = ${classId}
        AND (${search ?? ''} = '' OR u.first_name ILIKE ${'%' + (search ?? '') + '%'}
             OR u.last_name ILIKE ${'%' + (search ?? '') + '%'}
             OR s.student_id ILIKE ${'%' + (search ?? '') + '%'})
      ORDER BY u.last_name, u.first_name
    ` as Promise<any[]>
  }

  return db.$queryRaw`
    SELECT s.*, u.first_name, u.last_name, u.email, u.phone, u.avatar_url, u.is_active,
           c.name AS class_name, e.status AS enrollment_status
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c ON c.id = e.class_id
    WHERE (${search ?? ''} = '' OR u.first_name ILIKE ${'%' + (search ?? '') + '%'}
           OR u.last_name ILIKE ${'%' + (search ?? '') + '%'}
           OR s.student_id ILIKE ${'%' + (search ?? '') + '%'})
    ORDER BY u.last_name, u.first_name
  ` as Promise<any[]>
}

export async function getStudentById(id: string) {
  const { db } = await getDb()
  const rows: any[] = await db.$queryRaw`
    SELECT s.id, s.user_id, s.student_id AS student_number, s.date_of_birth, s.gender, s.address,
           u.first_name, u.last_name, u.email, u.phone, u.avatar_url, u.is_active, u.created_at,
           c.name AS class_name, l.name AS level_name, ay.name AS year_name
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN enrollments e  ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c      ON c.id = e.class_id
    LEFT JOIN levels l       ON l.id = c.level_id
    LEFT JOIN academic_years ay ON ay.is_current = TRUE
    WHERE s.id = ${id}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function resetStudentPassword(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult<any>> {
  const { db } = await getDb()
  const userId = formData.get('userId') as string
  if (!userId) return { success: false, error: 'Utilisateur introuvable.' }
  try {
    const tempPassword = nanoid(12)
    const passwordHash = await hash(tempPassword, 12)
    await db.$executeRaw`UPDATE users SET password_hash = ${passwordHash}, updated_at = NOW() WHERE id = ${userId}`
    return { success: true, data: { tempPassword } }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function getParentById(id: string) {
  const { db } = await getDb()
  const rows: any[] = await db.$queryRaw`
    SELECT p.id, p.user_id,
           u.first_name, u.last_name, u.email, u.phone, u.avatar_url, u.is_active, u.created_at,
           json_agg(DISTINCT jsonb_build_object(
             'id',         s.id,
             'first_name', su.first_name,
             'last_name',  su.last_name,
             'class_name', c.name,
             'relation',   ps.relation
           )) FILTER (WHERE ps.id IS NOT NULL) AS children
    FROM parents p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN parent_students ps ON ps.parent_id = p.id
    LEFT JOIN students s         ON s.id = ps.student_id
    LEFT JOIN users su           ON su.id = s.user_id
    LEFT JOIN enrollments e      ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c          ON c.id = e.class_id
    WHERE p.id = ${id}
    GROUP BY p.id, p.user_id, u.first_name, u.last_name, u.email, u.phone, u.avatar_url, u.is_active, u.created_at
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function resetParentPassword(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult<any>> {
  const { db } = await getDb()
  const userId = formData.get('userId') as string
  if (!userId) return { success: false, error: 'Utilisateur introuvable.' }
  try {
    const tempPassword = nanoid(12)
    const passwordHash = await hash(tempPassword, 12)
    await db.$executeRaw`UPDATE users SET password_hash = ${passwordHash}, updated_at = NOW() WHERE id = ${userId}`
    return { success: true, data: { tempPassword } }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function createStudent(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult<any>> {
  try {
    const { db } = await getDb()
    const firstName   = formData.get('firstName') as string
    const lastName    = formData.get('lastName') as string
    const email       = formData.get('email') as string
    const dateOfBirth = formData.get('dateOfBirth') as string || null
    const gender      = formData.get('gender') as string || null
    const address     = formData.get('address') as string || null
    const classId     = formData.get('classId') as string || null

    if (!firstName || !lastName || !email) {
      return { success: false, error: 'Prénom, nom et email requis.' }
    }

    const studentNumber = `EL-${Date.now().toString().slice(-6)}`
    const tempPassword  = nanoid(12)
    const passwordHash  = await hash(tempPassword, 12)

    await db.$executeRaw`
      INSERT INTO users (email, password_hash, first_name, last_name, role)
      VALUES (${email}, ${passwordHash}, ${firstName}, ${lastName}, 'STUDENT')
    `

    const user = await db.$queryRaw`
      SELECT id FROM users WHERE email = ${email} LIMIT 1
    ` as { id: string }[]

    if (!user[0]) return { success: false, error: 'Erreur lors de la création.' }

    await db.$executeRaw`
      INSERT INTO students (user_id, student_id, date_of_birth, gender, address)
      VALUES (${user[0].id}, ${studentNumber}, ${toDate(dateOfBirth)}, ${gender}, ${address})
    `

    if (classId) {
      const student = await db.$queryRaw`
        SELECT id FROM students WHERE user_id = ${user[0].id} LIMIT 1
      ` as { id: string }[]

      const year = await db.$queryRaw`
        SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1
      ` as { id: string }[]

      if (student[0] && year[0]) {
        await db.$executeRaw`
          INSERT INTO enrollments (student_id, class_id, academic_year_id)
          VALUES (${student[0].id}, ${classId}, ${year[0].id})
          ON CONFLICT (student_id, academic_year_id) DO NOTHING
        `
      }
    }

    revalidatePath('/admin/students')
    return { success: true, data: { studentId: studentNumber, tempPassword } }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Parents ──────────────────────────────────────────────────────────────────

export async function getParents() {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT p.*, u.first_name, u.last_name, u.email, u.phone, u.is_active,
           COUNT(DISTINCT ps.student_id)::int AS children_count
    FROM parents p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN parent_students ps ON ps.parent_id = p.id
    GROUP BY p.id, u.first_name, u.last_name, u.email, u.phone, u.is_active
    ORDER BY u.last_name, u.first_name
  ` as Promise<any[]>
}

export async function createParent(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult<any>> {
  try {
    const { db } = await getDb()
    const firstName = formData.get('firstName') as string
    const lastName  = formData.get('lastName') as string
    const email     = formData.get('email') as string
    const phone     = formData.get('phone') as string || null

    if (!firstName || !lastName || !email) {
      return { success: false, error: 'Prénom, nom et email requis.' }
    }

    const tempPassword = nanoid(12)
    const passwordHash = await hash(tempPassword, 12)

    await db.$executeRaw`
      INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
      VALUES (${email}, ${passwordHash}, ${firstName}, ${lastName}, ${phone}, 'PARENT')
    `

    const user = await db.$queryRaw`
      SELECT id FROM users WHERE email = ${email} LIMIT 1
    ` as { id: string }[]

    if (!user[0]) return { success: false, error: 'Erreur lors de la création.' }

    await db.$executeRaw`INSERT INTO parents (user_id) VALUES (${user[0].id})`

    revalidatePath('/admin/parents')
    return { success: true, data: { tempPassword } }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Gestion classe & suppression élève ──────────────────────────────────────

export async function removeStudentFromClass(studentId: string): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    await db.$executeRaw`
      UPDATE enrollments SET status = 'INACTIVE'
      WHERE student_id = ${studentId} AND status = 'ACTIVE'
    `
    revalidatePath(`/admin/students/${studentId}`)
    revalidatePath('/admin/students')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function changeStudentClass(studentId: string, classId: string): Promise<ActionResult> {
  try {
    const { db } = await getDb()

    const yearRows: { id: string }[] = await db.$queryRaw`
      SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1
    `
    const yearId = yearRows[0]?.id
    if (!yearId) return { success: false, error: 'Aucune année académique courante.' }

    // Désactiver l'inscription actuelle
    await db.$executeRaw`
      UPDATE enrollments SET status = 'INACTIVE'
      WHERE student_id = ${studentId} AND status = 'ACTIVE'
    `
    // Créer ou réactiver une inscription dans la nouvelle classe
    await db.$executeRaw`
      INSERT INTO enrollments (student_id, class_id, academic_year_id, status)
      VALUES (${studentId}, ${classId}, ${yearId}, 'ACTIVE')
      ON CONFLICT (student_id, academic_year_id)
        DO UPDATE SET class_id = EXCLUDED.class_id, status = 'ACTIVE'
    `
    revalidatePath(`/admin/students/${studentId}`)
    revalidatePath('/admin/students')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function deleteStudent(studentId: string): Promise<ActionResult> {
  try {
    const { db } = await getDb()

    // Récupérer le user_id avant suppression
    const rows: { user_id: string }[] = await db.$queryRaw`
      SELECT user_id FROM students WHERE id = ${studentId} LIMIT 1
    `
    if (!rows[0]) return { success: false, error: 'Élève introuvable.' }
    const userId = rows[0].user_id

    // Supprimer dans l'ordre des dépendances
    await db.$executeRaw`DELETE FROM alert_logs           WHERE student_id = ${studentId}`
    await db.$executeRaw`DELETE FROM attendances          WHERE student_id = ${studentId}`
    await db.$executeRaw`DELETE FROM grades               WHERE student_id = ${studentId}`
    await db.$executeRaw`DELETE FROM payments             WHERE student_id = ${studentId}`
    await db.$executeRaw`DELETE FROM cafeteria_subscriptions WHERE student_id = ${studentId}`
    await db.$executeRaw`DELETE FROM book_loans           WHERE borrower_type = 'student' AND borrower_id = ${studentId}`
    await db.$executeRaw`DELETE FROM parent_students      WHERE student_id = ${studentId}`
    await db.$executeRaw`DELETE FROM enrollments          WHERE student_id = ${studentId}`
    await db.$executeRaw`DELETE FROM students             WHERE id = ${studentId}`
    await db.$executeRaw`DELETE FROM users                WHERE id = ${userId}`

    revalidatePath('/admin/students')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Suppression parent ───────────────────────────────────────────────────────

export async function deleteParent(parentId: string): Promise<ActionResult> {
  try {
    const { db } = await getDb()

    const rows: { user_id: string }[] = await db.$queryRaw`
      SELECT user_id FROM parents WHERE id = ${parentId} LIMIT 1
    `
    if (!rows[0]) return { success: false, error: 'Parent introuvable.' }
    const userId = rows[0].user_id

    await db.$executeRaw`DELETE FROM parent_students WHERE parent_id = ${parentId}`
    await db.$executeRaw`DELETE FROM parents         WHERE id = ${parentId}`
    await db.$executeRaw`DELETE FROM users           WHERE id = ${userId}`

    revalidatePath('/admin/parents')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Frais scolaires ──────────────────────────────────────────────────────────

export async function getFeeTypes() {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT ft.*, COUNT(p.id)::int AS payments_count,
           COALESCE(SUM(CASE WHEN p.status = 'SUCCESS' THEN p.amount ELSE 0 END), 0)::int AS total_collected
    FROM fee_types ft
    LEFT JOIN payments p ON p.fee_type_id = ft.id
    GROUP BY ft.id
    ORDER BY ft.name
  ` as Promise<any[]>
}

export async function createFeeType(formData: FormData): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    const name       = formData.get('name') as string
    const amount     = parseInt(formData.get('amount') as string)
    const isOptional = formData.get('isOptional') === 'on'

    if (!name || isNaN(amount)) return { success: false, error: 'Nom et montant requis.' }

    await db.$executeRaw`
      INSERT INTO fee_types (name, amount, is_optional)
      VALUES (${name}, ${amount}, ${isOptional})
    `
    revalidatePath('/admin/fees')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Paramètres école ─────────────────────────────────────────────────────────

export async function getSchoolSettings() {
  const { db } = await getDb()
  const rows = await db.$queryRaw`
    SELECT * FROM school_settings LIMIT 1
  ` as any[]
  return rows[0] ?? {}
}

export async function saveSchoolSettings(formData: FormData): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    const schoolName   = formData.get('school_name') as string
    const address      = formData.get('school_address') as string || null
    const city         = formData.get('school_city') as string || null
    const phone        = formData.get('school_phone') as string || null
    const email        = formData.get('school_email') as string || null
    const directorName = formData.get('school_director') as string || null

    if (!schoolName) return { success: false, error: 'Le nom de l\'établissement est requis.' }

    const existing = await db.$queryRaw`SELECT id FROM school_settings LIMIT 1` as { id: string }[]

    if (existing[0]) {
      await db.$executeRaw`
        UPDATE school_settings
        SET school_name = ${schoolName}, address = ${address}, city = ${city},
            phone = ${phone}, email = ${email}, director_name = ${directorName},
            updated_at = NOW()
        WHERE id = ${existing[0].id}
      `
    } else {
      await db.$executeRaw`
        INSERT INTO school_settings (school_name, address, city, phone, email, director_name)
        VALUES (${schoolName}, ${address}, ${city}, ${phone}, ${email}, ${directorName})
      `
    }

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Erreur lors de la sauvegarde.' }
  }
}

// ─── Notes & Moyennes (admin) ──────────────────────────────────────────────────

export async function getTerms() {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT t.id, t.name, t.term_order, t.start_date, t.end_date
    FROM terms t
    JOIN academic_years ay ON ay.id = t.academic_year_id
    WHERE ay.is_current = TRUE
    ORDER BY t.term_order
  ` as Promise<any[]>
}

export async function getClassGradesOverview(classId: string, termId: string) {
  const { db } = await getDb()

  // Subjects for this class's level (with coefficients)
  const subjectRows: any[] = await db.$queryRaw`
    SELECT s.id, s.name, s.code, ls.coefficient
    FROM subjects s
    JOIN level_subjects ls ON ls.subject_id = s.id
    JOIN classes c ON c.level_id = ls.level_id
    WHERE c.id = ${classId}
    ORDER BY s.name
  `
  const subjects = subjectRows.map(s => ({ ...s, coefficient: Number(s.coefficient) }))

  // All grades for this class + term
  const grades: any[] = await db.$queryRaw`
    SELECT g.student_id, g.subject_id,
           SUM(g.value * g.coefficient) AS weighted_sum,
           SUM(g.coefficient)           AS coeff_sum
    FROM grades g
    JOIN enrollments e ON e.student_id = g.student_id AND e.class_id = ${classId}
    WHERE g.term_id = ${termId}
    AND e.status = 'ACTIVE'
    GROUP BY g.student_id, g.subject_id
  `

  // Students in this class
  const students: any[] = await db.$queryRaw`
    SELECT s.id, s.student_id AS student_number,
           u.first_name, u.last_name
    FROM enrollments e
    JOIN students s ON s.id = e.student_id
    JOIN users u ON u.id = s.user_id
    WHERE e.class_id = ${classId}
    AND e.status = 'ACTIVE'
    ORDER BY u.last_name, u.first_name
  `

  // Compute averages in JS
  const gradeMap: Record<string, Record<string, { weightedSum: number; coeffSum: number }>> = {}
  for (const g of grades) {
    if (!gradeMap[g.student_id]) gradeMap[g.student_id] = {}
    gradeMap[g.student_id][g.subject_id] = {
      weightedSum: parseFloat(g.weighted_sum),
      coeffSum: parseFloat(g.coeff_sum),
    }
  }

  const rows = students.map(s => {
    const subjectAverages: Record<string, number | null> = {}
    let generalWeightedSum = 0
    let generalCoeffSum = 0

    for (const sub of subjects) {
      const entry = gradeMap[s.id]?.[sub.id]
      if (entry && entry.coeffSum > 0) {
        const avg = entry.weightedSum / entry.coeffSum
        subjectAverages[sub.id] = Math.round(avg * 100) / 100
        generalWeightedSum += avg * parseFloat(sub.coefficient)
        generalCoeffSum += parseFloat(sub.coefficient)
      } else {
        subjectAverages[sub.id] = null
      }
    }

    const generalAverage = generalCoeffSum > 0
      ? Math.round((generalWeightedSum / generalCoeffSum) * 100) / 100
      : null

    return { ...s, subjectAverages, generalAverage }
  })

  // Sort by general average desc
  rows.sort((a, b) => (b.generalAverage ?? -1) - (a.generalAverage ?? -1))

  return { subjects, rows }
}

// ─── Rapport des présences ────────────────────────────────────────────────────

export async function getAttendanceReport(classId: string, termId: string) {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT
      s.id, s.student_id AS student_number,
      u.first_name, u.last_name,
      COUNT(a.id)::int                                                    AS total_days,
      COUNT(CASE WHEN a.status = 'PRESENT'  THEN 1 END)::int             AS present_count,
      COUNT(CASE WHEN a.status = 'ABSENT'   THEN 1 END)::int             AS absent_count,
      COUNT(CASE WHEN a.status = 'LATE'     THEN 1 END)::int             AS late_count,
      COUNT(CASE WHEN a.status = 'EXCUSED'  THEN 1 END)::int             AS excused_count,
      COUNT(CASE WHEN a.status = 'ABSENT'
                  AND a.justified = FALSE   THEN 1 END)::int             AS unjustified_count
    FROM enrollments e
    JOIN students s ON s.id = e.student_id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN attendances a ON a.student_id = s.id AND a.term_id = ${termId}
    WHERE e.class_id = ${classId} AND e.status = 'ACTIVE'
    GROUP BY s.id, s.student_id, u.first_name, u.last_name
    ORDER BY u.last_name, u.first_name
  ` as Promise<any[]>
}

// ─── Présence des enseignants ─────────────────────────────────────────────────

export async function getTeacherAttendance(date: string) {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT
      t.id AS teacher_id, t.specialty,
      u.first_name, u.last_name,
      ta.id AS attendance_id,
      COALESCE(ta.status, 'PRESENT') AS status,
      COALESCE(ta.justified, FALSE)  AS justified,
      ta.justification
    FROM teachers t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN teacher_attendances ta
      ON ta.teacher_id = t.id AND ta.date = ${toDate(date)}
    WHERE u.is_active = TRUE
    ORDER BY u.last_name, u.first_name
  ` as Promise<any[]>
}

export async function saveTeacherAttendance(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { db, session } = await getDb()

  const date = formData.get('date') as string
  if (!date) return { success: false, error: 'Date requise.' }

  const teacherIds = formData.getAll('teacher_id') as string[]
  try {
    for (const tid of teacherIds) {
      const status       = (formData.get(`status_${tid}`)       as string) || 'PRESENT'
      const justified     = formData.get(`justified_${tid}`)     === '1'
      const justification = (formData.get(`justification_${tid}`) as string) || null

      await db.$executeRaw`
        INSERT INTO teacher_attendances
          (teacher_id, date, status, justified, justification, recorded_by)
        VALUES
          (${tid}, ${toDate(date)}, ${status}, ${justified}, ${justification}, ${session.user.id})
        ON CONFLICT (teacher_id, date) DO UPDATE
          SET status = EXCLUDED.status, justified = EXCLUDED.justified,
              justification = EXCLUDED.justification, recorded_by = EXCLUDED.recorded_by
      `
    }
    revalidatePath('/admin/teacher-attendance')
    revalidatePath('/admin/analytics')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

/** Taux de présence des enseignants pour une date donnée (par défaut aujourd'hui) — utilisé par le tableau de bord. */
export async function getTodayTeacherAttendanceRate() {
  const { db } = await getDb()
  const [row] = await db.$queryRaw`
    SELECT
      COUNT(DISTINCT t.id)::int AS total_teachers,
      COUNT(ta.id) FILTER (WHERE ta.status = 'PRESENT')::int AS present_count,
      COUNT(ta.id)::int AS marked_count
    FROM teachers t
    JOIN users u ON u.id = t.user_id AND u.is_active = TRUE
    LEFT JOIN teacher_attendances ta ON ta.teacher_id = t.id AND ta.date = CURRENT_DATE
  ` as any[]
  return {
    totalTeachers: row?.total_teachers ?? 0,
    presentCount:  row?.present_count  ?? 0,
    markedCount:   row?.marked_count   ?? 0,
    rate: row?.marked_count > 0 ? Math.round((row.present_count / row.marked_count) * 100) : null,
  }
}

// ─── Paiements ────────────────────────────────────────────────────────────────

export async function getPayments(search = '', status = '') {
  const { db } = await getDb()
  if (search && status) {
    return db.$queryRaw`
      SELECT p.*, ft.name AS fee_name, ft.amount AS fee_amount,
             u.first_name, u.last_name, s.student_id AS student_number
      FROM payments p
      JOIN fee_types ft ON ft.id = p.fee_type_id
      JOIN students s ON s.id = p.student_id
      JOIN users u ON u.id = s.user_id
      WHERE p.status = ${status}
        AND (u.first_name ILIKE ${'%' + search + '%'}
          OR u.last_name  ILIKE ${'%' + search + '%'}
          OR s.student_id ILIKE ${'%' + search + '%'})
      ORDER BY p.created_at DESC
      LIMIT 100
    ` as Promise<any[]>
  }
  if (status) {
    return db.$queryRaw`
      SELECT p.*, ft.name AS fee_name, ft.amount AS fee_amount,
             u.first_name, u.last_name, s.student_id AS student_number
      FROM payments p
      JOIN fee_types ft ON ft.id = p.fee_type_id
      JOIN students s ON s.id = p.student_id
      JOIN users u ON u.id = s.user_id
      WHERE p.status = ${status}
      ORDER BY p.created_at DESC LIMIT 100
    ` as Promise<any[]>
  }
  if (search) {
    return db.$queryRaw`
      SELECT p.*, ft.name AS fee_name, ft.amount AS fee_amount,
             u.first_name, u.last_name, s.student_id AS student_number
      FROM payments p
      JOIN fee_types ft ON ft.id = p.fee_type_id
      JOIN students s ON s.id = p.student_id
      JOIN users u ON u.id = s.user_id
      WHERE u.first_name ILIKE ${'%' + search + '%'}
         OR u.last_name  ILIKE ${'%' + search + '%'}
         OR s.student_id ILIKE ${'%' + search + '%'}
      ORDER BY p.created_at DESC LIMIT 100
    ` as Promise<any[]>
  }
  return db.$queryRaw`
    SELECT p.*, ft.name AS fee_name, ft.amount AS fee_amount,
           u.first_name, u.last_name, s.student_id AS student_number
    FROM payments p
    JOIN fee_types ft ON ft.id = p.fee_type_id
    JOIN students s ON s.id = p.student_id
    JOIN users u ON u.id = s.user_id
    ORDER BY p.created_at DESC LIMIT 100
  ` as Promise<any[]>
}

export async function createPayment(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { db } = await getDb()

  const studentId = formData.get('student_id') as string
  const feeTypeId = formData.get('fee_type_id') as string
  const amount    = parseInt(formData.get('amount') as string)
  const dueDate   = (formData.get('due_date') as string) || null

  if (!studentId || !feeTypeId || isNaN(amount)) {
    return { success: false, error: 'Élève, type de frais et montant requis.' }
  }

  try {
    await db.$executeRaw`
      INSERT INTO payments (student_id, fee_type_id, amount, status, due_date)
      VALUES (${studentId}, ${feeTypeId}, ${amount}, 'PENDING', ${toDate(dueDate)})
    `
    revalidatePath('/admin/payments')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function markPaymentPaid(paymentId: string): Promise<void> {
  const { db } = await getDb()
  await db.$executeRaw`
    UPDATE payments
    SET status = 'SUCCESS', paid_at = NOW()
    WHERE id = ${paymentId}
  `
  revalidatePath('/admin/payments')
}

export async function getPaymentStats() {
  const { db } = await getDb()
  const rows: any[] = await db.$queryRaw`
    SELECT
      COUNT(*)::int                                                     AS total_count,
      COALESCE(SUM(amount), 0)::int                                     AS total_amount,
      COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount END), 0)::int AS paid_amount,
      COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount END), 0)::int AS pending_amount,
      COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END)::int               AS paid_count,
      COUNT(CASE WHEN status = 'PENDING' THEN 1 END)::int               AS pending_count
    FROM payments
  `
  return rows[0] ?? { total_count: 0, total_amount: 0, paid_amount: 0, pending_amount: 0, paid_count: 0, pending_count: 0 }
}

// ─── Bulletins ────────────────────────────────────────────────────────────────

export async function getBulletin(studentId: string, termId: string) {
  const { db } = await getDb()

  const [profileRows, termRows, schoolRows] = await Promise.all([
    db.$queryRaw`
      SELECT s.id, s.student_id AS student_number, s.date_of_birth, s.gender,
             u.first_name, u.last_name, u.email,
             c.id AS class_id, c.name AS class_name, l.name AS level_name,
             ay.name AS year_name
      FROM students s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN enrollments e  ON e.student_id = s.id AND e.status = 'ACTIVE'
      LEFT JOIN classes c      ON c.id = e.class_id
      LEFT JOIN levels l       ON l.id = c.level_id
      LEFT JOIN academic_years ay ON ay.is_current = TRUE
      WHERE s.id = ${studentId} LIMIT 1
    ` as Promise<any[]>,

    db.$queryRaw`
      SELECT t.id, t.name, t.term_order, t.start_date, t.end_date
      FROM terms t WHERE t.id = ${termId} LIMIT 1
    ` as Promise<any[]>,

    db.$queryRaw`
      SELECT school_name, address, phone, email, logo_url
      FROM school_settings LIMIT 1
    ` as Promise<any[]>,
  ])

  const profile = profileRows[0]
  const term    = termRows[0]
  if (!profile || !term) return null

  // Matières avec coefficients pour ce niveau
  const subjects: any[] = await db.$queryRaw`
    SELECT s.id, s.name, s.code, COALESCE(ls.coefficient, 1)::float AS coefficient
    FROM subjects s
    LEFT JOIN level_subjects ls ON ls.subject_id = s.id AND ls.level_id = (
      SELECT c.level_id FROM classes c WHERE c.id = ${profile.class_id} LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM grades g
      WHERE g.subject_id = s.id AND g.student_id = ${studentId} AND g.term_id = ${termId}
    )
    ORDER BY s.name
  `

  // Notes de l'élève pour ce trimestre
  const grades: any[] = await db.$queryRaw`
    SELECT g.subject_id, g.type, g.value::float, g.coefficient::float
    FROM grades g
    WHERE g.student_id = ${studentId} AND g.term_id = ${termId}
    ORDER BY g.created_at
  `

  // Présences pour ce trimestre
  const attendanceRows: any[] = await db.$queryRaw`
    SELECT
      COUNT(a.id)::int                                             AS total,
      COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END)::int        AS present,
      COUNT(CASE WHEN a.status = 'ABSENT'  THEN 1 END)::int        AS absent,
      COUNT(CASE WHEN a.status = 'LATE'    THEN 1 END)::int        AS late,
      COUNT(CASE WHEN a.status = 'ABSENT' AND a.justified = FALSE THEN 1 END)::int AS unjustified
    FROM attendances a
    WHERE a.student_id = ${studentId} AND a.term_id = ${termId}
  `

  // Rang dans la classe pour ce trimestre
  const rankRows: any[] = await db.$queryRaw`
    SELECT student_id,
           RANK() OVER (ORDER BY general_avg DESC NULLS LAST)::int AS rank,
           COUNT(*) OVER ()::int AS total_students
    FROM (
      SELECT g.student_id,
        SUM(
          (SUM(g.value * g.coefficient) / NULLIF(SUM(g.coefficient), 0))
          * COALESCE(ls.coefficient, 1)
        ) / NULLIF(SUM(COALESCE(ls.coefficient, 1)), 0) AS general_avg
      FROM grades g
      JOIN enrollments e ON e.student_id = g.student_id AND e.status = 'ACTIVE'
      LEFT JOIN level_subjects ls ON ls.subject_id = g.subject_id AND ls.level_id = (
        SELECT c.level_id FROM classes c WHERE c.id = ${profile.class_id} LIMIT 1
      )
      WHERE g.term_id = ${termId} AND e.class_id = ${profile.class_id}
      GROUP BY g.student_id, g.subject_id, ls.coefficient
    ) sub
    WHERE student_id = ${studentId}
    LIMIT 1
  `

  // Calcul des moyennes par matière en JS
  const gradesBySubject: Record<string, any[]> = {}
  for (const g of grades) {
    if (!gradesBySubject[g.subject_id]) gradesBySubject[g.subject_id] = []
    gradesBySubject[g.subject_id].push(g)
  }

  let generalWeightedSum = 0
  let generalCoeffSum = 0

  const subjectRows = subjects.map((sub: any) => {
    const subGrades = gradesBySubject[sub.id] ?? []
    const ws = subGrades.reduce((s: number, g: any) => s + g.value * g.coefficient, 0)
    const cs = subGrades.reduce((s: number, g: any) => s + g.coefficient, 0)
    const average = cs > 0 ? Math.round((ws / cs) * 100) / 100 : null
    if (average !== null) {
      generalWeightedSum += average * sub.coefficient
      generalCoeffSum    += sub.coefficient
    }
    return { ...sub, grades: subGrades, average }
  })

  const generalAverage = generalCoeffSum > 0
    ? Math.round((generalWeightedSum / generalCoeffSum) * 100) / 100
    : null

  const appreciation = (avg: number | null) => {
    if (avg === null) return ''
    if (avg >= 16) return 'Très bien'
    if (avg >= 14) return 'Bien'
    if (avg >= 12) return 'Assez bien'
    if (avg >= 10) return 'Passable'
    return 'Insuffisant'
  }

  return {
    school:      schoolRows[0] ?? {},
    profile,
    term,
    subjectRows,
    generalAverage,
    appreciation: appreciation(generalAverage),
    attendance:   attendanceRows[0] ?? { total: 0, present: 0, absent: 0, late: 0, unjustified: 0 },
    rank:         rankRows[0]?.rank         ?? null,
    totalStudents: rankRows[0]?.total_students ?? null,
  }
}

export async function getStudentsForPayment() {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT s.id, s.student_id AS student_number, u.first_name, u.last_name,
           c.name AS class_name
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c ON c.id = e.class_id
    ORDER BY u.last_name, u.first_name
  ` as Promise<any[]>
}

export async function generatePaymentLink(paymentId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const { db, session } = await getDb()

    const rows: any[] = await db.$queryRaw`
      SELECT p.id, p.amount, p.status, p.student_id,
             ft.name AS fee_name,
             u.first_name || ' ' || u.last_name AS student_name,
             ss.school_name
      FROM payments p
      JOIN fee_types ft ON ft.id = p.fee_type_id
      JOIN students s ON s.id = p.student_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN school_settings ss ON TRUE
      WHERE p.id = ${paymentId}
      LIMIT 1
    `
    const payment = rows[0]
    if (!payment) return { success: false, error: 'Paiement introuvable.' }
    if (payment.status !== 'PENDING') return { success: false, error: 'Ce paiement n\'est pas en attente.' }

    const token = await signPaymentToken({
      paymentId:   payment.id,
      schemaName:  session.user.schemaName,
      studentId:   payment.student_id,
      amount:      Number(payment.amount),
      feeName:     payment.fee_name,
      studentName: payment.student_name,
      schoolName:  payment.school_name ?? 'Établissement',
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    return { success: true, data: { url: `${baseUrl}/paiement/${token}` } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur.' }
  }
}

// ─── Emploi du temps ──────────────────────────────────────────────────────────

export async function getSchedule(classId: string) {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT sc.id, sc.day_of_week, sc.start_time, sc.end_time, sc.room,
           s.name  AS subject_name, s.code AS subject_code,
           u.first_name AS teacher_first, u.last_name AS teacher_last,
           tsc.id AS tsc_id
    FROM schedules sc
    JOIN teacher_subject_classes tsc ON tsc.id = sc.teacher_subject_class_id
    JOIN subjects s   ON s.id  = tsc.subject_id
    JOIN teachers t   ON t.id  = tsc.teacher_id
    JOIN users u      ON u.id  = t.user_id
    WHERE sc.class_id = ${classId}
    ORDER BY sc.day_of_week, sc.start_time
  ` as Promise<any[]>
}

export async function getTscForClass(classId: string) {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT tsc.id,
           s.name  AS subject_name,
           u.first_name AS teacher_first, u.last_name AS teacher_last
    FROM teacher_subject_classes tsc
    JOIN subjects s ON s.id = tsc.subject_id
    JOIN teachers t ON t.id = tsc.teacher_id
    JOIN users u    ON u.id = t.user_id
    WHERE tsc.class_id = ${classId}
    ORDER BY s.name
  ` as Promise<any[]>
}

export async function getScheduleFormData(classId: string) {
  const { db } = await getDb()
  const [teachers, subjects] = await Promise.all([
    db.$queryRaw`
      SELECT t.id, u.first_name, u.last_name
      FROM teachers t JOIN users u ON u.id = t.user_id
      WHERE u.is_active = TRUE
      ORDER BY u.last_name, u.first_name
    ` as Promise<any[]>,
    db.$queryRaw`
      SELECT id, name, code FROM subjects ORDER BY name
    ` as Promise<any[]>,
  ])
  return { teachers, subjects }
}

export async function createScheduleSlot(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    const classId   = formData.get('class_id')   as string
    const teacherId = formData.get('teacher_id') as string
    const subjectId = formData.get('subject_id') as string
    const day       = parseInt(formData.get('day_of_week') as string)
    const startTime = formData.get('start_time') as string
    const endTime   = formData.get('end_time')   as string
    const room      = (formData.get('room') as string) || null

    if (!classId || !teacherId || !subjectId || isNaN(day) || !startTime || !endTime) {
      return { success: false, error: 'Tous les champs sont requis.' }
    }
    if (startTime >= endTime) {
      return { success: false, error: 'L\'heure de fin doit être après l\'heure de début.' }
    }

    // Détecter conflit : même classe, même jour, chevauchement horaire
    const conflicts = await db.$queryRaw`
      SELECT id FROM schedules
      WHERE class_id = ${classId}
        AND day_of_week = ${day}
        AND start_time < ${endTime}
        AND end_time   > ${startTime}
    ` as any[]
    if (conflicts.length > 0) {
      return { success: false, error: 'Ce créneau chevauche un cours existant.' }
    }

    // Créer ou récupérer le lien enseignant-matière-classe (TSC)
    await db.$executeRaw`
      INSERT INTO teacher_subject_classes (teacher_id, class_id, subject_id)
      VALUES (${teacherId}, ${classId}, ${subjectId})
      ON CONFLICT (teacher_id, class_id, subject_id) DO NOTHING
    `
    const tscRows = await db.$queryRaw`
      SELECT id FROM teacher_subject_classes
      WHERE teacher_id = ${teacherId} AND class_id = ${classId} AND subject_id = ${subjectId}
      LIMIT 1
    ` as { id: string }[]
    const tscId = tscRows[0]?.id
    if (!tscId) return { success: false, error: 'Erreur lors de la liaison enseignant-classe.' }

    await db.$executeRaw`
      INSERT INTO schedules (class_id, teacher_subject_class_id, day_of_week, start_time, end_time, room)
      VALUES (${classId}, ${tscId}, ${day}, ${startTime}, ${endTime}, ${room})
    `
    revalidatePath('/admin/schedule')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function deleteScheduleSlot(slotId: string): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    await db.$executeRaw`DELETE FROM schedules WHERE id = ${slotId}`
    revalidatePath('/admin/schedule')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Sanctions ────────────────────────────────────────────────────────────────

export async function getStudentsForSanction() {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT s.id, u.first_name, u.last_name, c.name AS class_name
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c ON c.id = e.class_id
    ORDER BY u.last_name, u.first_name
  ` as Promise<any[]>
}

export async function getSanctions(search?: string) {
  const { db } = await getDb()
  if (search && search.trim() !== '') {
    return db.$queryRaw`
      SELECT sa.id, sa.type, sa.reason, sa.description, sa.date, sa.duration, sa.notified,
             u.first_name, u.last_name, c.name AS class_name,
             iu.first_name AS issued_first, iu.last_name AS issued_last
      FROM sanctions sa
      JOIN students s ON s.id = sa.student_id
      JOIN users u ON u.id = s.user_id
      JOIN users iu ON iu.id = sa.issued_by
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
      LEFT JOIN classes c ON c.id = e.class_id
      WHERE u.first_name ILIKE ${'%' + search + '%'}
         OR u.last_name  ILIKE ${'%' + search + '%'}
      ORDER BY sa.date DESC
    ` as Promise<any[]>
  }
  return db.$queryRaw`
    SELECT sa.id, sa.type, sa.reason, sa.description, sa.date, sa.duration, sa.notified,
           u.first_name, u.last_name, c.name AS class_name,
           iu.first_name AS issued_first, iu.last_name AS issued_last
    FROM sanctions sa
    JOIN students s ON s.id = sa.student_id
    JOIN users u ON u.id = s.user_id
    JOIN users iu ON iu.id = sa.issued_by
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c ON c.id = e.class_id
    ORDER BY sa.date DESC
  ` as Promise<any[]>
}

export async function createSanction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireRole('ADMIN', 'CENSOR')
    const db = getTenantPrisma(session.user.schemaName) as any

    const studentId   = formData.get('student_id') as string
    const type        = formData.get('type') as string
    const reason      = formData.get('reason') as string
    const description = (formData.get('description') as string) || null
    const date        = formData.get('date') as string
    const durationRaw = formData.get('duration') as string
    const duration    = durationRaw ? parseInt(durationRaw) : null

    if (!studentId || !type || !reason || !date) {
      return { success: false, error: 'Élève, type, raison et date sont requis.' }
    }

    await db.$executeRaw`
      INSERT INTO sanctions (student_id, type, reason, description, date, duration, issued_by)
      VALUES (${studentId}, ${type}, ${reason}, ${description}, ${toDate(date)}, ${duration}, ${session.user.id})
    `
    revalidatePath('/admin/sanctions')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

export async function deleteSanction(id: string): Promise<ActionResult> {
  try {
    const session = await requireRole('ADMIN', 'CENSOR')
    const db = getTenantPrisma(session.user.schemaName) as any
    await db.$executeRaw`DELETE FROM sanctions WHERE id = ${id}`
    revalidatePath('/admin/sanctions')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

// ─── Reçu paiement ────────────────────────────────────────────────────────────

export async function getPaymentReceipt(paymentId: string) {
  const { db } = await getDb()
  const rows: any[] = await db.$queryRaw`
    SELECT p.id, p.amount, p.status, p.paid_at, p.due_date, p.receipt,
           ft.name AS fee_name, ft.amount AS fee_amount,
           s.student_id AS student_number,
           u.first_name, u.last_name,
           c.name AS class_name,
           ss.school_name, ss.address AS school_address, ss.phone AS school_phone,
           ss.email AS school_email, ss.director_name
    FROM payments p
    JOIN fee_types ft ON ft.id = p.fee_type_id
    JOIN students s ON s.id = p.student_id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c ON c.id = e.class_id
    LEFT JOIN school_settings ss ON TRUE
    WHERE p.id = ${paymentId}
    LIMIT 1
  `
  return rows[0] ?? null
}

// ─── Export CSV paiements ─────────────────────────────────────────────────────

export async function getPaymentsForExport() {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT s.student_id AS student_number, u.last_name, u.first_name,
           c.name AS class_name, ft.name AS fee_name,
           p.amount, p.status, p.due_date, p.paid_at
    FROM payments p
    JOIN fee_types ft ON ft.id = p.fee_type_id
    JOIN students s ON s.id = p.student_id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c ON c.id = e.class_id
    ORDER BY u.last_name, u.first_name, p.created_at DESC
  ` as Promise<any[]>
}

// ─── Liaison élève ↔ parent ──────────────────────────────────────────────────

export async function getStudentsNotLinkedToParent(parentId: string): Promise<any[]> {
  const { db } = await getDb()
  return db.$queryRaw`
    SELECT s.id, u.first_name, u.last_name, s.student_id AS student_number,
           c.name AS class_name
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c ON c.id = e.class_id
    WHERE s.id NOT IN (
      SELECT student_id FROM parent_students WHERE parent_id = ${parentId}
    )
    ORDER BY u.last_name, u.first_name
  ` as Promise<any[]>
}

export async function linkStudentToParent(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    const parentId  = formData.get('parent_id') as string
    const studentId = formData.get('student_id') as string
    const relation  = (formData.get('relation') as string)?.trim() || null

    if (!parentId || !studentId) return { success: false, error: 'Données manquantes.' }

    await db.$executeRaw`
      INSERT INTO parent_students (parent_id, student_id, relation)
      VALUES (${parentId}, ${studentId}, ${relation})
      ON CONFLICT (parent_id, student_id) DO NOTHING
    `
    revalidatePath(`/admin/parents/${parentId}`)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function unlinkStudentFromParent(parentId: string, studentId: string): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    await db.$executeRaw`
      DELETE FROM parent_students WHERE parent_id = ${parentId} AND student_id = ${studentId}
    `
    revalidatePath(`/admin/parents/${parentId}`)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Affectation enseignant → classe + matière ───────────────────────────────

export async function assignTeacherToClass(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    const teacherId = formData.get('teacher_id') as string
    const classId   = formData.get('class_id') as string
    const subjectId = formData.get('subject_id') as string

    if (!teacherId || !classId || !subjectId)
      return { success: false, error: 'Enseignant, classe et matière requis.' }

    await db.$executeRaw`
      INSERT INTO teacher_subject_classes (teacher_id, class_id, subject_id)
      VALUES (${teacherId}, ${classId}, ${subjectId})
      ON CONFLICT (teacher_id, class_id, subject_id) DO NOTHING
    `
    revalidatePath(`/admin/teachers/${teacherId}`)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function removeTeacherAssignment(tscId: string, teacherId: string): Promise<ActionResult> {
  try {
    const { db } = await getDb()
    await db.$executeRaw`
      DELETE FROM teacher_subject_classes WHERE id = ${tscId}
    `
    revalidatePath(`/admin/teachers/${teacherId}`)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Import Excel Élèves ────────────────────────────────────────────────────────

interface ImportRow {
  prenom: string
  nom: string
  email: string
  date_naissance?: string
  genre?: string
  classe_id?: string
}

interface ImportResult {
  created: number
  errors: { row: number; reason: string }[]
  passwords: { email: string; tempPassword: string }[]
}

const MAX_IMPORT_ROWS = 1000

/**
 * Import en masse d'élèves. `rows` provient d'un fichier Excel (.xlsx/.xls)
 * ou CSV parsé côté client (voir lib/excel/parse.ts) — chaque ligne est déjà
 * un objet { en-tête_normalisé: valeur }.
 */
export async function importStudents(rows: Record<string, string>[]): Promise<ActionResult<ImportResult>> {
  try {
    const session = await requireRole('ADMIN')

    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, error: 'Fichier vide ou illisible.' }
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return { success: false, error: `Trop de lignes (${rows.length}) — maximum ${MAX_IMPORT_ROWS} élèves par import.` }
    }

    const headers = Object.keys(rows[0])
    const requiredCols = ['prenom', 'nom', 'email']
    for (const col of requiredCols) {
      if (!headers.includes(col)) {
        return { success: false, error: `Colonne obligatoire manquante : "${col}". En-têtes trouvés : ${headers.join(', ')}` }
      }
    }

    const result: ImportResult = { created: 0, errors: [], passwords: [] }
    const dbClient = getTenantPrisma(session.user.schemaName) as any

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2 // +1 pour l'en-tête, +1 pour l'index 0-based

      const firstName = (row.prenom ?? '').trim()
      const lastName  = (row.nom ?? '').trim()
      const email     = (row.email ?? '').trim()

      if (!firstName || !lastName || !email) {
        result.errors.push({ row: rowNum, reason: 'Prénom, nom ou email manquant.' })
        continue
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        result.errors.push({ row: rowNum, reason: `Email invalide : ${email}` })
        continue
      }

      const dateOfBirth = (row.date_naissance ?? '').trim() || null
      const gender      = (row.genre ?? '').trim() || null
      const classId     = (row.classe_id ?? '').trim() || null
      const studentNumber = `EL-${Date.now().toString().slice(-6)}-${i}`
      const tempPassword  = nanoid(10)
      const passwordHash  = await hash(tempPassword, 10)

      try {
        // Vérifier si l'email existe déjà
        const existing = await dbClient.$queryRaw`
          SELECT id FROM users WHERE email = ${email} LIMIT 1
        ` as { id: string }[]
        if (existing[0]) {
          result.errors.push({ row: rowNum, reason: `Email déjà utilisé : ${email}` })
          continue
        }

        await dbClient.$executeRaw`
          INSERT INTO users (email, password_hash, first_name, last_name, role)
          VALUES (${email}, ${passwordHash}, ${firstName}, ${lastName}, 'STUDENT')
        `
        const user = await dbClient.$queryRaw`
          SELECT id FROM users WHERE email = ${email} LIMIT 1
        ` as { id: string }[]

        if (!user[0]) {
          result.errors.push({ row: rowNum, reason: 'Erreur lors de la création de l\'utilisateur.' })
          continue
        }

        await dbClient.$executeRaw`
          INSERT INTO students (user_id, student_id, date_of_birth, gender)
          VALUES (${user[0].id}, ${studentNumber}, ${toDate(dateOfBirth)}, ${gender})
        `

        if (classId) {
          const student = await dbClient.$queryRaw`
            SELECT id FROM students WHERE user_id = ${user[0].id} LIMIT 1
          ` as { id: string }[]
          const year = await dbClient.$queryRaw`
            SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1
          ` as { id: string }[]

          if (student[0] && year[0]) {
            await dbClient.$executeRaw`
              INSERT INTO enrollments (student_id, class_id, academic_year_id)
              VALUES (${student[0].id}, ${classId}, ${year[0].id})
              ON CONFLICT (student_id, academic_year_id) DO NOTHING
            `
          }
        }

        result.created++
        result.passwords.push({ email, tempPassword })
      } catch (e: any) {
        result.errors.push({ row: rowNum, reason: dbError(e) })
      }
    }

    revalidatePath('/admin/students')
    return { success: true, data: result }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur lors de l\'import.' }
  }
}
