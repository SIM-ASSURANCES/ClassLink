import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'
import { Prisma } from '@prisma/client'
import { initiateSchoolPayment } from '@/lib/payments/provider'

const CAFETERIA_MEAL_TYPES = ['LUNCH', 'SNACK', 'LUNCH_SNACK']
const CAFETERIA_PRICE_COLUMN: Record<string, string> = {
  LUNCH: 'cafeteria_price_lunch',
  SNACK: 'cafeteria_price_snack',
  LUNCH_SNACK: 'cafeteria_price_lunch_snack',
}
const CAFETERIA_MEAL_LABEL: Record<string, string> = {
  LUNCH: 'Déjeuner', SNACK: 'Goûter', LUNCH_SNACK: 'Déjeuner + Goûter',
}

async function ensureCafeteriaSubscriptionColumns(tenantDb: any) {
  await tenantDb.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions DROP CONSTRAINT IF EXISTS cafeteria_subscriptions_status_check`)
  await tenantDb.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions ADD CONSTRAINT cafeteria_subscriptions_status_check CHECK (status IN ('PENDING_PAYMENT','ACTIVE','SUSPENDED','CANCELLED'))`)
  await tenantDb.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'MANUAL' CHECK (payment_status IN ('MANUAL','PENDING','PAID','FAILED'))`)
  await tenantDb.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions ADD COLUMN IF NOT EXISTS provider TEXT`)
  await tenantDb.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions ADD COLUMN IF NOT EXISTS provider_ref TEXT`)
  await tenantDb.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`)
  await tenantDb.$executeRawUnsafe(`ALTER TABLE cafeteria_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`)
}

// Cantine — élève : son abonnement ; parent : l'abonnement de CHAQUE enfant
// (comme la page web /parent/cafeteria, voir actions/cafeteria.ts::
// getStudentCafeteriaInfo). Menus de la semaine communs aux deux rôles.
export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('weekStart')

  await ensureCafeteriaSubscriptionColumns(tenantDb)

  const weekFilter = weekStart
    ? Prisma.sql`${weekStart}::date`
    : Prisma.sql`date_trunc('week', NOW())::date`

  const menus: any[] = await tenantDb.$queryRaw`
    SELECT id, week_start, day_of_week, meal_type, description, price
    FROM cafeteria_menus
    WHERE week_start = ${weekFilter}
    ORDER BY day_of_week, meal_type
  `

  const menusJson = menus.map(m => ({
    id:         m.id,
    weekStart:  m.week_start,
    dayOfWeek:  m.day_of_week,
    mealType:   m.meal_type,
    description:m.description,
    price:      parseFloat(m.price ?? 0),
  }))

  const subJson = (s: any) => s ? {
    id:            s.id,
    meal_type:     s.meal_type,
    status:        s.status,
    start_date:    s.start_date,
    amount:        s.amount_paid != null ? parseFloat(s.amount_paid) : null,
    paymentStatus: s.payment_status,
  } : null

  // Parent : un statut d'abonnement par enfant, comme le web.
  if (user.role === 'PARENT') {
    const [rows, priceRows]: [any[], any[]] = await Promise.all([
      tenantDb.$queryRaw`
        SELECT
          s.id AS student_id,
          u.first_name, u.last_name,
          c.name AS class_name,
          cs.id AS sub_id, cs.meal_type, cs.status, cs.start_date, cs.amount_paid, cs.payment_status
        FROM parent_students ps
        JOIN parents p  ON p.id = ps.parent_id
        JOIN students s ON s.id = ps.student_id
        JOIN users u    ON u.id = s.user_id
        LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
        LEFT JOIN classes c     ON c.id = e.class_id
        LEFT JOIN LATERAL (
          SELECT cs.id, cs.meal_type, cs.status, cs.start_date, cs.amount_paid, cs.payment_status
          FROM cafeteria_subscriptions cs
          WHERE cs.student_id = s.id AND cs.status != 'CANCELLED'
          ORDER BY cs.start_date DESC
          LIMIT 1
        ) cs ON TRUE
        WHERE p.user_id = ${user.userId}
        ORDER BY u.last_name, u.first_name
      `,
      tenantDb.$queryRaw`
        SELECT cafeteria_price_lunch, cafeteria_price_snack, cafeteria_price_lunch_snack
        FROM school_settings LIMIT 1
      `,
    ])

    const p = priceRows[0] ?? {}
    const toNum = (v: any) => (v !== null && v !== undefined ? Number(v) : null)

    return NextResponse.json({
      menus: menusJson,
      children: rows.map(r => ({
        studentId: r.student_id,
        firstName: r.first_name,
        lastName:  r.last_name,
        className: r.class_name,
        subscription: r.sub_id ? subJson({
          id: r.sub_id, meal_type: r.meal_type, status: r.status,
          start_date: r.start_date, amount_paid: r.amount_paid, payment_status: r.payment_status,
        }) : null,
      })),
      subscription: null,
      prices: {
        LUNCH: toNum(p.cafeteria_price_lunch),
        SNACK: toNum(p.cafeteria_price_snack),
        LUNCH_SNACK: toNum(p.cafeteria_price_lunch_snack),
      },
    })
  }

  // Élève : son propre abonnement actif.
  const studentSub: any[] = await tenantDb.$queryRaw`
    SELECT cs.id, cs.meal_type, cs.status, cs.start_date, cs.amount_paid
    FROM cafeteria_subscriptions cs
    JOIN students s ON s.id = cs.student_id
    WHERE s.user_id = ${user.userId}
      AND cs.status = 'ACTIVE'
    ORDER BY cs.start_date DESC
    LIMIT 1
  `

  return NextResponse.json({
    menus: menusJson,
    subscription: subJson(studentSub[0] ?? null),
  })
})

