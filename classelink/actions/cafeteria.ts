'use server'

import { Prisma } from '@prisma/client'
import { getTenantPrisma } from '@/lib/db/tenant'
import { requireRole } from '@/lib/auth/rbac'
import { revalidatePath } from 'next/cache'
import { toActionError } from '@/lib/errors'
import { initiateSchoolPayment } from '@/lib/payments/provider'
import type { ActionResult } from '@/types'

const CAFETERIA_MEAL_TYPES = ['LUNCH', 'SNACK', 'LUNCH_SNACK'] as const
const CAFETERIA_PRICE_COLUMN: Record<string, string> = {
  LUNCH: 'cafeteria_price_lunch',
  SNACK: 'cafeteria_price_snack',
  LUNCH_SNACK: 'cafeteria_price_lunch_snack',
}
const CAFETERIA_MEAL_LABEL: Record<string, string> = {
  LUNCH: 'Déjeuner', SNACK: 'Goûter', LUNCH_SNACK: 'Déjeuner + Goûter',
}

async function getDb() {
  const session = await requireRole('ADMIN', 'CENSOR')
  const db = getTenantPrisma(session.user.schemaName) as any
  return { db, user: session.user }
}

async function getAdminDb() {
  const session = await requireRole('ADMIN')
  const db = getTenantPrisma(session.user.schemaName) as any
  return { db, user: session.user }
}

async function getAnyRoleDb() {
  const session = await requireRole('ADMIN', 'CENSOR', 'TEACHER', 'STUDENT', 'PARENT')
  const db = getTenantPrisma(session.user.schemaName) as any
  return { db, user: session.user }
}

