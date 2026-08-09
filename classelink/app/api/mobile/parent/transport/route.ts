import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

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
