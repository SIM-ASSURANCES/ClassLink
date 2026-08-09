import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'
import { notifyUser } from '@/lib/notifications/create'

// Annule un rendez-vous pris par le parent connecté — voir
// actions/appointments.ts::cancelAppointment (web, version parent).
export const POST = withMobileAuth(['PARENT'], async (req, { user, tenantDb }) => {
  const { appointmentId } = await req.json()
  if (!appointmentId) return NextResponse.json({ error: 'appointmentId requis.' }, { status: 400 })

  const rows: any[] = await tenantDb.$queryRaw`
    SELECT a.id, a.status, s.start_time, p.user_id AS parent_user_id, tu.id AS teacher_user_id
    FROM teacher_appointments a
    JOIN teacher_availability_slots s ON s.id = a.slot_id
    JOIN teachers t ON t.id = s.teacher_id
    JOIN users tu ON tu.id = t.user_id
    JOIN parents p ON p.id = a.parent_id
    WHERE a.id = ${appointmentId}
    LIMIT 1
  `
  const appt = rows[0]
  if (!appt) return NextResponse.json({ error: 'Rendez-vous introuvable.' }, { status: 404 })
  if (appt.parent_user_id !== user.userId) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
  if (appt.status !== 'CONFIRMED') return NextResponse.json({ error: 'Ce rendez-vous est déjà annulé.' }, { status: 400 })

  await tenantDb.$executeRaw`
    UPDATE teacher_appointments SET status = 'CANCELLED', cancelled_by = 'PARENT' WHERE id = ${appointmentId}
  `

  const dateLabel = new Date(appt.start_time).toLocaleString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  })
  await notifyUser(tenantDb, {
    userId: appt.teacher_user_id,
    type:   'APPOINTMENT_CANCELLED',
    title:  'Rendez-vous annulé',
    body:   `Le rendez-vous du ${dateLabel} a été annulé.`,
    href:   '/teacher/appointments',
  })

  return NextResponse.json({ ok: true })
})