// Colonnes ajoutées après le premier déploiement de cafeteria_subscriptions
// (paiement en ligne parent + updated_at) — auto-création idempotente pour
// les écoles pas encore resynchronisées (même pattern que
// actions/transport.ts::ensureBusSubscriptionsTable).
async function ensureCafeteriaSubscriptionColumns(db: any) {
  await db.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions DROP CONSTRAINT IF EXISTS cafeteria_subscriptions_status_check`)
  await db.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions ADD CONSTRAINT cafeteria_subscriptions_status_check CHECK (status IN ('PENDING_PAYMENT','ACTIVE','SUSPENDED','CANCELLED'))`)
  await db.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'MANUAL' CHECK (payment_status IN ('MANUAL','PENDING','PAID','FAILED'))`)
  await db.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions ADD COLUMN IF NOT EXISTS provider TEXT`)
  await db.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions ADD COLUMN IF NOT EXISTS provider_ref TEXT`)
  await db.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`)
  await db.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`)
}

// ─── Menus de la semaine ──────────────────────────────────────────────────────
export async function getCafeteriaMenus(weekStart?: string): Promise<any[]> {
  const { db } = await getAnyRoleDb()

  const weekFilter = weekStart
    ? Prisma.sql`${weekStart}::date`
    : Prisma.sql`date_trunc('week', NOW())::date`

  return db.$queryRaw`
    SELECT
      cm.id, cm.week_start, cm.day_of_week, cm.meal_type,
      cm.description, cm.price, cm.created_at
    FROM cafeteria_menus cm
    WHERE cm.week_start = ${weekFilter}
    ORDER BY cm.day_of_week, cm.meal_type
  `
}

// ─── Créer ou mettre à jour un menu ──────────────────────────────────────────
export async function upsertMenu(
  prevState: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const { db } = await getAdminDb()

  const weekStart  = formData.get('weekStart')  as string
  const dayOfWeek  = parseInt(formData.get('dayOfWeek') as string, 10)
  const mealType   = formData.get('mealType')   as string
  const description = formData.get('description') as string
  const price      = parseFloat(formData.get('price') as string ?? '0')

  if (!weekStart || isNaN(dayOfWeek) || !mealType || !description) {
    return { success: false, error: 'Tous les champs obligatoires doivent être renseignés.' }
  }

  try {
    const rows: any[] = await db.$queryRaw`
      INSERT INTO cafeteria_menus (week_start, day_of_week, meal_type, description, price)
      VALUES (${new Date(weekStart)}, ${dayOfWeek}, ${mealType}, ${description}, ${price})
      ON CONFLICT (week_start, day_of_week, meal_type) DO UPDATE
        SET description = EXCLUDED.description,
            price       = EXCLUDED.price,
            updated_at  = NOW()
      RETURNING id
    `
    revalidatePath('/admin/cafeteria')
    return { success: true, data: { id: rows[0].id } }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── Supprimer un menu ────────────────────────────────────────────────────────
export async function deleteMenu(menuId: string): Promise<ActionResult> {
  const { db } = await getAdminDb()

  try {
    await db.$executeRaw`DELETE FROM cafeteria_menus WHERE id = ${menuId}`
    revalidatePath('/admin/cafeteria')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── Liste des souscriptions ──────────────────────────────────────────────────
export async function getCafeteriaSubscriptions(): Promise<any[]> {
  const { db } = await getAdminDb()
  await ensureCafeteriaSubscriptionColumns(db)

  const rows: any[] = await db.$queryRaw`
    SELECT
      cs.id, cs.meal_type, cs.start_date, cs.status, cs.amount_paid,
      s.id          AS student_id,
      u.first_name, u.last_name,
      c.name        AS class_name,
      ay.name       AS academic_year_name
    FROM cafeteria_subscriptions cs
    JOIN students s ON s.id = cs.student_id
    JOIN users u    ON u.id = s.user_id
    LEFT JOIN enrollments e   ON e.student_id = s.id AND e.status = 'ACTIVE'
    LEFT JOIN classes c       ON c.id = e.class_id
    JOIN academic_years ay    ON ay.id = cs.academic_year_id
    ORDER BY u.last_name, u.first_name, cs.start_date DESC
  `
  return rows
}

// ─── Inscrire un élève à la cantine ──────────────────────────────────────────
export async function subscribeStudent(
  studentId: string,
  mealType: string,
  startDate: string,
  amount: number
): Promise<ActionResult<{ id: string }>> {
  const { db } = await getAdminDb()
  await ensureCafeteriaSubscriptionColumns(db)

  try {
    // Vérifie que l'élève existe (évite une violation de clé étrangère)
    const studentRows: any[] = await db.$queryRaw`
      SELECT id FROM students WHERE id = ${studentId} LIMIT 1
    `
    if (!studentRows[0]) return { success: false, error: 'Élève introuvable.' }

    const yearRows: any[] = await db.$queryRaw`
      SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1
    `
    const academicYearId = yearRows[0]?.id
    if (!academicYearId) return { success: false, error: 'Aucune année académique courante trouvée.' }

    const rows: any[] = await db.$queryRaw`
      INSERT INTO cafeteria_subscriptions
        (student_id, meal_type, start_date, amount_paid, status, academic_year_id)
      VALUES
        (${studentId}, ${mealType}, ${new Date(startDate)}, ${amount}, 'ACTIVE', ${academicYearId})
      RETURNING id
    `
    revalidatePath('/admin/cafeteria')
    return { success: true, data: { id: rows[0].id } }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── Mettre à jour le statut d'une souscription ───────────────────────────────
const VALID_SUB_STATUSES = ['ACTIVE', 'SUSPENDED', 'CANCELLED'] as const

export async function updateSubscriptionStatus(
  subId: string,
  status: string
): Promise<ActionResult> {
  if (!VALID_SUB_STATUSES.includes(status as (typeof VALID_SUB_STATUSES)[number])) {
    return { success: false, error: 'Statut invalide.' }
  }

  const { db } = await getAdminDb()
  await ensureCafeteriaSubscriptionColumns(db)

  try {
    await db.$executeRaw`
      UPDATE cafeteria_subscriptions
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${subId}
    `
    revalidatePath('/admin/cafeteria')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

/**
 * Le parent s'abonne lui-même à la cantine et paie en ligne (tarif fixe par
 * type de repas, configuré par l'admin) — même mécanisme que
 * actions/transport.ts::initiateTransportSubscriptionPayment.
 */
export async function initiateCafeteriaSubscriptionPayment(
  studentId: string,
  mealType: string
): Promise<ActionResult<{ paymentUrl: string }>> {
  if (!CAFETERIA_MEAL_TYPES.includes(mealType as (typeof CAFETERIA_MEAL_TYPES)[number])) {
    return { success: false, error: 'Type de repas invalide.' }
  }
  try {
    const session = await requireRole('PARENT')
    const db = getTenantPrisma(session.user.schemaName) as any
    await ensureCafeteriaSubscriptionColumns(db)

    const check: any[] = await db.$queryRaw`
      SELECT ps.id FROM parent_students ps
      JOIN parents p ON p.id = ps.parent_id
      WHERE p.user_id = ${session.user.id} AND ps.student_id = ${studentId}
      LIMIT 1
    `
    if (!check[0]) return { success: false, error: 'Accès non autorisé.' }

    // mealType est whitelisté ci-dessus avant d'être utilisé pour choisir la colonne.
    const priceColumn = CAFETERIA_PRICE_COLUMN[mealType]
    const settingsRows: any[] = await db.$queryRawUnsafe(
      `SELECT ${priceColumn} AS price FROM school_settings LIMIT 1`
    )
    const price = settingsRows[0]?.price
    if (price === null || price === undefined) {
      return { success: false, error: 'Le tarif de la cantine n\'a pas encore été configuré par l\'établissement.' }
    }

    const yearRows: any[] = await db.$queryRaw`SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1`
    const academicYearId = yearRows[0]?.id
    if (!academicYearId) return { success: false, error: 'Aucune année académique courante trouvée.' }

    const existing: any[] = await db.$queryRaw`
      SELECT status FROM cafeteria_subscriptions
      WHERE student_id = ${studentId} AND academic_year_id = ${academicYearId} AND meal_type = ${mealType}
      LIMIT 1
    `
    if (existing[0]?.status === 'ACTIVE') {
      return { success: false, error: 'Cet élève est déjà abonné à la cantine pour ce type de repas.' }
    }

    const rows: any[] = await db.$queryRaw`
      INSERT INTO cafeteria_subscriptions (student_id, academic_year_id, meal_type, start_date, amount_paid, status, payment_status)
      VALUES (${studentId}, ${academicYearId}, ${mealType}, CURRENT_DATE, ${price}, 'PENDING_PAYMENT', 'PENDING')
      ON CONFLICT (student_id, academic_year_id, meal_type) DO UPDATE
        SET amount_paid = EXCLUDED.amount_paid, status = 'PENDING_PAYMENT', payment_status = 'PENDING', updated_at = NOW()
      RETURNING id
    `
    const subscriptionId = rows[0].id

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const schemaName = session.user.schemaName

    const init = await initiateSchoolPayment(schemaName, {
      amount: Number(price),
      description: `Abonnement cantine — ${CAFETERIA_MEAL_LABEL[mealType]}`,
      customerId: session.user.id,
      customerName: session.user.name ?? session.user.email ?? '',
      customerEmail: session.user.email ?? '',
      returnUrl: `${baseUrl}/parent/cafeteria?paid=pending`,
      baseUrl,
      metadata: { kind: 'cafeteria_subscription', subscriptionId, schemaName, studentId },
    })

    await db.$executeRaw`
      UPDATE cafeteria_subscriptions SET provider = ${init.provider}, provider_ref = ${init.transactionId} WHERE id = ${subscriptionId}
    `

    return { success: true, data: { paymentUrl: init.paymentUrl } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur lors de l\'initiation du paiement.' }
  }
}

// ─── Cantine de l'élève connecté (STUDENT) ───────────────────────────────────
export async function getStudentCafeteria(): Promise<{ subscription: any; menus: any[] }> {
  const session = await requireRole('STUDENT')
  const db = getTenantPrisma(session.user.schemaName) as any

  const [menus, sub] = await Promise.all([
    db.$queryRaw`
      SELECT cm.id, cm.week_start, cm.day_of_week, cm.meal_type, cm.description, cm.price
      FROM cafeteria_menus cm
      WHERE cm.week_start = date_trunc('week', NOW())::date
      ORDER BY cm.day_of_week, cm.meal_type
    ` as Promise<any[]>,
    db.$queryRaw`
      SELECT cs.id, cs.meal_type, cs.start_date, cs.status, cs.amount_paid
      FROM cafeteria_subscriptions cs
      JOIN students s ON s.id = cs.student_id
      WHERE s.user_id = ${session.user.id} AND cs.status = 'ACTIVE'
      LIMIT 1
    ` as Promise<any[]>,
  ])

  return { subscription: sub[0] ?? null, menus }
}

// ─── Infos cantine d'un élève (PARENT) ───────────────────────────────────────
export async function getStudentCafeteriaInfo(
  studentId: string
): Promise<ActionResult<{ subscription: any; menus: any[]; prices: { LUNCH: number | null; SNACK: number | null; LUNCH_SNACK: number | null } }>> {
  try {
    const session = await requireRole('PARENT')
    const db = getTenantPrisma(session.user.schemaName) as any
    await ensureCafeteriaSubscriptionColumns(db)

    // Vérifier la parenté
    const check: any[] = await db.$queryRaw`
      SELECT ps.id FROM parent_students ps
      JOIN parents p ON p.id = ps.parent_id
      WHERE p.user_id = ${session.user.id} AND ps.student_id = ${studentId}
      LIMIT 1
    `
    if (!check[0]) return { success: false, error: 'Accès non autorisé.' }

    const [subscriptions, menus] = await Promise.all([
      db.$queryRaw`
        SELECT cs.id, cs.meal_type, cs.start_date, cs.status, cs.amount_paid, cs.payment_status,
               ay.name AS academic_year_name
        FROM cafeteria_subscriptions cs
        JOIN academic_years ay ON ay.id = cs.academic_year_id
        WHERE cs.student_id = ${studentId} AND cs.status != 'CANCELLED'
        ORDER BY cs.start_date DESC
        LIMIT 1
      ` as Promise<any[]>,
      db.$queryRaw`
        SELECT cm.id, cm.week_start, cm.day_of_week, cm.meal_type, cm.description, cm.price
        FROM cafeteria_menus cm
        WHERE cm.week_start = date_trunc('week', NOW())::date
        ORDER BY cm.day_of_week, cm.meal_type
      ` as Promise<any[]>,
    ])

    const priceRows: any[] = await db.$queryRaw`
      SELECT cafeteria_price_lunch, cafeteria_price_snack, cafeteria_price_lunch_snack
      FROM school_settings LIMIT 1
    `
    const p = priceRows[0] ?? {}
    const toNum = (v: any) => (v !== null && v !== undefined ? Number(v) : null)

    return {
      success: true,
      data: {
        subscription: subscriptions[0] ?? null,
        menus,
        prices: {
          LUNCH: toNum(p.cafeteria_price_lunch),
          SNACK: toNum(p.cafeteria_price_snack),
          LUNCH_SNACK: toNum(p.cafeteria_price_lunch_snack),
        },
      },
    }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}
