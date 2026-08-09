'use server'

import { getTenantPrisma } from '@/lib/db/tenant'
import { withRetry } from '@/lib/db/retry'
import { requireRole } from '@/lib/auth/rbac'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types'
import { initiateSchoolPayment, isSchoolPaymentConfigured } from '@/lib/payments/provider'
import { initiatePayment as initiateGlobalPayment } from '@/lib/payments/geniuspay'
import { generateStudentQrCode } from '@/lib/qrcode'
import { PARENT_FEE_PER_CHILD } from '@/lib/parent-fee'
import { resolveFeatureAccess, type ParentFeatureKey } from '@/lib/parent-feature-flags'
import { getFeatureOverrides } from '@/lib/parent-feature-flags.server'

async function getParentDb() {
  const session = await requireRole('PARENT')
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

export async function getParentChildren() {
  const { db, session } = await getParentDb()
  return db.$queryRaw`
    SELECT s.id, s.student_id AS student_number,
           u.first_name, u.last_name, u.email, u.avatar_url,
           ps.relation,
           c.name AS class_name, l.name AS level_name,
           ay.name AS year_name
    FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    JOIN students s ON s.id = ps.student_id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN enrollments e  ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c      ON c.id = e.class_id
    LEFT JOIN levels l       ON l.id = c.level_id
    LEFT JOIN academic_years ay ON ay.is_current = TRUE
    WHERE p.user_id = ${session.user.id}
    ORDER BY u.last_name, u.first_name
  ` as Promise<any[]>
}

export async function getChildDetails(studentId: string) {
  const { db, session } = await getParentDb()

  return withRetry(async () => {
  // Vérifier que l'élève appartient bien à ce parent
  const check: any[] = await db.$queryRaw`
    SELECT ps.id FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE p.user_id = ${session.user.id} AND ps.student_id = ${studentId}
    LIMIT 1
  `
  if (!check[0]) return null

  const [profile, terms, payments, attendance] = await Promise.all([
    db.$queryRaw`
      SELECT s.id, s.student_id AS student_number, s.date_of_birth, s.gender,
             u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
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
      SELECT t.id, t.name, t.term_order FROM terms t
      JOIN academic_years ay ON ay.id = t.academic_year_id AND ay.is_current = TRUE
      ORDER BY t.term_order
    ` as Promise<any[]>,

    db.$queryRaw`
      SELECT p.id, p.amount, p.status, p.paid_at, p.due_date, ft.name AS fee_name
      FROM payments p
      JOIN fee_types ft ON ft.id = p.fee_type_id
      WHERE p.student_id = ${studentId}
      ORDER BY p.created_at DESC LIMIT 20
    ` as Promise<any[]>,

    db.$queryRaw`
      SELECT t.name AS term_name, t.term_order,
             COUNT(a.id)::int AS total,
             COUNT(CASE WHEN a.status='ABSENT' THEN 1 END)::int AS absent,
             COUNT(CASE WHEN a.status='LATE'   THEN 1 END)::int AS late,
             COUNT(CASE WHEN a.status='ABSENT' AND a.justified=FALSE THEN 1 END)::int AS unjustified
      FROM terms t
      JOIN academic_years ay ON ay.id = t.academic_year_id AND ay.is_current = TRUE
      LEFT JOIN attendances a ON a.term_id = t.id AND a.student_id = ${studentId}
      GROUP BY t.id, t.name, t.term_order
      ORDER BY t.term_order
    ` as Promise<any[]>,
  ])

  // Moyennes générales par trimestre
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
    JOIN subjects s ON s.id = g.subject_id
    LEFT JOIN enrollments e ON e.student_id = ${studentId} AND e.status = 'ACTIVE'
    LEFT JOIN level_subjects ls ON ls.subject_id = g.subject_id AND ls.level_id = (
      SELECT c.level_id FROM classes c WHERE c.id = e.class_id LIMIT 1
    )
    WHERE g.student_id = ${studentId}
    GROUP BY g.term_id, g.subject_id, t.name, t.term_order, ls.coefficient
  `

  // Déduplique les moyennes par trimestre (prend la première valeur par term_id)
  const avgByTerm: Record<string, number | null> = {}
  for (const a of averages) {
    if (!avgByTerm[a.term_id]) {
      avgByTerm[a.term_id] = a.general_average ? parseFloat(a.general_average) : null
    }
  }

  return {
    profile: profile[0],
    terms: terms.map((t: any) => ({ ...t, average: avgByTerm[t.id] ?? null })),
    payments,
    attendance,
  }
  })
}

export async function getChildAbsencesForJustification(studentId: string) {
  const { db, session } = await getParentDb()

  // Vérifier que l'élève appartient au parent
  const check: any[] = await db.$queryRaw`
    SELECT ps.id FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE p.user_id = ${session.user.id} AND ps.student_id = ${studentId}
    LIMIT 1
  `
  if (!check[0]) return []

  return db.$queryRaw`
    SELECT a.id, a.date, a.justification
    FROM attendances a
    WHERE a.student_id = ${studentId}
      AND a.status = 'ABSENT'
      AND a.justified = FALSE
    ORDER BY a.date DESC
  ` as Promise<any[]>
}

export async function submitJustification(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const { db, session } = await getParentDb()

    const attendanceId  = formData.get('attendance_id') as string
    const justification = formData.get('justification') as string

    if (!attendanceId || !justification) {
      return { success: false, error: 'Identifiant de présence et justification requis.' }
    }

    // Fonctionnalité verrouillée tant que l'abonnement MyClassLink n'est pas réglé
    const subscription = await getParentSubscriptionStatus()
    if (!subscription.success || !subscription.data?.paid) {
      return { success: false, error: 'Un abonnement MyClassLink actif est requis pour justifier une absence.' }
    }

    // Récupérer l'attendance pour vérifier la parenté
    const attendance: any[] = await db.$queryRaw`
      SELECT a.student_id FROM attendances a WHERE a.id = ${attendanceId} LIMIT 1
    `
    if (!attendance[0]) return { success: false, error: 'Absence introuvable.' }

    const studentId = attendance[0].student_id

    // Vérifier que l'élève appartient au parent
    const check: any[] = await db.$queryRaw`
      SELECT ps.id FROM parent_students ps
      JOIN parents p ON p.id = ps.parent_id
      WHERE p.user_id = ${session.user.id} AND ps.student_id = ${studentId}
      LIMIT 1
    `
    if (!check[0]) return { success: false, error: 'Accès non autorisé.' }

    await db.$executeRaw`
      UPDATE attendances
      SET justified = TRUE, justification = ${justification}
      WHERE id = ${attendanceId}
    `
    revalidatePath('/parent/absences')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

// ─── Helper : vérifier que l'élève appartient au parent ──────────────────────
async function assertOwnership(db: any, userId: string, studentId: string) {
  const check: any[] = await db.$queryRaw`
    SELECT ps.id FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE p.user_id = ${userId} AND ps.student_id = ${studentId}
    LIMIT 1
  `
  return !!check[0]
}

// ─── Notes par matière et par trimestre ──────────────────────────────────────
export async function getChildGrades(studentId: string) {
  const { db, session } = await getParentDb()
  if (!(await assertOwnership(db, session.user.id, studentId))) return null

  const [terms, rows] = await Promise.all([
    db.$queryRaw`
      SELECT t.id, t.name, t.term_order
      FROM terms t
      JOIN academic_years ay ON ay.id = t.academic_year_id AND ay.is_current = TRUE
      ORDER BY t.term_order
    ` as Promise<any[]>,

    db.$queryRaw`
      SELECT
        g.term_id,
        sub.id   AS subject_id,
        sub.name AS subject_name,
        COALESCE(ls.coefficient, 1)::float        AS coefficient,
        ROUND(SUM(g.value * g.coefficient)::numeric
              / NULLIF(SUM(g.coefficient), 0), 2)  AS subject_avg,
        COUNT(g.id)::int                           AS grade_count,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', g.id, 'value', g.value,
            'coefficient', g.coefficient,
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
      LEFT JOIN enrollments e ON e.student_id = ${studentId} AND e.status = 'ACTIVE'
      LEFT JOIN level_subjects ls
        ON ls.subject_id = g.subject_id
        AND ls.level_id = (
          SELECT c.level_id FROM classes c WHERE c.id = e.class_id LIMIT 1
        )
      WHERE g.student_id = ${studentId}
      GROUP BY g.term_id, sub.id, sub.name, ls.coefficient
      ORDER BY sub.name
    ` as Promise<any[]>,
  ])

  await ensureGradeDisputesTable(db)
  const disputes: any[] = await db.$queryRaw`
    SELECT gd.grade_id, gd.id, gd.status FROM grade_disputes gd
    JOIN grades g ON g.id = gd.grade_id
    WHERE g.student_id = ${studentId}
  `
  const disputeByGrade = new Map(disputes.map((d: any) => [d.grade_id, { id: d.id, status: d.status }]))
  const enrichedRows = (rows as any[]).map(row => ({
    ...row,
    grades: (row.grades as any[]).map(g => ({ ...g, dispute: disputeByGrade.get(g.id) ?? null })),
  }))

  return { terms: terms as any[], rows: enrichedRows }
}

// ─── Devoirs et exercices ─────────────────────────────────────────────────────
export async function getChildAssignments(studentId: string) {
  const { db, session } = await getParentDb()
  if (!(await assertOwnership(db, session.user.id, studentId))) return null

  return db.$queryRaw`
    SELECT
      a.id, a.title, a.description, a.due_date, a.max_score,
      sub.name AS subject_name,
      sm.id          AS submission_id,
      sm.submitted_at,
      sm.score,
      sm.feedback,
      sm.status      AS submission_status
    FROM assignments a
    JOIN subjects sub ON sub.id = a.subject_id
    LEFT JOIN submissions sm
      ON sm.assignment_id = a.id AND sm.student_id = ${studentId}
    WHERE a.class_id = (
      SELECT e.class_id FROM enrollments e
      WHERE e.student_id = ${studentId} AND e.status = 'ACTIVE'
      LIMIT 1
    )
    ORDER BY a.due_date DESC NULLS LAST
    LIMIT 60
  ` as Promise<any[]>
}

// ─── Emploi du temps ──────────────────────────────────────────────────────────
export async function getChildSchedule(studentId: string) {
  const { db, session } = await getParentDb()
  if (!(await assertOwnership(db, session.user.id, studentId))) return null

  return db.$queryRaw`
    SELECT
      sc.id, sc.day_of_week, sc.start_time, sc.end_time, sc.room,
      sub.name AS subject_name,
      u.first_name || ' ' || u.last_name AS teacher_name
    FROM schedules sc
    JOIN teacher_subject_classes tsc ON tsc.id = sc.teacher_subject_class_id
    JOIN subjects sub ON sub.id = tsc.subject_id
    JOIN teachers te ON te.id = tsc.teacher_id
    JOIN users u ON u.id = te.user_id
    WHERE sc.class_id = (
      SELECT e.class_id FROM enrollments e
      WHERE e.student_id = ${studentId} AND e.status = 'ACTIVE'
      LIMIT 1
    )
    ORDER BY sc.day_of_week, sc.start_time
  ` as Promise<any[]>
}

// ─── Historique sanctions ─────────────────────────────────────────────────────
export async function getChildSanctions(studentId: string): Promise<ActionResult<any[]>> {
  try {
    const { db, session } = await getParentDb()
    if (!(await assertOwnership(db, session.user.id, studentId)))
      return { success: false, error: 'Accès non autorisé.' }

    const rows: any[] = await db.$queryRaw`
      SELECT s.id, s.type, s.reason, s.description, s.date, s.duration, s.created_at,
             u.first_name AS issuer_first, u.last_name AS issuer_last
      FROM sanctions s
      LEFT JOIN users u ON u.id = s.issued_by
      WHERE s.student_id = ${studentId}
      ORDER BY s.date DESC
    `
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

// ─── Agenda scolaire ─────────────────────────────────────────────────────────
export async function getChildAgenda(studentId: string, month?: string): Promise<ActionResult<any[]>> {
  try {
    const { db, session } = await getParentDb()
    if (!(await assertOwnership(db, session.user.id, studentId)))
      return { success: false, error: 'Accès non autorisé.' }

    const rows: any[] = await db.$queryRaw`
      SELECT DISTINCT ae.id, ae.title, ae.description, ae.event_type,
             ae.start_date, ae.end_date, ae.start_time, ae.end_time, ae.all_classes
      FROM agenda_events ae
      JOIN enrollments e ON (ae.class_id = e.class_id OR ae.all_classes = TRUE)
      WHERE e.student_id = ${studentId} AND e.status = 'ACTIVE'
        AND (${month ?? null}::text IS NULL
             OR to_char(ae.start_date, 'YYYY-MM') = ${month ?? null})
      ORDER BY ae.start_date, ae.start_time NULLS LAST
    `
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

// ─── Résumé hebdomadaire ──────────────────────────────────────────────────────
export async function getChildWeeklySummary(studentId: string): Promise<ActionResult<any>> {
  try {
    const { db, session } = await getParentDb()
    if (!(await assertOwnership(db, session.user.id, studentId)))
      return { success: false, error: 'Accès non autorisé.' }

    const [recentGrades, weekAttendance, pendingCount, recentSanctions] = await Promise.all([
      db.$queryRaw`
        SELECT g.value, g.max_value, g.type, g.published_at, sub.name AS subject_name
        FROM grades g
        JOIN subjects sub ON sub.id = g.subject_id
        WHERE g.student_id = ${studentId} AND g.published_at IS NOT NULL
        ORDER BY g.published_at DESC LIMIT 5
      ` as Promise<any[]>,

      db.$queryRaw`
        SELECT
          COUNT(CASE WHEN status='PRESENT' THEN 1 END)::int AS present,
          COUNT(CASE WHEN status='ABSENT'  THEN 1 END)::int AS absent,
          COUNT(CASE WHEN status='LATE'    THEN 1 END)::int AS late
        FROM attendances
        WHERE student_id = ${studentId}
          AND date >= date_trunc('week', CURRENT_DATE)
          AND date <  date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
      ` as Promise<any[]>,

      db.$queryRaw`
        SELECT COUNT(a.id)::int AS cnt
        FROM assignments a
        LEFT JOIN submissions sm ON sm.assignment_id = a.id AND sm.student_id = ${studentId}
        WHERE a.class_id = (
          SELECT e.class_id FROM enrollments e
          WHERE e.student_id = ${studentId} AND e.status = 'ACTIVE' LIMIT 1
        )
        AND a.due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        AND sm.id IS NULL
      ` as Promise<any[]>,

      db.$queryRaw`
        SELECT s.type, s.reason, s.date
        FROM sanctions s
        WHERE s.student_id = ${studentId}
        ORDER BY s.date DESC LIMIT 2
      ` as Promise<any[]>,
    ])

    return {
      success: true,
      data: {
        recentGrades,
        weekAttendance: weekAttendance[0] ?? { present: 0, absent: 0, late: 0 },
        pendingAssignments: (pendingCount[0] as any)?.cnt ?? 0,
        recentSanctions,
      },
    }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

/** L'école a-t-elle activé un fournisseur de paiement ? Sinon, le bouton de paiement reste grisé. */
export async function getPaymentAvailability(): Promise<boolean> {
  const { session } = await getParentDb()
  return isSchoolPaymentConfigured(session.user.schemaName)
}

export async function initiateOnlinePayment(
  paymentId: string,
  studentId: string
): Promise<ActionResult<{ paymentUrl: string }>> {
  try {
    const { db, session } = await getParentDb()

    // Vérifier que l'élève appartient bien à ce parent
    const check: any[] = await db.$queryRaw`
      SELECT ps.id FROM parent_students ps
      JOIN parents p ON p.id = ps.parent_id
      WHERE p.user_id = ${session.user.id} AND ps.student_id = ${studentId}
      LIMIT 1
    `
    if (!check[0]) return { success: false, error: 'Accès non autorisé.' }

    // Récupérer le paiement
    const rows: any[] = await db.$queryRaw`
      SELECT p.id, p.amount, p.status, p.provider_ref,
             ft.name AS fee_name, p.student_id
      FROM payments p
      JOIN fee_types ft ON ft.id = p.fee_type_id
      WHERE p.id = ${paymentId} AND p.student_id = ${studentId}
      LIMIT 1
    `
    const payment = rows[0]
    if (!payment) return { success: false, error: 'Paiement introuvable.' }
    if (payment.status !== 'PENDING') return { success: false, error: 'Ce paiement n\'est pas en attente.' }
    if (payment.provider_ref) return { success: false, error: 'Une transaction est déjà en cours pour ce paiement.' }

    // Récupérer le profil de l'utilisateur parent
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const schemaName = session.user.schemaName

    const init = await initiateSchoolPayment(schemaName, {
      amount: Number(payment.amount),
      description: payment.fee_name,
      customerId: session.user.id,
      customerName: session.user.name ?? session.user.email ?? '',
      customerEmail: session.user.email ?? '',
      returnUrl: `${baseUrl}/parent/payment/return?paymentId=${paymentId}&studentId=${studentId}`,
      baseUrl,
      metadata: { paymentId, schemaName, studentId },
    })

    // Stocker le transactionId et le PSP réellement utilisé comme provider_ref
    await db.$executeRaw`
      UPDATE payments
      SET provider = ${init.provider}, provider_ref = ${init.transactionId}
      WHERE id = ${paymentId}
    `

    return { success: true, data: { paymentUrl: init.paymentUrl } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur lors de l\'initiation du paiement.' }
  }
}

// ─── Frais scolaires : tous les paiements de tous les enfants du parent ────────
export async function getParentPayments() {
  const { db, session } = await getParentDb()
  return withRetry(() => db.$queryRaw`
    SELECT p.id, p.amount, p.status, p.provider, p.provider_ref, p.receipt,
           p.paid_at, p.due_date, p.created_at,
           ft.name AS fee_name,
           s.id    AS student_id,
           u.first_name, u.last_name, u.avatar_url,
           c.name  AS class_name
    FROM payments p
    JOIN fee_types ft       ON ft.id = p.fee_type_id
    JOIN students s         ON s.id = p.student_id
    JOIN users u            ON u.id = s.user_id
    JOIN parent_students ps ON ps.student_id = s.id
    JOIN parents pa         ON pa.id = ps.parent_id
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c     ON c.id = e.class_id
    WHERE pa.user_id = ${session.user.id}
    ORDER BY
      CASE WHEN p.status = 'PENDING' THEN 0 ELSE 1 END,
      p.due_date ASC NULLS LAST,
      p.created_at DESC
  ` as Promise<any[]>)
}

// ─── Carnet de liaison numérique ───────────────────────────────────────────────

export async function getChildConvocations(studentId: string): Promise<ActionResult<any[]>> {
  try {
    const { db, session } = await getParentDb()
    if (!(await assertOwnership(db, session.user.id, studentId)))
      return { success: false, error: 'Accès non autorisé.' }

    const rows: any[] = await db.$queryRaw`
      SELECT c.id, c.type, c.reason, c.scheduled_at, c.location, c.status, c.notes, c.created_at,
             u.first_name AS issuer_first, u.last_name AS issuer_last
      FROM convocations c
      LEFT JOIN users u ON u.id = c.issued_by
      WHERE c.student_id = ${studentId}
      ORDER BY c.scheduled_at DESC
    `
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

/**
 * Carnet de liaison : fusionne convocations, sanctions et autorisations de sortie
 * dans un flux chronologique unique. Les sorties en attente sont signalées comme
 * nécessitant une signature (voir `authorizeTrip`).
 */
export async function getLiaisonFeed(studentId: string): Promise<ActionResult<any[]>> {
  try {
    const { db, session } = await getParentDb()
    if (!(await assertOwnership(db, session.user.id, studentId)))
      return { success: false, error: 'Accès non autorisé.' }

    const [convocations, sanctions, trips] = await Promise.all([
      db.$queryRaw`
        SELECT c.id, 'CONVOCATION' AS kind, c.type AS subtype, c.reason AS title,
               c.scheduled_at AS event_date, c.location, c.status, c.created_at
        FROM convocations c
        WHERE c.student_id = ${studentId}
      `,
      db.$queryRaw`
        SELECT s.id, 'SANCTION' AS kind, s.type AS subtype, s.reason AS title,
               s.date AS event_date, NULL AS location, NULL AS status, s.created_at
        FROM sanctions s
        WHERE s.student_id = ${studentId}
      `,
      db.$queryRaw`
        SELECT ta.id, 'SORTIE' AS kind, ft.title AS subtype, ft.title AS title,
               ft.trip_date AS event_date, ft.destination AS location, ta.status, ta.created_at,
               ft.id AS trip_id, ta.signature_data IS NOT NULL AS signed
        FROM trip_authorizations ta
        JOIN field_trips ft ON ft.id = ta.trip_id
        WHERE ta.student_id = ${studentId}
      `,
    ])

    const feed = [...convocations, ...sanctions, ...trips]
      .sort((a: any, b: any) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())

    return { success: true, data: feed }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

/** Carte d'élève numérique (QR code de vérification d'identité). */
export async function getChildIdCard(studentId: string): Promise<ActionResult<{ studentNumber: string; qrCode: string; firstName: string; lastName: string; className: string | null }>> {
  try {
    const { db, session } = await getParentDb()
    if (!(await assertOwnership(db, session.user.id, studentId)))
      return { success: false, error: 'Accès non autorisé.' }

    const rows: any[] = await db.$queryRaw`
      SELECT s.student_id AS student_number, u.first_name, u.last_name, c.name AS class_name
      FROM students s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
      LEFT JOIN classes c     ON c.id = e.class_id
      WHERE s.id = ${studentId}
      LIMIT 1
    `
    const row = rows[0]
    if (!row) return { success: false, error: 'Élève introuvable.' }

    const qrCode = await generateStudentQrCode(row.student_number)
    return {
      success: true,
      data: { studentNumber: row.student_number, qrCode, firstName: row.first_name, lastName: row.last_name, className: row.class_name },
    }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

// ─── Abonnement parent MyClassLink (2000 FCFA/an/enfant) ───────────────────────

export interface ParentSubscriptionStatus {
  paid: boolean
  childrenCount: number
  amountDue: number
  academicYearName: string | null
}

/** Nombre d'enfants actifs (inscription en cours) rattachés à ce parent. */
async function getActiveChildrenCount(db: any, parentUserId: string): Promise<{ count: number; academicYearId: string | null; academicYearName: string | null }> {
  const rows: any[] = await db.$queryRaw`
    SELECT COUNT(DISTINCT s.id)::int AS count, ay.id AS academic_year_id, ay.name AS academic_year_name
    FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    JOIN students s ON s.id = ps.student_id
    JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    JOIN classes c ON c.id = e.class_id
    JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current = TRUE
    WHERE p.user_id = ${parentUserId}
    GROUP BY ay.id, ay.name
  `
  const row = rows[0]
  return {
    count: row?.count ?? 0,
    academicYearId: row?.academic_year_id ?? null,
    academicYearName: row?.academic_year_name ?? null,
  }
}

/** Statut d'abonnement du parent connecté pour l'année scolaire en cours. */
export async function getParentSubscriptionStatus(): Promise<ActionResult<ParentSubscriptionStatus>> {
  try {
    const { db, session } = await getParentDb()
    const { count, academicYearId, academicYearName } = await getActiveChildrenCount(db, session.user.id)

    if (count === 0 || !academicYearId) {
      return { success: true, data: { paid: true, childrenCount: 0, amountDue: 0, academicYearName } }
    }

    const parentRows: any[] = await db.$queryRaw`SELECT id FROM parents WHERE user_id = ${session.user.id} LIMIT 1`
    const parentId = parentRows[0]?.id
    if (!parentId) return { success: false, error: 'Profil parent introuvable.' }

    const subRows: any[] = await db.$queryRaw`
      SELECT status FROM parent_subscriptions
      WHERE parent_id = ${parentId} AND academic_year_id = ${academicYearId}
      LIMIT 1
    `
    const paid = subRows[0]?.status === 'SUCCESS'

    return {
      success: true,
      data: { paid, childrenCount: count, amountDue: count * PARENT_FEE_PER_CHILD, academicYearName },
    }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

/**
 * Accès à une fonctionnalité de l'espace parent, combinant le paiement de
 * l'abonnement et un éventuel override Super Admin (qui prime toujours) —
 * utilisé par <ParentPaywall featureKey="...">.
 */
export async function checkFeatureAccess(
  featureKey: ParentFeatureKey
): Promise<ActionResult<{ allowed: boolean; paid: boolean; childrenCount: number; amountDue: number }>> {
  try {
    const [status, overrides] = await Promise.all([
      getParentSubscriptionStatus(),
      getFeatureOverrides(),
    ])
    if (!status.success) {
      return { success: false, error: status.error }
    }
    if (!status.data) {
      return { success: false, error: 'Erreur' }
    }
    const allowed = resolveFeatureAccess(status.data.paid, overrides[featureKey] ?? null)
    return {
      success: true,
      data: {
        allowed,
        paid: status.data.paid,
        childrenCount: status.data.childrenCount,
        amountDue: status.data.amountDue,
      },
    }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

/**
 * Initie le paiement de l'abonnement MyClassLink du parent (compte global —
 * ceci finance la plateforme, pas l'école : ne passe jamais par le PSP de
 * l'établissement).
 */
export async function initiateParentSubscriptionPayment(): Promise<ActionResult<{ paymentUrl: string }>> {
  try {
    const { db, session } = await getParentDb()
    const { count, academicYearId } = await getActiveChildrenCount(db, session.user.id)

    if (count === 0 || !academicYearId) {
      return { success: false, error: 'Aucun enfant actif rattaché à votre compte.' }
    }

    const parentRows: any[] = await db.$queryRaw`SELECT id FROM parents WHERE user_id = ${session.user.id} LIMIT 1`
    const parentId = parentRows[0]?.id
    if (!parentId) return { success: false, error: 'Profil parent introuvable.' }

    const amount = count * PARENT_FEE_PER_CHILD

    // Recrée/rafraîchit une ligne PENDING (le nombre d'enfants peut avoir changé)
    const subRows: any[] = await db.$queryRaw`
      INSERT INTO parent_subscriptions (parent_id, academic_year_id, children_count, amount, status)
      VALUES (${parentId}, ${academicYearId}, ${count}, ${amount}, 'PENDING')
      ON CONFLICT (parent_id, academic_year_id) DO UPDATE
        SET children_count = EXCLUDED.children_count,
            amount         = EXCLUDED.amount,
            status         = CASE WHEN parent_subscriptions.status = 'SUCCESS' THEN 'SUCCESS' ELSE 'PENDING' END,
            updated_at     = NOW()
      RETURNING id, status
    `
    const subscription = subRows[0]
    if (subscription.status === 'SUCCESS') {
      return { success: false, error: 'Votre abonnement est déjà réglé pour cette année scolaire.' }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const schemaName = session.user.schemaName

    const init = await initiateGlobalPayment({
      amount,
      description: `Abonnement MyClassLink ${count} enfant${count > 1 ? 's' : ''} — ${session.user.name ?? session.user.email}`,
      customerId: session.user.id,
      customerName: session.user.name ?? session.user.email ?? '',
      customerEmail: session.user.email ?? '',
      returnUrl: `${baseUrl}/parent/subscription/return`,
      notifyUrl: `${baseUrl}/api/webhooks/geniuspay`,
      metadata: { kind: 'parent_subscription', schemaName, parentSubscriptionId: subscription.id },
    })

    await db.$executeRaw`
      UPDATE parent_subscriptions
      SET provider = 'GENIUSPAY', provider_ref = ${init.transactionId}, updated_at = NOW()
      WHERE id = ${subscription.id}
    `

    return { success: true, data: { paymentUrl: init.paymentUrl } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur lors de l\'initiation du paiement.' }
  }
}