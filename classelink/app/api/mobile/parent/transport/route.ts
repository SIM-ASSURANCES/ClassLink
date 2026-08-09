import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'
import { initiateSchoolPayment } from '@/lib/payments/provider'

async function ensureBusSubscriptionsTable(tenantDb: any) {
  await tenantDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bus_subscriptions (
      id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      student_id        TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      academic_year_id  TEXT REFERENCES academic_years(id),
      start_date        DATE NOT NULL,
      end_date          DATE,
      amount_paid       NUMERIC(10,2) DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('PENDING_PAYMENT','ACTIVE','SUSPENDED','CANCELLED')),
      payment_status    TEXT NOT NULL DEFAULT 'MANUAL'
                        CHECK (payment_status IN ('MANUAL','PENDING','PAID','FAILED')),
      provider          TEXT,
      provider_ref      TEXT,
      paid_at           TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, academic_year_id)
    )
  `)
  await tenantDb.$executeRawUnsafe(`ALTER TABLE bus_subscriptions DROP CONSTRAINT IF EXISTS bus_subscriptions_status_check`)
  await tenantDb.$executeRawUnsafe(`ALTER TABLE bus_subscriptions ADD CONSTRAINT bus_subscriptions_status_check CHECK (status IN ('PENDING_PAYMENT','ACTIVE','SUSPENDED','CANCELLED'))`)
  await tenantDb.$executeRawUnsafe(`ALTER TABLE bus_subscriptions ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'MANUAL' CHECK (payment_status IN ('MANUAL','PENDING','PAID','FAILED'))`)
  await tenantDb.$executeRawUnsafe(`ALTER TABLE bus_subscriptions ADD COLUMN IF NOT EXISTS provider TEXT`)
  await tenantDb.$executeRawUnsafe(`ALTER TABLE bus_subscriptions ADD COLUMN IF NOT EXISTS provider_ref TEXT`)
  await tenantDb.$executeRawUnsafe(`ALTER TABLE bus_subscriptions ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`)
}

// Transport scolaire d'un enfant — même requête que
// actions/transport.ts::getChildTransportInfo (web).
export const GET = withMobileAuth(['PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  if (!studentId) return NextResponse.json({ error: 'studentId requis.' }, { status: 400 })

  const check: any[] = await tenantDb.$queryRaw`
    SELECT ps.id FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE p.user_id = ${user.userId} AND ps.student_id = ${studentId}
    LIMIT 1
  `
  if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })

  const assignment: any[] = await tenantDb.$queryRaw`
    SELECT
      st.route_id, r.name AS route_name, b.plate_number,
      bs.name AS stop_name,
      bs.latitude::float8 AS stop_latitude, bs.longitude::float8 AS stop_longitude,
      bs.morning_pickup_time, bs.afternoon_dropoff_time,
      u.id AS driver_user_id, u.first_name AS driver_first_name, u.last_name AS driver_last_name,
      u.phone AS driver_phone, u.avatar_url AS driver_photo
    FROM student_transport st
    JOIN bus_routes r ON r.id = st.route_id
    JOIN bus_route_stops bs ON bs.id = st.stop_id
    LEFT JOIN bus_vehicles b ON b.id = r.bus_id
    LEFT JOIN users u ON u.id = r.driver_id
    WHERE st.student_id = ${studentId}
    LIMIT 1
  `
  if (!assignment[0]) return NextResponse.json({ transport: null })
  const a = assignment[0]

  await ensureBusSubscriptionsTable(tenantDb)

  const subRows: any[] = await tenantDb.$queryRaw`
    SELECT id, status, payment_status, amount_paid FROM bus_subscriptions
    WHERE student_id = ${studentId}
      AND academic_year_id = (SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1)
    LIMIT 1
  `
  const sub = subRows[0]
  const subscribed = sub?.status === 'ACTIVE'

  if (!subscribed) {
    const priceRows: any[] = await tenantDb.$queryRaw`SELECT transport_monthly_price FROM school_settings LIMIT 1`
    const monthlyPrice = priceRows[0]?.transport_monthly_price
    return NextResponse.json({
      transport: {
        subscribed: false,
        routeName: a.route_name,
        stop: {
          name: a.stop_name,
          morningPickupTime: a.morning_pickup_time,
          afternoonDropoffTime: a.afternoon_dropoff_time,
        },
        subscription: sub ? {
          id: sub.id, status: sub.status, paymentStatus: sub.payment_status,
          amount: sub.amount_paid !== null ? Number(sub.amount_paid) : null,
        } : null,
        monthlyPrice: monthlyPrice !== null && monthlyPrice !== undefined ? Number(monthlyPrice) : null,
      },
    })
  }

  const trips: any[] = await tenantDb.$queryRaw`
    SELECT id, direction, status, started_at
    FROM bus_trips
    WHERE route_id = ${a.route_id} AND trip_date = CURRENT_DATE
    ORDER BY started_at DESC
  `
  const activeTrip = trips.find((t: any) => t.status === 'IN_PROGRESS') ?? null

  let lastLocation = null
  if (activeTrip) {
    const loc: any[] = await tenantDb.$queryRaw`
      SELECT latitude::float8 AS latitude, longitude::float8 AS longitude, recorded_at
      FROM bus_locations WHERE trip_id = ${activeTrip.id}
      ORDER BY recorded_at DESC LIMIT 1
    `
    lastLocation = loc[0] ?? null
  }

  return NextResponse.json({
    transport: {
      subscribed: true,
      routeName: a.route_name,
      plateNumber: a.plate_number,
      stop: {
        name: a.stop_name,
        latitude: a.stop_latitude,
        longitude: a.stop_longitude,
        morningPickupTime: a.morning_pickup_time,
        afternoonDropoffTime: a.afternoon_dropoff_time,
      },
      driver: a.driver_user_id ? {
        firstName: a.driver_first_name,
        lastName: a.driver_last_name,
        phone: a.driver_phone,
        photoUrl: a.driver_photo,
      } : null,
      activeTrip: activeTrip ? { id: activeTrip.id, direction: activeTrip.direction, startedAt: activeTrip.started_at } : null,
      lastLocation,
    },
  })
})

// Initie le paiement en ligne de l'abonnement transport — voir
// actions/transport.ts::initiateTransportSubscriptionPayment (web).
export const POST = withMobileAuth(['PARENT'], async (req: NextRequest, { user, tenantDb }) => {
  const { studentId } = await req.json()
  if (!studentId) return NextResponse.json({ error: 'studentId requis.' }, { status: 400 })

  await ensureBusSubscriptionsTable(tenantDb)

  const check: any[] = await tenantDb.$queryRaw`
    SELECT ps.id FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE p.user_id = ${user.userId} AND ps.student_id = ${studentId}
    LIMIT 1
  `
  if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })

  const settingsRows: any[] = await tenantDb.$queryRaw`SELECT transport_monthly_price FROM school_settings LIMIT 1`
  const price = settingsRows[0]?.transport_monthly_price
  if (price === null || price === undefined) {
    return NextResponse.json({ error: 'Le tarif du transport n\'a pas encore été configuré par l\'établissement.' }, { status: 400 })
  }

  const yearRows: any[] = await tenantDb.$queryRaw`SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1`
  const academicYearId = yearRows[0]?.id
  if (!academicYearId) return NextResponse.json({ error: 'Aucune année académique courante trouvée.' }, { status: 400 })

  const existing: any[] = await tenantDb.$queryRaw`
    SELECT status FROM bus_subscriptions WHERE student_id = ${studentId} AND academic_year_id = ${academicYearId} LIMIT 1
  `
  if (existing[0]?.status === 'ACTIVE') {
    return NextResponse.json({ error: 'Cet élève est déjà abonné au transport.' }, { status: 409 })
  }

  const rows: any[] = await tenantDb.$queryRaw`
    INSERT INTO bus_subscriptions (student_id, academic_year_id, start_date, amount_paid, status, payment_status)
    VALUES (${studentId}, ${academicYearId}, CURRENT_DATE, ${price}, 'PENDING_PAYMENT', 'PENDING')
    ON CONFLICT (student_id, academic_year_id) DO UPDATE
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
      description: 'Abonnement transport scolaire',
      customerId: user.userId,
      customerName: me ? `${me.first_name} ${me.last_name}` : '',
      customerEmail: me?.email ?? '',
      returnUrl: `${baseUrl}/parent/children/${studentId}/transport?paid=pending`,
      baseUrl,
      metadata: { kind: 'transport_subscription', subscriptionId, schemaName, studentId },
    })

    await tenantDb.$executeRaw`
      UPDATE bus_subscriptions SET provider = ${init.provider}, provider_ref = ${init.transactionId} WHERE id = ${subscriptionId}
    `

    return NextResponse.json({ paymentUrl: init.paymentUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erreur lors de l\'initiation du paiement.' }, { status: 500 })
  }
})
