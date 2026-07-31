import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

// Même liste que le web (actions/announcements.ts::getAnnouncements) :
// annonces non expirées, épinglées en tête puis par date décroissante.
export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (_req, { tenantDb }) => {
  const rows: any[] = await tenantDb.$queryRaw`
    SELECT
      a.id, a.title, a.content, a.type, a.is_pinned, a.created_at,
      u.first_name || ' ' || u.last_name AS author_name
    FROM announcements a
    LEFT JOIN users u ON u.id = a.author_id
    WHERE (a.expires_at IS NULL OR a.expires_at > NOW())
    ORDER BY a.is_pinned DESC, a.created_at DESC
    LIMIT 50
  `

  return NextResponse.json({
    announcements: rows.map(r => ({
      id:         r.id,
      title:      r.title,
      content:    r.content,
      type:       r.type,
      isPinned:   r.is_pinned ?? false,
      createdAt:  r.created_at,
      authorName: r.author_name,
    })),
  })
})
