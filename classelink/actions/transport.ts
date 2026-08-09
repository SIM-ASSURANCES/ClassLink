'use server'

import { revalidatePath } from 'next/cache'
import { hash } from 'bcryptjs'
import { nanoid } from 'nanoid'
import { requireRole } from '@/lib/auth/rbac'
import { getTenantPrisma } from '@/lib/db/tenant'
import { uploadFile } from '@/lib/storage/r2'
import { notifyUser } from '@/lib/notifications/create'
import { initiateSchoolPayment } from '@/lib/payments/provider'
import type { ActionResult } from '@/types'

async function getAdminDb() {
  const session = await requireRole('ADMIN', 'CENSOR')
  return { db: getTenantPrisma(session.user.schemaName) as any, session }
}

async function getDriverDb() {
  const session = await requireRole('DRIVER')
  return { db: getTenantPrisma(session.user.schemaName) as any, session }
}

async function getParentDb() {
  const session = await requireRole('PARENT')
  return { db: getTenantPrisma(session.user.schemaName) as any, session }
}

// La table bus_subscriptions (ajoutée après le premier déploiement du module
// transport) n'existe pas encore tant que l'admin n'a pas cliqué sur
// "Resynchroniser le schéma" en super-admin — on la crée ici de façon
// idempotente au premier usage pour ne pas dépendre de cette étape manuelle.
async function ensureBusSubscriptionsTable(db: any) {
  await db.$executeRawUnsafe(`
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
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_bus_sub_student ON bus_subscriptions(student_id)`
  )
  // Élargissement pour paiement en ligne parent — idempotent si déjà appliqué.
  await db.$executeRawUnsafe(`ALTER TABLE bus_subscriptions DROP CONSTRAINT IF EXISTS bus_subscriptions_status_check`)
  await db.$executeRawUnsafe(`ALTER TABLE bus_subscriptions ADD CONSTRAINT bus_subscriptions_status_check CHECK (status IN ('PENDING_PAYMENT','ACTIVE','SUSPENDED','CANCELLED'))`)
  await db.$executeRawUnsafe(`ALTER TABLE bus_subscriptions ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'MANUAL' CHECK (payment_status IN ('MANUAL','PENDING','PAID','FAILED'))`)
  await db.$executeRawUnsafe(`ALTER TABLE bus_subscriptions ADD COLUMN IF NOT EXISTS provider TEXT`)
  await db.$executeRawUnsafe(`ALTER TABLE bus_subscriptions ADD COLUMN IF NOT EXISTS provider_ref TEXT`)
  await db.$executeRawUnsafe(`ALTER TABLE bus_subscriptions ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`)
}

function dbError(e: any): string {
  if (e?.code === '23505' || e?.message?.includes('23505')) {
    return 'Cette adresse email est déjà utilisée.'
  }
  if (e?.code === '23503' || e?.message?.includes('23503')) {
    return 'Le bus, chauffeur ou arrêt sélectionné n\'existe plus — rafraîchissez la page et réessayez.'
  }
  return e?.message ?? 'Une erreur est survenue.'
}

// ─── Chauffeurs (role DRIVER sur `users`) ─────────────────────────────────────

