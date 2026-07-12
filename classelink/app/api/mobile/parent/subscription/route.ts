import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'
import { PARENT_FEE_PER_CHILD } from '@/lib/parent-fee'

// Statut de l'abonnement MyClassLink du parent (compte plateforme, distinct
// des frais de scolarité de l'école) — même logique que
// actions/parent.ts::getParentSubscriptionStatus, adaptée au contexte JWT
// mobile (tenantDb scopé par withMobileAuth plutôt que la session web).
export const GET = withMobileAuth(['PARENT'], async (_req, { user, tenantDb }) => {
  const countRows: any[] = await tenantDb.$queryRaw`
    SELECT COUNT(DISTINCT s.id)::int AS count, ay.id AS academic_year_id, ay.name AS academic_year_name
    FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    JOIN students s ON s.id = ps.student_id
    JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    JOIN classes c ON c.id = e.class_id
    JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current = TRUE
    WHERE p.user_id = ${user.userId}
    GROUP BY ay.id, ay.name
  `
  const count            = countRows[0]?.count ?? 0
  const academicYearId   = countRows[0]?.academic_year_id ?? null
  const academicYearName = countRows[0]?.academic_year_name ?? null

  if (count === 0 || !academicYearId) {
    return NextResponse.json({ paid: true, childrenCount: 0, amountDue: 0, academicYearName })
  }

  const parentRows: any[] = await tenantDb.$queryRaw`
    SELECT id FROM parents WHERE user_id = ${user.userId} LIMIT 1
  `
  const parentId = parentRows[0]?.id
  if (!parentId) {
    return NextResponse.json({ success: false, error: 'Profil parent introuvable.' }, { status: 404 })
  }

  const subRows: any[] = await tenantDb.$queryRaw`
    SELECT status FROM parent_subscriptions
    WHERE parent_id = ${parentId} AND academic_year_id = ${academicYearId}
    LIMIT 1
  `
  const paid = subRows[0]?.status === 'SUCCESS'

  return NextResponse.json({
    paid,
    childrenCount: count,
    amountDue: count * PARENT_FEE_PER_CHILD,
    academicYearName,
  })
})
