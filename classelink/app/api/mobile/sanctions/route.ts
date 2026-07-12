import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

// Historique des sanctions d'un enfant (parent uniquement, comme sur le web —
// voir actions/parent.ts::getChildSanctions).
export const GET = withMobileAuth(['PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')

  if (!studentId) return NextResponse.json({ error: 'studentId requis.' }, { status: 400 })

  const check: any[] = await tenantDb.$queryRaw`
    SELECT ps.id FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE p.user_id = ${user.userId} AND ps.student_id = ${studentId}
    LIMIT 1
  `
  if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })

  const rows: any[] = await tenantDb.$queryRaw`
    SELECT s.id, s.type, s.reason, s.description, s.date, s.duration,
           u.first_name AS issuer_first, u.last_name AS issuer_last
    FROM sanctions s
    LEFT JOIN users u ON u.id = s.issued_by
    WHERE s.student_id = ${studentId}
    ORDER BY s.date DESC
  `

  return NextResponse.json({
    sanctions: rows.map(s => ({
      id:          s.id,
      type:        s.type,
      reason:      s.reason,
      description: s.description,
      date:        s.date,
      duration:    s.duration,
      issuedBy:    `${s.issuer_first ?? ''} ${s.issuer_last ?? ''}`.trim(),
    })),
  })
})
