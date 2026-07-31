import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

export const GET = withMobileAuth(['PARENT'], async (_req, { user, tenantDb }) => {
  const rows: any[] = await tenantDb.$queryRaw`
    SELECT
      ft.id, ft.title, ft.description, ft.destination,
      ft.trip_date, ft.return_date, ft.departure_time,
      ft.cost, ft.status,
      s.id          AS student_id,
      u.first_name  AS student_first_name,
      u.last_name   AS student_last_name,
      ta.status     AS authorization_status,
      ta.signed_at, ta.notes
    FROM parent_students ps
    JOIN parents p  ON p.id = ps.parent_id
    JOIN students s ON s.id = ps.student_id
    JOIN users u    ON u.id = s.user_id
    JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    JOIN trip_class_links tcl ON tcl.class_id = e.class_id
    JOIN field_trips ft ON ft.id = tcl.trip_id
    LEFT JOIN trip_authorizations ta
      ON ta.trip_id = ft.id AND ta.student_id = s.id
    WHERE p.user_id = ${user.userId}
      AND ft.status IN ('PLANNED', 'CONFIRMED')
    ORDER BY ft.trip_date ASC
  `

  return NextResponse.json({
    trips: rows.map(r => ({
      tripId:               r.id,
      title:                r.title,
      description:          r.description,
      destination:          r.destination,
      tripDate:             r.trip_date,
      returnDate:           r.return_date,
      departureTime:        r.departure_time,
      cost:                 Number(r.cost),
      status:               r.status,
      studentId:            r.student_id,
      studentFirstName:     r.student_first_name,
      studentLastName:      r.student_last_name,
      authorizationStatus:  r.authorization_status ?? 'PENDING',
      signedAt:             r.signed_at,
      notes:                r.notes,
    })),
  })
})
