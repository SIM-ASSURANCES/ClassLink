'use server'

import { getTenantPrisma } from '@/lib/db/tenant'
import { requireRole } from '@/lib/auth/rbac'
import { revalidatePath } from 'next/cache'
import { notifyUser } from '@/lib/notifications/create'
import type { ActionResult } from '@/types'

async function getTeacherDb() {
  const session = await requireRole('TEACHER')
  const db = getTenantPrisma(session.user.schemaName) as any
  const rows: any[] = await db.$queryRaw`SELECT id FROM teachers WHERE user_id = ${session.user.id} LIMIT 1`
  if (!rows[0]) throw new Error('Profil enseignant introuvable.')
  return { db, session, teacherId: rows[0].id as string }
}

async function getParentDb() {
  const session = await requireRole('PARENT')
  const db = getTenantPrisma(session.user.schemaName) as any
  const rows: any[] = await db.$queryRaw`SELECT id FROM parents WHERE user_id = ${session.user.id} LIMIT 1`
  if (!rows[0]) throw new Error('Profil parent introuvable.')
  return { db, session, parentId: rows[0].id as string }
}

// ─── Côté enseignant ──────────────────────────────────────────────────────────

/** Créneaux de l'enseignant connecté (à venir et passés), avec réservation le cas échéant. */
export async function getTeacherAvailabilitySlots(): Promise<ActionResult<any[]>> {
  try {
    const { db, teacherId } = await getTeacherDb()
    const rows: any[] = await db.$queryRaw`
      SELECT
        s.id, s.start_time, s.end_time, s.location,
        a.id AS appointment_id, a.status AS appointment_status, a.reason,
        u.first_name AS parent_first_name, u.last_name AS parent_last_name,
        su.first_name AS student_first_name, su.last_name AS student_last_name
      FROM teacher_availability_slots s
      LEFT JOIN appointments a ON a.slot_id = s.id AND a.status = 'CONFIRMED'
      LEFT JOIN parents p ON p.id = a.parent_id
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN students st ON st.id = a.student_id
      LEFT JOIN users su ON su.id = st.user_id
      WHERE s.teacher_id = ${teacherId}
      ORDER BY s.start_time DESC
    `
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

export async function createAvailabilitySlot(
  startTime: string,
  endTime: string,
  location?: string
): Promise<ActionResult> {
  try {
    const { db, teacherId } = await getTeacherDb()
    const start = new Date(startTime)
    const end = new Date(endTime)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return { success: false, error: 'Horaires invalides.' }
    }
    if (start < new Date()) {
      return { success: false, error: 'Le créneau doit être dans le futur.' }
    }

    const overlap: any[] = await db.$queryRaw`
      SELECT id FROM teacher_availability_slots
      WHERE teacher_id = ${teacherId}
        AND start_time < ${end} AND end_time > ${start}
      LIMIT 1
    `
    if (overlap[0]) return { success: false, error: 'Ce créneau chevauche un créneau déjà publié.' }

    await db.$executeRaw`
      INSERT INTO teacher_availability_slots (teacher_id, start_time, end_time, location)
      VALUES (${teacherId}, ${start}, ${end}, ${location?.trim() || null})
    `
    revalidatePath('/teacher/appointments')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

/** Retire un créneau — uniquement s'il n'est pas réservé. */
export async function deleteAvailabilitySlot(slotId: string): Promise<ActionResult> {
  try {
    const { db, teacherId } = await getTeacherDb()

    const booked: any[] = await db.$queryRaw`
      SELECT id FROM appointments WHERE slot_id = ${slotId} AND status = 'CONFIRMED' LIMIT 1
    `
    if (booked[0]) return { success: false, error: 'Ce créneau est réservé — annulez le rendez-vous plutôt.' }

    const affected = await db.$executeRaw`
      DELETE FROM teacher_availability_slots WHERE id = ${slotId} AND teacher_id = ${teacherId}
    `
    if (affected === 0) return { success: false, error: 'Créneau introuvable.' }
    revalidatePath('/teacher/appointments')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

// ─── Côté parent ──────────────────────────────────────────────────────────────

/** Enseignants intervenant dans la classe active d'un enfant du parent connecté. */
export async function getChildTeachers(studentId: string): Promise<ActionResult<any[]>> {
  try {
    const { db, session } = await getParentDb()
    const check: any[] = await db.$queryRaw`
      SELECT ps.id FROM parent_students ps
      JOIN parents p ON p.id = ps.parent_id
      WHERE p.user_id = ${session.user.id} AND ps.student_id = ${studentId}
      LIMIT 1
    `
    if (!check[0]) return { success: false, error: 'Accès non autorisé.' }

    const rows: any[] = await db.$queryRaw`
      SELECT DISTINCT t.id AS teacher_id, u.first_name, u.last_name, sub.name AS subject_name
      FROM enrollments e
      JOIN teacher_subject_classes tsc ON tsc.class_id = e.class_id
      JOIN teachers t ON t.id = tsc.teacher_id
      JOIN users u ON u.id = t.user_id
      JOIN subjects sub ON sub.id = tsc.subject_id
      WHERE e.student_id = ${studentId} AND e.status = 'ACTIVE'
      ORDER BY u.last_name, u.first_name
    `
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

/** Créneaux encore disponibles (futurs, non réservés) d'un enseignant. */
export async function getTeacherOpenSlots(teacherId: string): Promise<ActionResult<any[]>> {
  try {
    await requireRole('PARENT')
    const { db } = await getParentDb()
    const rows: any[] = await db.$queryRaw`
      SELECT s.id, s.start_time, s.end_time, s.location
      FROM teacher_availability_slots s
      WHERE s.teacher_id = ${teacherId}
        AND s.start_time > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM appointments a WHERE a.slot_id = s.id AND a.status = 'CONFIRMED'
        )
      ORDER BY s.start_time
    `
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

export async function bookAppointment(
  slotId: string,
  studentId: string,
  reason?: string
): Promise<ActionResult> {
  try {
    const { db, session, parentId } = await getParentDb()

    const check: any[] = await db.$queryRaw`
      SELECT ps.id FROM parent_students ps
      WHERE ps.parent_id = ${parentId} AND ps.student_id = ${studentId}
      LIMIT 1
    `
    if (!check[0]) return { success: false, error: 'Accès non autorisé.' }

    const slot: any[] = await db.$queryRaw`
      SELECT s.id, s.teacher_id, s.start_time, u.id AS teacher_user_id
      FROM teacher_availability_slots s
      JOIN teachers t ON t.id = s.teacher_id
      JOIN users u ON u.id = t.user_id
      WHERE s.id = ${slotId} AND s.start_time > NOW()
      LIMIT 1
    `
    if (!slot[0]) return { success: false, error: 'Ce créneau n\'est plus disponible.' }

    const taken: any[] = await db.$queryRaw`
      SELECT id FROM appointments WHERE slot_id = ${slotId} AND status = 'CONFIRMED' LIMIT 1
    `
    if (taken[0]) return { success: false, error: 'Ce créneau vient d\'être réservé par un autre parent.' }

    await db.$executeRaw`
      INSERT INTO appointments (slot_id, parent_id, student_id, reason)
      VALUES (${slotId}, ${parentId}, ${studentId}, ${reason?.trim() || null})
    `

    const dateLabel = new Date(slot[0].start_time).toLocaleString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    })
    await notifyUser(db, {
      userId: slot[0].teacher_user_id,
      type:   'APPOINTMENT_BOOKED',
      title:  'Nouveau rendez-vous',
      body:   `${session.user.name ?? 'Un parent'} a réservé un rendez-vous le ${dateLabel}.`,
      href:   '/teacher/appointments',
    })

    revalidatePath('/parent/appointments')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

/** Rendez-vous du parent connecté (tous ses enfants). */
export async function getParentAppointments(): Promise<ActionResult<any[]>> {
  try {
    const { db, parentId } = await getParentDb()
    const rows: any[] = await db.$queryRaw`
      SELECT
        a.id, a.status, a.reason, a.created_at,
        s.start_time, s.end_time, s.location,
        u.first_name AS teacher_first_name, u.last_name AS teacher_last_name,
        su.first_name AS student_first_name, su.last_name AS student_last_name
      FROM appointments a
      JOIN teacher_availability_slots s ON s.id = a.slot_id
      JOIN teachers t ON t.id = s.teacher_id
      JOIN users u ON u.id = t.user_id
      LEFT JOIN students st ON st.id = a.student_id
      LEFT JOIN users su ON su.id = st.user_id
      WHERE a.parent_id = ${parentId}
      ORDER BY s.start_time DESC
    `
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

/** Annule un rendez-vous — accessible au parent qui l'a pris ou à l'enseignant du créneau. */
export async function cancelAppointment(appointmentId: string): Promise<ActionResult> {
  try {
    const session = await requireRole('PARENT', 'TEACHER')
    const db = getTenantPrisma(session.user.schemaName) as any

    const rows: any[] = await db.$queryRaw`
      SELECT a.id, a.status, s.start_time,
             p.user_id AS parent_user_id,
             tu.id AS teacher_user_id,
             a.parent_id, s.teacher_id
      FROM appointments a
      JOIN teacher_availability_slots s ON s.id = a.slot_id
      JOIN teachers t ON t.id = s.teacher_id
      JOIN users tu ON tu.id = t.user_id
      JOIN parents p ON p.id = a.parent_id
      WHERE a.id = ${appointmentId}
      LIMIT 1
    `
    const appt = rows[0]
    if (!appt) return { success: false, error: 'Rendez-vous introuvable.' }
    if (appt.status !== 'CONFIRMED') return { success: false, error: 'Ce rendez-vous est déjà annulé.' }

    let cancelledBy: 'PARENT' | 'TEACHER'
    let notifyUserId: string
    if (session.user.role === 'PARENT') {
      if (appt.parent_user_id !== session.user.id) return { success: false, error: 'Accès non autorisé.' }
      cancelledBy = 'PARENT'
      notifyUserId = appt.teacher_user_id
    } else {
      const teacherRow: any[] = await db.$queryRaw`SELECT id FROM teachers WHERE user_id = ${session.user.id} LIMIT 1`
      if (teacherRow[0]?.id !== appt.teacher_id) return { success: false, error: 'Accès non autorisé.' }
      cancelledBy = 'TEACHER'
      notifyUserId = appt.parent_user_id
    }

    await db.$executeRaw`
      UPDATE appointments SET status = 'CANCELLED', cancelled_by = ${cancelledBy} WHERE id = ${appointmentId}
    `

    const dateLabel = new Date(appt.start_time).toLocaleString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    })
    await notifyUser(db, {
      userId: notifyUserId,
      type:   'APPOINTMENT_CANCELLED',
      title:  'Rendez-vous annulé',
      body:   `Le rendez-vous du ${dateLabel} a été annulé.`,
      href:   session.user.role === 'PARENT' ? '/teacher/appointments' : '/parent/appointments',
    })

    revalidatePath('/parent/appointments')
    revalidatePath('/teacher/appointments')
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}
