import { NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'
import { initiatePayment as initiateGlobalPayment } from '@/lib/payments/geniuspay'
import { PARENT_FEE_PER_CHILD } from '@/lib/parent-fee'

// Initie le paiement de l'abonnement MyClassLink du parent (compte
// plateforme global — ne passe jamais par le PSP de l'établissement) —
// équivalent mobile de actions/parent.ts::initiateParentSubscriptionPayment.
export const POST = withMobileAuth(['PARENT'], async (_req, { user, tenantDb }) => {
  const countRows: any[] = await tenantDb.$queryRaw`
    SELECT COUNT(DISTINCT s.id)::int AS count, ay.id AS academic_year_id
    FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    JOIN students s ON s.id = ps.student_id
    JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
    JOIN classes c ON c.id = e.class_id
    JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current = TRUE
    WHERE p.user_id = ${user.userId}
    GROUP BY ay.id
  `
  const count          = countRows[0]?.count ?? 0
  const academicYearId = countRows[0]?.academic_year_id ?? null

  if (count === 0 || !academicYearId) {
    return NextResponse.json({ success: false, error: 'Aucun enfant actif rattaché à votre compte.' }, { status: 400 })
  }

  const parentRows: any[] = await tenantDb.$queryRaw`
    SELECT id FROM parents WHERE user_id = ${user.userId} LIMIT 1
  `
  const parentId = parentRows[0]?.id
  if (!parentId) {
    return NextResponse.json({ success: false, error: 'Profil parent introuvable.' }, { status: 404 })
  }

  const userRows: any[] = await tenantDb.$queryRaw`
    SELECT email, first_name, last_name FROM users WHERE id = ${user.userId} LIMIT 1
  `
  const parentUser = userRows[0]

  const amount = count * PARENT_FEE_PER_CHILD

  try {
    // Recrée/rafraîchit une ligne PENDING (le nombre d'enfants peut avoir changé)
    const subRows: any[] = await tenantDb.$queryRaw`
      INSERT INTO parent_subscriptions (parent_id, academic_year_id, children_count, amount, status)
      VALUES (${parentId}, ${academicYearId}, ${count}, ${amount}, 'PENDING')
      ON CONFLICT (parent_id, academic_year_id) DO UPDATE
        SET children_count = EXCLUDED.children_count,
            amount         = EXCLUDED.amount,
            status         = CASE WHEN parent_subscriptions.status = 'SUCCESS' THEN 'SUCCESS' ELSE 'PENDING' END,
            updated_at     = NOW()
      RETURNING id, status
    `
    const subscription = subRows[0]
    if (subscription.status === 'SUCCESS') {
      return NextResponse.json({ success: false, error: 'Votre abonnement est déjà réglé pour cette année scolaire.' }, { status: 409 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const init = await initiateGlobalPayment({
      amount,
      description: `Abonnement MyClassLink ${count} enfant${count > 1 ? 's' : ''} — ${parentUser?.first_name ?? ''} ${parentUser?.last_name ?? ''}`.trim(),
      customerId: user.userId,
      customerName: `${parentUser?.first_name ?? ''} ${parentUser?.last_name ?? ''}`.trim(),
      customerEmail: parentUser?.email ?? '',
      returnUrl: `${baseUrl}/parent/subscription/return`,
      notifyUrl: `${baseUrl}/api/webhooks/geniuspay`,
      metadata: { kind: 'parent_subscription', schemaName: user.schemaName, parentSubscriptionId: subscription.id },
    })

    await tenantDb.$executeRaw`
      UPDATE parent_subscriptions
      SET provider = 'GENIUSPAY', provider_ref = ${init.transactionId}, updated_at = NOW()
      WHERE id = ${subscription.id}
    `

    return NextResponse.json({ success: true, paymentUrl: init.paymentUrl })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'Erreur lors de l\'initiation du paiement.' }, { status: 500 })
  }
})
