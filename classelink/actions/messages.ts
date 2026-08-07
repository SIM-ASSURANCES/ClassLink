'use server'

import { getTenantPrisma } from '@/lib/db/tenant'
import { requireRole } from '@/lib/auth/rbac'
import { revalidatePath } from 'next/cache'
import { notifyUser } from '@/lib/notifications/create'
import type { ActionResult } from '@/types'

async function getDb() {
  const session = await requireRole('ADMIN', 'CENSOR', 'TEACHER', 'PARENT', 'STUDENT')
  return { db: getTenantPrisma(session.user.schemaName) as any, session }
}

export async function getInbox(): Promise<any[]> {
  const { db, session } = await getDb()
  const userId = session.user.id
  return db.$queryRaw`
    SELECT m.*, u.first_name AS sender_first_name, u.last_name AS sender_last_name, u.role AS sender_role
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.recipient_id = ${userId}
    ORDER BY m.created_at DESC
    LIMIT 50
  ` as Promise<any[]>
}

export async function getSent(): Promise<any[]> {
  const { db, session } = await getDb()
  const userId = session.user.id
  return db.$queryRaw`
    SELECT m.*, u.first_name AS recipient_first_name, u.last_name AS recipient_last_name, u.role AS recipient_role
    FROM messages m
    LEFT JOIN users u ON u.id = m.recipient_id
    WHERE m.sender_id = ${userId}
    ORDER BY m.created_at DESC
    LIMIT 50
  ` as Promise<any[]>
}

export async function getMessage(id: string): Promise<any | null> {
  const { db, session } = await getDb()
  const userId = session.user.id

  const rows = await db.$queryRaw`
    SELECT m.*,
      s.first_name AS sender_first_name, s.last_name AS sender_last_name, s.role AS sender_role,
      r.first_name AS recipient_first_name, r.last_name AS recipient_last_name, r.role AS recipient_role
    FROM messages m
    LEFT JOIN users s ON s.id = m.sender_id
    LEFT JOIN users r ON r.id = m.recipient_id
    WHERE m.id = ${id}
      AND (m.sender_id = ${userId} OR m.recipient_id = ${userId})
    LIMIT 1
  ` as any[]

  const msg = rows[0] ?? null
  if (!msg) return null

  if (String(msg.recipient_id) === String(userId) && !msg.read_at) {
    await db.$executeRaw`
      UPDATE messages SET read_at = NOW() WHERE id = ${id}
    `
    msg.read_at = new Date()
  }

  // Permet à la page d'afficher l'accusé de lecture uniquement côté expéditeur.
  msg.is_sender = String(msg.sender_id) === String(userId)

  return msg
}

export async function sendMessage(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const { db, session } = await getDb()
    const senderId = session.user.id

    const recipientId = (formData.get('recipient_id') as string)?.trim()
    const subject = (formData.get('subject') as string)?.trim()
    const body = (formData.get('body') as string)?.trim()

    if (!recipientId) return { success: false, error: 'Le destinataire est requis.' }
    if (!subject) return { success: false, error: 'Le sujet est requis.' }
    if (!body) return { success: false, error: 'Le message est requis.' }

    await db.$executeRaw`
      INSERT INTO messages (sender_id, recipient_id, subject, body)
      VALUES (${senderId}, ${recipientId}, ${subject}, ${body})
    `

    revalidatePath('/admin/messages')
    revalidatePath('/teacher/messages')
    revalidatePath('/student/messages')
    revalidatePath('/parent/messages')

    // Best-effort — ne doit jamais faire échouer l'envoi du message.
    await notifyUser(db, {
      userId: recipientId,
      type:   'MESSAGE_RECEIVED',
      title:  `Message de ${session.user.name ?? session.user.email ?? 'un contact'}`,
      body:   subject,
      href:   '/messages',
    })

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Une erreur est survenue.' }
  }
}

export async function getContacts(): Promise<any[]> {
  const { db, session } = await getDb()
  const userId = session.user.id
  return db.$queryRaw`
    SELECT id, first_name, last_name, role
    FROM users
    WHERE id != ${userId}
      AND is_active = TRUE
    ORDER BY last_name, first_name
  ` as Promise<any[]>
}

export async function getUnreadCount(): Promise<number> {
  const { db, session } = await getDb()
  const userId = session.user.id
  const rows = await db.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM messages
    WHERE recipient_id = ${userId} AND read_at IS NULL
  ` as any[]
  return rows[0]?.count ?? 0
}
