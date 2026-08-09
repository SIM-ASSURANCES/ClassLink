import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'
import { notifyUser } from '@/lib/notifications/create'

// Rendez-vous du parent connecté (tous ses enfants) — voir
// actions/appointments.ts::getParentAppointments (web).
export const GET = withMobileAuth(['PARENT'], async (_req, { user, tenantDb }) => {
  const parentRows: any[] = await tenantDb.$queryRaw`SELECT id FROM parents WHERE user_id = ${user.userId} LIMIT 1`
  const parentId = parentRows[0]?.id
  if (!parentId) return NextResponse.json({ appointments: [] })

  const rows: any[] = await tenantDb.$queryRaw`
    SELECT
      a.id, a.status, a.reason,
      s.start_time, s.end_time, s.location,
      u.first_name AS teacher_first_name, u.last_name AS teacher_last_name,
      su.first_name AS student_first_name, su.last_name AS student_last_name
    FROM teacher_appointments a
    JOIN teacher_availability_slots s ON s.id = a.slot_id
    JOIN teachers t ON t.id = s.teacher_id
    JOIN users u ON u.id = t.user_id
    LEFT JOIN students st ON st.id = a.student_id
    LEFT JOIN users su ON su.id = st.user_id
    WHERE a.parent_id = ${parentId}
    ORDER BY s.start_time DESC
  `

  return NextResponse.json({
    appointments: rows.map(r => ({
      id:                r.id,
      status:            r.status,
      reason:            r.reason,
      startTime:         r.start_time,
      endTime:           r.end_time,
      location:          r.location,
      teacherFirstName:  r.teacher_first_name,
      teacherLastName:   r.teacher_last_name,
      studentFirstName:  r.student_first_name,
      studentLastName:   r.student_last_name,
    })),
  })
})

// Réserve un créneau — voir actions/appointments.ts::bookAppointment (web).
export const POST = withMobileAuth(['PARENT'], async (req, { user, tenantDb }) => {
  const { slotId, studentId, reason } = await req.json()
  if (!slotId || !studentId) {
    return NextResponse.json({ error: 'slotId et studentId requis.' }, { status: 400 })
  }

  const parentRows: any[] = await tenantDb.$queryRaw`SELECT id FROM parents WHERE user_id = ${user.userId} LIMIT 1`
  const parentId = parentRows[0]?.id
  if (!parentId) return NextResponse.json({ error: 'Profil parent introuvable.' }, { status: 400 })

  const check: any[] = await tenantDb.$queryRaw`
    SELECT ps.id FROM parent_students ps
    WHERE ps.parent_id = ${parentId} AND ps.student_id = ${studentId}
    LIMIT 1
  `
  if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })

  const slot: any[] = await tenantDb.$queryRaw`
    SELECT s.id, s.start_time, u.id AS teacher_user_id
    FROM teacher_availability_slots s
    JOIN teachers t ON t.id = s.teacher_id
    JOIN users u ON u.id = t.user_id
    WHERE s.id = ${slotId} AND s.start_time > NOW()
    LIMIT 1
  `
  if (!slot[0]) return NextResponse.json({ error: 'Ce créneau n\'est plus disponible.' }, { status: 409 })

  const taken: any[] = await tenantDb.$queryRaw`
    SELECT id FROM teacher_appointments WHERE slot_id = ${slotId} AND status = 'CONFIRMED' LIMIT 1
  `
  if (taken[0]) return NextResponse.json({ error: 'Ce créneau vient d\'être réservé par un autre parent.' }, { status: 409 })

  await tenantDb.$executeRaw`
    INSERT INTO teacher_appointments (slot_id, parent_id, student_id, reason)
    VALUES (${slotId}, ${parentId}, ${studentId}, ${(reason as string)?.trim() || null})
  `

  const parentUser: any[] = await tenantDb.$queryRaw`SELECT first_name, last_name FROM users WHERE id = ${user.userId} LIMIT 1`
  const dateLabel = new Date(slot[0].start_time).toLocaleString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  })
  await notifyUser(tenantDb, {
    userId: slot[0].teacher_user_id,
    type:   'APPOINTMENT_BOOKED',
    title:  'Nouveau rendez-vous',
    body:   `${parentUser[0]?.first_name ?? ''} ${parentUser[0]?.last_name ?? ''} a réservé un rendez-vous le ${dateLabel}.`.trim(),
    href:   '/teacher/appointments',
  })

  return NextResponse.json({ ok: true })
})
