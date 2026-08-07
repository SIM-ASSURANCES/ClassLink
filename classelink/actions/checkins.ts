'use server'

import { getTenantPrisma } from '@/lib/db/tenant'
import { requireRole } from '@/lib/auth/rbac'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types'

async function getStaffDb() {
  const session = await requireRole('ADMIN', 'CENSOR', 'STAFF')
  const db = getTenantPrisma(session.user.schemaName) as any
  return { db, session }
}

/**
 * Enregistre un check-in à partir du matricule scanné (QR de la carte
 * d'élève, qui encode simplement `student.student_id` — voir lib/qrcode.ts).
 * Renvoie les infos élève + statut d'abonnement cantine pour un retour
 * visuel instantané côté scanner (accepté / refusé).
 */
export async function recordCheckIn(
  studentNumber: string,
  module: 'CAFETERIA' = 'CAFETERIA'
): Promise<ActionResult<{
  studentId: string; firstName: string; lastName: string; className: string | null
  subscriptionActive: boolean
}>> {
  try {
    const { db, session } = await getStaffDb()

    const student: any[] = await db.$queryRaw`
      SELECT s.id, u.first_name, u.last_name, c.name AS class_name
      FROM students s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
      LEFT JOIN classes c ON c.id = e.class_id
      WHERE s.student_id = ${studentNumber.trim()}
      LIMIT 1
    `
    if (!student[0]) return { success: false, error: 'Aucun élève trouvé pour ce matricule.' }

    const sub: any[] = await db.$queryRaw`
      SELECT id FROM cafeteria_subscriptions
      WHERE student_id = ${student[0].id} AND status = 'ACTIVE'
      LIMIT 1
    `

    await db.$executeRaw`
      INSERT INTO check_ins (student_id, module, scanned_by)
      VALUES (${student[0].id}, ${module}, ${session.user.id})
    `

    revalidatePath('/admin/cafeteria/checkin')
    return {
      success: true,
      data: {
        studentId:   student[0].id,
        firstName:   student[0].first_name,
        lastName:    student[0].last_name,
        className:   student[0].class_name,
        subscriptionActive: !!sub[0],
      },
    }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}

/** Check-ins du jour (école courante), les plus récents en premier. */
export async function getTodayCheckIns(module: 'CAFETERIA' = 'CAFETERIA'): Promise<ActionResult<any[]>> {
  try {
    const { db } = await getStaffDb()
    const rows: any[] = await db.$queryRaw`
      SELECT ci.id, ci.scanned_at,
             u.first_name, u.last_name, c.name AS class_name,
             su.first_name AS scanned_by_first, su.last_name AS scanned_by_last
      FROM check_ins ci
      JOIN students s ON s.id = ci.student_id
      JOIN users u ON u.id = s.user_id
      JOIN users su ON su.id = ci.scanned_by
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
      LEFT JOIN classes c ON c.id = e.class_id
      WHERE ci.module = ${module} AND ci.scanned_at >= CURRENT_DATE
      ORDER BY ci.scanned_at DESC
      LIMIT 100
    `
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur' }
  }
}