// Initie le paiement en ligne de l'abonnement cantine (parent) — voir
// actions/cafeteria.ts::initiateCafeteriaSubscriptionPayment (web).
export const POST = withMobileAuth(['PARENT'], async (req: NextRequest, { user, tenantDb }) => {
  const { studentId, mealType } = await req.json()
  if (!studentId || !CAFETERIA_MEAL_TYPES.includes(mealType)) {
    return NextResponse.json({ error: 'studentId et type de repas requis.' }, { status: 400 })
  }

  await ensureCafeteriaSubscriptionColumns(tenantDb)

  const check: any[] = await tenantDb.$queryRaw`
    SELECT ps.id FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE p.user_id = ${user.userId} AND ps.student_id = ${studentId}
    LIMIT 1
  `
  if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })

  const priceColumn = CAFETERIA_PRICE_COLUMN[mealType]
  const settingsRows: any[] = await tenantDb.$queryRawUnsafe(`SELECT ${priceColumn} AS price FROM school_settings LIMIT 1`)
  const price = settingsRows[0]?.price
  if (price === null || price === undefined) {
    return NextResponse.json({ error: 'Le tarif de la cantine n\'a pas encore été configuré par l\'établissement.' }, { status: 400 })
  }

  const yearRows: any[] = await tenantDb.$queryRaw`SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1`
  const academicYearId = yearRows[0]?.id
  if (!academicYearId) return NextResponse.json({ error: 'Aucune année académique courante trouvée.' }, { status: 400 })

  const existing: any[] = await tenantDb.$queryRaw`
    SELECT status FROM cafeteria_subscriptions
    WHERE student_id = ${studentId} AND academic_year_id = ${academicYearId} AND meal_type = ${mealType}
    LIMIT 1
  `
  if (existing[0]?.status === 'ACTIVE') {
    return NextResponse.json({ error: 'Cet élève est déjà abonné à la cantine pour ce type de repas.' }, { status: 409 })
  }

  const rows: any[] = await tenantDb.$queryRaw`
    INSERT INTO cafeteria_subscriptions (student_id, academic_year_id, meal_type, start_date, amount_paid, status, payment_status)
    VALUES (${studentId}, ${academicYearId}, ${mealType}, CURRENT_DATE, ${price}, 'PENDING_PAYMENT', 'PENDING')
    ON CONFLICT (student_id, academic_year_id, meal_type) DO UPDATE
      SET amount_paid = EXCLUDED.amount_paid, status = 'PENDING_PAYMENT', payment_status = 'PENDING', updated_at = NOW()
    RETURNING id
  `
  const subscriptionId = rows[0].id

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const schemaName = user.schemaName
  const meRows: any[] = await tenantDb.$queryRaw`SELECT email, first_name, last_name FROM users WHERE id = ${user.userId} LIMIT 1`
  const me = meRows[0]

  try {
    const init = await initiateSchoolPayment(schemaName, {
      amount: Number(price),
      description: `Abonnement cantine — ${CAFETERIA_MEAL_LABEL[mealType]}`,
      customerId: user.userId,
      customerName: me ? `${me.first_name} ${me.last_name}` : '',
      customerEmail: me?.email ?? '',
      returnUrl: `${baseUrl}/parent/cafeteria?paid=pending`,
      baseUrl,
      metadata: { kind: 'cafeteria_subscription', subscriptionId, schemaName, studentId },
    })

    await tenantDb.$executeRaw`
      UPDATE cafeteria_subscriptions SET provider = ${init.provider}, provider_ref = ${init.transactionId} WHERE id = ${subscriptionId}
    `

    return NextResponse.json({ paymentUrl: init.paymentUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erreur lors de l\'initiation du paiement.' }, { status: 500 })
  }
})