export async function getDrivers(): Promise<ActionResult<any[]>> {
  try {
    const { db } = await getAdminDb()
    const rows: any[] = await db.$queryRaw`
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.avatar_url, u.is_active,
             r.id AS route_id, r.name AS route_name
      FROM users u
      LEFT JOIN bus_routes r ON r.driver_id = u.id
      WHERE u.role = 'DRIVER'
      ORDER BY u.last_name, u.first_name
    `
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function createDriver(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<{ id: string; tempPassword: string }>> {
  try {
    const { db } = await getAdminDb()
    const firstName = (formData.get('firstName') as string)?.trim()
    const lastName  = (formData.get('lastName')  as string)?.trim()
    const email     = (formData.get('email')     as string)?.trim().toLowerCase()
    const phone     = (formData.get('phone')     as string)?.trim() || null

    if (!firstName || !lastName || !email || !phone) {
      return { success: false, error: 'Prénom, nom, email et téléphone requis.' }
    }

    const tempPassword = nanoid(12)
    const passwordHash = await hash(tempPassword, 12)

    const rows: any[] = await db.$queryRaw`
      INSERT INTO users (email, password_hash, first_name, last_name, phone, role, email_verified)
      VALUES (${email}, ${passwordHash}, ${firstName}, ${lastName}, ${phone}, 'DRIVER', TRUE)
      RETURNING id
    `

    revalidatePath('/admin/transport')
    return { success: true, data: { id: rows[0].id, tempPassword } }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function updateDriver(
  driverId: string,
  data: { firstName: string; lastName: string; phone: string; isActive: boolean }
): Promise<ActionResult> {
  try {
    const { db } = await getAdminDb()
    await db.$executeRaw`
      UPDATE users
      SET first_name = ${data.firstName}, last_name = ${data.lastName},
          phone = ${data.phone}, is_active = ${data.isActive}
      WHERE id = ${driverId} AND role = 'DRIVER'
    `
    revalidatePath('/admin/transport')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

/** Photo numérique du chauffeur — remplace users.avatar_url (même champ que tous les rôles). */
export async function uploadDriverPhoto(driverId: string, formData: FormData): Promise<ActionResult<{ url: string }>> {
  try {
    const { db, session } = await getAdminDb()
    const file = formData.get('photo') as File | null
    if (!file || file.size === 0) return { success: false, error: 'Aucun fichier fourni.' }
    if (!file.type.startsWith('image/')) return { success: false, error: 'Le fichier doit être une image.' }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { url } = await uploadFile(buffer, {
      folder: 'drivers',
      contentType: file.type,
      schoolId: session.user.schemaName,
    })

    await db.$executeRaw`UPDATE users SET avatar_url = ${url} WHERE id = ${driverId} AND role = 'DRIVER'`
    revalidatePath('/admin/transport')
    return { success: true, data: { url } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Échec de l\'envoi de la photo.' }
  }
}

// ─── Bus ───────────────────────────────────────────────────────────────────

export async function getBuses(): Promise<ActionResult<any[]>> {
  try {
    const { db } = await getAdminDb()
    const rows: any[] = await db.$queryRaw`
      SELECT b.id, b.plate_number, b.capacity, r.id AS route_id, r.name AS route_name
      FROM bus_vehicles b
      LEFT JOIN bus_routes r ON r.bus_id = b.id
      ORDER BY b.plate_number
    `
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function createBus(plateNumber: string, capacity: number | null): Promise<ActionResult<{ id: string }>> {
  try {
    const { db } = await getAdminDb()
    if (!plateNumber.trim()) return { success: false, error: 'Immatriculation requise.' }
    const rows: any[] = await db.$queryRaw`
      INSERT INTO bus_vehicles (plate_number, capacity) VALUES (${plateNumber.trim()}, ${capacity})
      RETURNING id
    `
    revalidatePath('/admin/transport')
    return { success: true, data: { id: rows[0].id } }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function deleteBus(busId: string): Promise<ActionResult> {
  try {
    const { db } = await getAdminDb()
    await db.$executeRaw`UPDATE bus_routes SET bus_id = NULL WHERE bus_id = ${busId}`
    await db.$executeRaw`DELETE FROM bus_vehicles WHERE id = ${busId}`
    revalidatePath('/admin/transport')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Itinéraires & arrêts ─────────────────────────────────────────────────────

export async function getRoutes(): Promise<ActionResult<any[]>> {
  try {
    const { db } = await getAdminDb()
    const routes: any[] = await db.$queryRaw`
      SELECT r.id, r.name, r.bus_id, b.plate_number,
             r.driver_id, u.first_name AS driver_first_name, u.last_name AS driver_last_name,
             u.phone AS driver_phone, u.avatar_url AS driver_photo
      FROM bus_routes r
      LEFT JOIN bus_vehicles b ON b.id = r.bus_id
      LEFT JOIN users u ON u.id = r.driver_id
      ORDER BY r.name
    `
    const stops: any[] = await db.$queryRaw`
      SELECT id, route_id, stop_order, name, latitude::float8 AS latitude, longitude::float8 AS longitude,
             morning_pickup_time, afternoon_dropoff_time
      FROM bus_route_stops
      ORDER BY route_id, stop_order
    `
    const counts: any[] = await db.$queryRaw`
      SELECT route_id, COUNT(*)::int AS cnt FROM student_transport GROUP BY route_id
    `
    const countByRoute = new Map(counts.map((c: any) => [c.route_id, c.cnt]))

    const data = routes.map(r => ({
      ...r,
      studentCount: countByRoute.get(r.id) ?? 0,
      stops: stops.filter(s => s.route_id === r.id),
    }))
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function createRoute(name: string, busId: string | null, driverId: string | null): Promise<ActionResult<{ id: string }>> {
  try {
    const { db } = await getAdminDb()
    if (!name.trim()) return { success: false, error: 'Nom de l\'itinéraire requis.' }
    const rows: any[] = await db.$queryRaw`
      INSERT INTO bus_routes (name, bus_id, driver_id)
      VALUES (${name.trim()}, ${busId}, ${driverId})
      RETURNING id
    `
    revalidatePath('/admin/transport')
    return { success: true, data: { id: rows[0].id } }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function updateRoute(routeId: string, name: string, busId: string | null, driverId: string | null): Promise<ActionResult> {
  try {
    const { db } = await getAdminDb()
    await db.$executeRaw`
      UPDATE bus_routes SET name = ${name.trim()}, bus_id = ${busId}, driver_id = ${driverId}
      WHERE id = ${routeId}
    `
    revalidatePath('/admin/transport')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function deleteRoute(routeId: string): Promise<ActionResult> {
  try {
    const { db } = await getAdminDb()
    await db.$executeRaw`DELETE FROM bus_routes WHERE id = ${routeId}`
    revalidatePath('/admin/transport')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function addStop(
  routeId: string,
  data: { name: string; latitude: number; longitude: number; morningPickupTime: string | null; afternoonDropoffTime: string | null }
): Promise<ActionResult<{ id: string }>> {
  try {
    const { db } = await getAdminDb()
    if (!data.name.trim()) return { success: false, error: 'Nom de l\'arrêt requis.' }

    const existing: any[] = await db.$queryRaw`
      SELECT COALESCE(MAX(stop_order), 0) + 1 AS next_order FROM bus_route_stops WHERE route_id = ${routeId}
    `
    const rows: any[] = await db.$queryRaw`
      INSERT INTO bus_route_stops (route_id, stop_order, name, latitude, longitude, morning_pickup_time, afternoon_dropoff_time)
      VALUES (${routeId}, ${existing[0].next_order}, ${data.name.trim()}, ${data.latitude}, ${data.longitude},
              ${data.morningPickupTime}, ${data.afternoonDropoffTime})
      RETURNING id
    `
    revalidatePath('/admin/transport')
    return { success: true, data: { id: rows[0].id } }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function deleteStop(stopId: string): Promise<ActionResult> {
  try {
    const { db } = await getAdminDb()
    await db.$executeRaw`DELETE FROM student_transport WHERE stop_id = ${stopId}`
    await db.$executeRaw`DELETE FROM bus_route_stops WHERE id = ${stopId}`
    revalidatePath('/admin/transport')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Affectation des élèves ───────────────────────────────────────────────────

export async function getStudentsForAssignment(): Promise<ActionResult<any[]>> {
  try {
    const { db } = await getAdminDb()
    await ensureBusSubscriptionsTable(db)
    const rows: any[] = await db.$queryRaw`
      SELECT s.id, u.first_name, u.last_name, c.name AS class_name,
             st.route_id, st.stop_id, r.name AS route_name, bs.name AS stop_name,
             sub.id AS subscription_id, sub.status AS subscription_status, sub.amount_paid AS subscription_amount
      FROM students s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
      LEFT JOIN classes c ON c.id = e.class_id
      LEFT JOIN student_transport st ON st.student_id = s.id
      LEFT JOIN bus_routes r ON r.id = st.route_id
      LEFT JOIN bus_route_stops bs ON bs.id = st.stop_id
      LEFT JOIN bus_subscriptions sub ON sub.student_id = s.id
        AND sub.academic_year_id = (SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1)
      ORDER BY u.last_name, u.first_name
    `
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Abonnement transport ─────────────────────────────────────────────────────

export async function getBusSubscriptions(): Promise<ActionResult<any[]>> {
  try {
    const { db } = await getAdminDb()
    await ensureBusSubscriptionsTable(db)
    const rows: any[] = await db.$queryRaw`
      SELECT bsub.id, bsub.student_id, bsub.start_date, bsub.amount_paid, bsub.status,
             u.first_name, u.last_name, c.name AS class_name
      FROM bus_subscriptions bsub
      JOIN students s ON s.id = bsub.student_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
      LEFT JOIN classes c ON c.id = e.class_id
      WHERE bsub.academic_year_id = (SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1)
      ORDER BY u.last_name, u.first_name
    `
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

/** Abonne (ou réactive) un élève au transport pour l'année académique courante. */
export async function subscribeStudentTransport(
  studentId: string,
  startDate: string,
  amount: number
): Promise<ActionResult<{ id: string }>> {
  try {
    const { db } = await getAdminDb()
    await ensureBusSubscriptionsTable(db)

    const studentRows: any[] = await db.$queryRaw`SELECT id FROM students WHERE id = ${studentId} LIMIT 1`
    if (!studentRows[0]) return { success: false, error: 'Élève introuvable.' }

    const yearRows: any[] = await db.$queryRaw`SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1`
    const academicYearId = yearRows[0]?.id
    if (!academicYearId) return { success: false, error: 'Aucune année académique courante trouvée.' }

    const rows: any[] = await db.$queryRaw`
      INSERT INTO bus_subscriptions (student_id, academic_year_id, start_date, amount_paid, status)
      VALUES (${studentId}, ${academicYearId}, ${new Date(startDate)}, ${amount}, 'ACTIVE')
      ON CONFLICT (student_id, academic_year_id) DO UPDATE
        SET start_date = EXCLUDED.start_date, amount_paid = EXCLUDED.amount_paid,
            status = 'ACTIVE', updated_at = NOW()
      RETURNING id
    `
    revalidatePath('/admin/transport')
    return { success: true, data: { id: rows[0].id } }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

const VALID_BUS_SUB_STATUSES = ['ACTIVE', 'SUSPENDED', 'CANCELLED']

export async function updateBusSubscriptionStatus(subId: string, status: string): Promise<ActionResult> {
  if (!VALID_BUS_SUB_STATUSES.includes(status)) return { success: false, error: 'Statut invalide.' }
  try {
    const { db } = await getAdminDb()
    await ensureBusSubscriptionsTable(db)
    await db.$executeRaw`UPDATE bus_subscriptions SET status = ${status}, updated_at = NOW() WHERE id = ${subId}`
    revalidatePath('/admin/transport')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

/**
 * Le parent s'abonne lui-même au transport et paie en ligne (tarif fixe
 * configuré par l'admin dans les paramètres de l'établissement). Crée/réutilise
 * la ligne d'abonnement en statut PENDING_PAYMENT, initie la transaction auprès
 * du PSP de l'école, et renvoie l'URL de paiement vers laquelle rediriger le
 * parent. La ligne passe à ACTIVE/PAID via le webhook une fois le paiement
 * confirmé (voir app/api/webhooks/geniuspay et cinetpay).
 */
export async function initiateTransportSubscriptionPayment(studentId: string): Promise<ActionResult<{ paymentUrl: string }>> {
  try {
    const { db, session } = await getParentDb()
    await ensureBusSubscriptionsTable(db)

    const check: any[] = await db.$queryRaw`
      SELECT ps.id FROM parent_students ps
      JOIN parents p ON p.id = ps.parent_id
      WHERE p.user_id = ${session.user.id} AND ps.student_id = ${studentId}
      LIMIT 1
    `
    if (!check[0]) return { success: false, error: 'Accès non autorisé.' }

    const settingsRows: any[] = await db.$queryRaw`SELECT transport_monthly_price FROM school_settings LIMIT 1`
    const price = settingsRows[0]?.transport_monthly_price
    if (price === null || price === undefined) {
      return { success: false, error: 'Le tarif du transport n\'a pas encore été configuré par l\'établissement.' }
    }

    const yearRows: any[] = await db.$queryRaw`SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1`
    const academicYearId = yearRows[0]?.id
    if (!academicYearId) return { success: false, error: 'Aucune année académique courante trouvée.' }

    const existing: any[] = await db.$queryRaw`
      SELECT status FROM bus_subscriptions WHERE student_id = ${studentId} AND academic_year_id = ${academicYearId} LIMIT 1
    `
    if (existing[0]?.status === 'ACTIVE') {
      return { success: false, error: 'Cet élève est déjà abonné au transport.' }
    }

    const rows: any[] = await db.$queryRaw`
      INSERT INTO bus_subscriptions (student_id, academic_year_id, start_date, amount_paid, status, payment_status)
      VALUES (${studentId}, ${academicYearId}, CURRENT_DATE, ${price}, 'PENDING_PAYMENT', 'PENDING')
      ON CONFLICT (student_id, academic_year_id) DO UPDATE
        SET amount_paid = EXCLUDED.amount_paid, status = 'PENDING_PAYMENT', payment_status = 'PENDING', updated_at = NOW()
      RETURNING id
    `
    const subscriptionId = rows[0].id

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const schemaName = session.user.schemaName

    const init = await initiateSchoolPayment(schemaName, {
      amount: Number(price),
      description: 'Abonnement transport scolaire',
      customerId: session.user.id,
      customerName: session.user.name ?? session.user.email ?? '',
      customerEmail: session.user.email ?? '',
      returnUrl: `${baseUrl}/parent/children/${studentId}/transport?paid=pending`,
      baseUrl,
      metadata: { kind: 'transport_subscription', subscriptionId, schemaName, studentId },
    })

    await db.$executeRaw`
      UPDATE bus_subscriptions SET provider = ${init.provider}, provider_ref = ${init.transactionId} WHERE id = ${subscriptionId}
    `

    return { success: true, data: { paymentUrl: init.paymentUrl } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur lors de l\'initiation du paiement.' }
  }
}

export async function assignStudentStop(studentId: string, routeId: string, stopId: string): Promise<ActionResult> {
  try {
    const { db } = await getAdminDb()
    await db.$executeRaw`
      INSERT INTO student_transport (student_id, route_id, stop_id)
      VALUES (${studentId}, ${routeId}, ${stopId})
      ON CONFLICT (student_id) DO UPDATE SET route_id = EXCLUDED.route_id, stop_id = EXCLUDED.stop_id
    `
    revalidatePath('/admin/transport')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

export async function removeStudentAssignment(studentId: string): Promise<ActionResult> {
  try {
    const { db } = await getAdminDb()
    await db.$executeRaw`DELETE FROM student_transport WHERE student_id = ${studentId}`
    revalidatePath('/admin/transport')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Côté chauffeur ───────────────────────────────────────────────────────────

/** Itinéraire assigné au chauffeur connecté, ses arrêts, et le trajet du jour s'il existe. */
export async function getMyRoute(): Promise<ActionResult<any>> {
  try {
    const { db, session } = await getDriverDb()

    const routes: any[] = await db.$queryRaw`
      SELECT r.id, r.name, b.plate_number
      FROM bus_routes r
      LEFT JOIN bus_vehicles b ON b.id = r.bus_id
      WHERE r.driver_id = ${session.user.id}
      LIMIT 1
    `
    if (!routes[0]) return { success: true, data: null }
    const route = routes[0]

    const [stops, students, trips]: [any[], any[], any[]] = await Promise.all([
      db.$queryRaw`
        SELECT id, stop_order, name, latitude::float8 AS latitude, longitude::float8 AS longitude,
               morning_pickup_time, afternoon_dropoff_time
        FROM bus_route_stops WHERE route_id = ${route.id} ORDER BY stop_order
      `,
      db.$queryRaw`SELECT COUNT(*)::int AS cnt FROM student_transport WHERE route_id = ${route.id}`,
      db.$queryRaw`
        SELECT id, direction, status, started_at, ended_at
        FROM bus_trips WHERE route_id = ${route.id} AND trip_date = CURRENT_DATE
      `,
    ])

    return {
      success: true,
      data: {
        routeId: route.id,
        routeName: route.name,
        plateNumber: route.plate_number,
        stops,
        studentCount: students[0]?.cnt ?? 0,
        todayTrips: trips,
      },
    }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

/** Démarre (ou reprend) le trajet du jour pour une direction — notifie les parents concernés. */
export async function startTrip(direction: 'MORNING' | 'AFTERNOON'): Promise<ActionResult<{ tripId: string }>> {
  try {
    const { db, session } = await getDriverDb()

    const routes: any[] = await db.$queryRaw`SELECT id, name FROM bus_routes WHERE driver_id = ${session.user.id} LIMIT 1`
    if (!routes[0]) return { success: false, error: 'Aucun itinéraire ne vous est assigné.' }
    const route = routes[0]

    const existing: any[] = await db.$queryRaw`
      SELECT id, status FROM bus_trips
      WHERE route_id = ${route.id} AND direction = ${direction} AND trip_date = CURRENT_DATE
      LIMIT 1
    `
    if (existing[0]?.status === 'IN_PROGRESS') {
      return { success: true, data: { tripId: existing[0].id } }
    }

    let tripId: string
    if (existing[0]) {
      await db.$executeRaw`
        UPDATE bus_trips SET status = 'IN_PROGRESS', started_at = NOW(), ended_at = NULL WHERE id = ${existing[0].id}
      `
      tripId = existing[0].id
    } else {
      const rows: any[] = await db.$queryRaw`
        INSERT INTO bus_trips (route_id, direction) VALUES (${route.id}, ${direction}) RETURNING id
      `
      tripId = rows[0].id
    }

    const label = direction === 'MORNING' ? 'Ramassage du matin démarré' : 'Retour démarré'
    const body  = direction === 'MORNING'
      ? `Le car (${route.name}) a démarré son trajet de ramassage.`
      : `Le car (${route.name}) a démarré le trajet retour vers la maison.`
    await notifyRouteParents(db, route.id, 'BUS_TRIP_STARTED', label, body)

    revalidatePath('/driver')
    return { success: true, data: { tripId } }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

/** Position GPS envoyée périodiquement par le navigateur du chauffeur pendant un trajet actif. */
export async function reportLocation(tripId: string, latitude: number, longitude: number): Promise<ActionResult> {
  try {
    const { db, session } = await getDriverDb()

    const check: any[] = await db.$queryRaw`
      SELECT t.id FROM bus_trips t
      JOIN bus_routes r ON r.id = t.route_id
      WHERE t.id = ${tripId} AND r.driver_id = ${session.user.id} AND t.status = 'IN_PROGRESS'
      LIMIT 1
    `
    if (!check[0]) return { success: false, error: 'Trajet introuvable ou terminé.' }

    await db.$executeRaw`
      INSERT INTO bus_locations (trip_id, latitude, longitude) VALUES (${tripId}, ${latitude}, ${longitude})
    `
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

/** Termine le trajet — notifie les parents de l'arrivée. */
export async function endTrip(tripId: string): Promise<ActionResult> {
  try {
    const { db, session } = await getDriverDb()

    const trip: any[] = await db.$queryRaw`
      SELECT t.id, t.direction, r.id AS route_id, r.name AS route_name
      FROM bus_trips t
      JOIN bus_routes r ON r.id = t.route_id
      WHERE t.id = ${tripId} AND r.driver_id = ${session.user.id}
      LIMIT 1
    `
    if (!trip[0]) return { success: false, error: 'Trajet introuvable.' }

    await db.$executeRaw`
      UPDATE bus_trips SET status = 'COMPLETED', ended_at = NOW() WHERE id = ${tripId}
    `

    const label = trip[0].direction === 'MORNING' ? 'Arrivée à l\'école' : 'Arrivée à la maison'
    const body  = trip[0].direction === 'MORNING'
      ? `Le car (${trip[0].route_name}) est arrivé à l'école.`
      : `Le car (${trip[0].route_name}) est arrivé — votre enfant est en route vers la maison ou déjà arrivé.`
    await notifyRouteParents(db, trip[0].route_id, 'BUS_TRIP_ENDED', label, body)

    revalidatePath('/driver')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

// ─── Côté parent ──────────────────────────────────────────────────────────────

/**
 * Transport d'un enfant : arrêt assigné, horaires, infos chauffeur (nom,
 * photo, téléphone) et — si un trajet est en cours aujourd'hui — sa dernière
 * position connue. Le web/mobile sonde cette action pour un suivi "live".
 */
export async function getChildTransportInfo(studentId: string): Promise<ActionResult<any>> {
  try {
    const { db, session } = await getParentDb()
    await ensureBusSubscriptionsTable(db)

    const check: any[] = await db.$queryRaw`
      SELECT ps.id FROM parent_students ps
      JOIN parents p ON p.id = ps.parent_id
      WHERE p.user_id = ${session.user.id} AND ps.student_id = ${studentId}
      LIMIT 1
    `
    if (!check[0]) return { success: false, error: 'Accès non autorisé.' }

    const assignment: any[] = await db.$queryRaw`
      SELECT
        st.route_id, r.name AS route_name, b.plate_number,
        bs.id AS stop_id, bs.name AS stop_name,
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
    if (!assignment[0]) return { success: true, data: null }
    const a = assignment[0]

    const subRows: any[] = await db.$queryRaw`
      SELECT id, status, payment_status, amount_paid FROM bus_subscriptions
      WHERE student_id = ${studentId}
        AND academic_year_id = (SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1)
      LIMIT 1
    `
    const sub = subRows[0]
    const subscribed = sub?.status === 'ACTIVE'

    // Affecté mais pas (ou plus) abonné : on renseigne l'arrêt/horaires pour le
    // message côté parent, mais pas le chauffeur ni la position (données
    // sensibles réservées aux abonnés actifs).
    if (!subscribed) {
      const priceRows: any[] = await db.$queryRaw`SELECT transport_monthly_price FROM school_settings LIMIT 1`
      const monthlyPrice = priceRows[0]?.transport_monthly_price
      return {
        success: true,
        data: {
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
      }
    }

    const trips: any[] = await db.$queryRaw`
      SELECT id, direction, status, started_at, ended_at
      FROM bus_trips
      WHERE route_id = ${a.route_id} AND trip_date = CURRENT_DATE
      ORDER BY started_at DESC
    `
    const activeTrip = trips.find((t: any) => t.status === 'IN_PROGRESS') ?? null

    let lastLocation = null
    if (activeTrip) {
      const loc: any[] = await db.$queryRaw`
        SELECT latitude::float8 AS latitude, longitude::float8 AS longitude, recorded_at
        FROM bus_locations WHERE trip_id = ${activeTrip.id}
        ORDER BY recorded_at DESC LIMIT 1
      `
      lastLocation = loc[0] ?? null
    }

    return {
      success: true,
      data: {
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
        todayTrips: trips,
      },
    }
  } catch (e: any) {
    return { success: false, error: dbError(e) }
  }
}

async function notifyRouteParents(db: any, routeId: string, type: string, title: string, body: string): Promise<void> {
  const parents: any[] = await db.$queryRaw`
    SELECT DISTINCT p.user_id
    FROM student_transport st
    JOIN parent_students ps ON ps.student_id = st.student_id
    JOIN parents p ON p.id = ps.parent_id
    WHERE st.route_id = ${routeId}
  `
  await Promise.all(parents.map((p: any) => notifyUser(db, { userId: p.user_id, type, title, body, href: '/parent' })))
}
