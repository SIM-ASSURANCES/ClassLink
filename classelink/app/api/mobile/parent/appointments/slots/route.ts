import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

// Créneaux encore disponibles (futurs, non réservés) d'un enseignant.
export const GET = withMobileAuth(['PARENT'], async (req, { tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const teacherId = searchParams.get('teacherId')
  if (!teacherId) return NextResponse.json({ error: 'teacherId requis.' }, { status: 400 })

  const rows: any[] = await tenantDb.$queryRaw`
    SELECT s.id, s.start_time, s.end_time, s.location
    FROM teacher_availability_slots s
    WHERE s.teacher_id = ${teacherId}
      AND s.start_time > NOW()
      AND NOT EXISTS (
        SELECT 1 FROM teacher_appointments a WHERE a.slot_id = s.id AND a.status = 'CONFIRMED'
      )
    ORDER BY s.start_time
  `

  return NextResponse.json({
    slots: rows.map(r => ({
      id:        r.id,
      startTime: r.start_time,
      endTime:   r.end_time,
      location:  r.location,
    })),
  })
})
