import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (_req, { user, tenantDb }) => {
  const rows: any[] = await tenantDb.$queryRaw`
    SELECT
      m.id, m.subject, m.body AS content, m.created_at, (m.read_at IS NOT NULL) AS is_read,
      m.sender_id,
      u.first_name || ' ' || u.last_name AS sender_name,
      u.role AS sender_role,
      u.avatar_url AS sender_avatar
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.recipient_id = ${user.userId}
    ORDER BY m.created_at DESC
    LIMIT 50
  `

  const sent: any[] = await tenantDb.$queryRaw`
    SELECT
      m.id, m.subject, m.body AS content, m.created_at, (m.read_at IS NOT NULL) AS is_read,
      m.recipient_id,
      u.first_name || ' ' || u.last_name AS recipient_name
    FROM messages m
    JOIN users u ON u.id = m.recipient_id
    WHERE m.sender_id = ${user.userId}
    ORDER BY m.created_at DESC
    LIMIT 20
  `

  return NextResponse.json({
    received: rows.map(r => ({
      id:           r.id,
      subject:      r.subject,
      content:      r.content,
      createdAt:    r.created_at,
      isRead:       r.is_read,
      senderName:   r.sender_name,
      senderRole:   r.sender_role,
      senderAvatar: r.sender_avatar,
    })),
    sent: sent.map(s => ({
      id:            s.id,
      subject:       s.subject,
      content:       s.content,
      createdAt:     s.created_at,
      recipientName: s.recipient_name,
    })),
    unreadCount: rows.filter(r => !r.is_read).length,
  })
})

export const POST = withMobileAuth(['STUDENT', 'PARENT'], async (req, { user, tenantDb }) => {
  const { recipientId, content, subject } = await req.json()
  if (!recipientId || !content?.trim()) {
    return NextResponse.json({ error: 'Destinataire et contenu requis.' }, { status: 400 })
  }

  try {
    const rows: any[] = await tenantDb.$queryRaw`
      INSERT INTO messages (sender_id, recipient_id, subject, body)
      VALUES (${user.userId}, ${recipientId}, ${(subject as string)?.trim() || null}, ${content as string})
      RETURNING id, created_at
    `
    return NextResponse.json({ id: rows[0].id, createdAt: rows[0].created_at })
  } catch {
    return NextResponse.json({ error: 'Erreur lors de l\'envoi.' }, { status: 500 })
  }
})
