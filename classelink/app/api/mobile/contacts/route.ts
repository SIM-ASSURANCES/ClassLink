import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

// Contacts disponibles pour composer un message — voir actions/messages.ts::getContacts (web).
export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (_req, { user, tenantDb }) => {
  const rows: any[] = await tenantDb.$queryRaw`
    SELECT id, first_name, last_name, role
    FROM users
    WHERE id != ${user.userId}
      AND is_active = TRUE
    ORDER BY last_name, first_name
  `

  return NextResponse.json({
    contacts: rows.map(r => ({
      id:        r.id,
      firstName: r.first_name,
      lastName:  r.last_name,
      role:      r.role,
    })),
  })
})
