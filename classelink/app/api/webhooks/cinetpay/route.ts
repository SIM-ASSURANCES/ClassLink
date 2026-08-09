import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/payments/cinetpay'
import { getSchoolPaymentConfig, verifySchoolPayment } from '@/lib/payments/provider'
import { getTenantPrisma } from '@/lib/db/tenant'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()

    const transactionId: string = payload.cpm_trans_id
    const rawCustom: string = payload.cpm_custom ?? '{}'

    // Récupérer le contexte métier stocké dans metadata (avant vérif de signature
    // pour savoir quelle clé d'école utiliser ; la signature est validée ensuite).
    let metadata: { kind?: string; paymentId?: string; schemaName?: string; studentId?: string; subscriptionId?: string } = {}
    try {
      metadata = JSON.parse(rawCustom)
    } catch {
      console.error('[CinetPay webhook] Failed to parse cpm_custom:', rawCustom)
      return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 })
    }

    const { schemaName } = metadata
    if (!schemaName) {
      console.error('[CinetPay webhook] Missing schemaName in metadata')
      return NextResponse.json({ error: 'Missing metadata fields' }, { status: 400 })
    }

    // Vérifier la signature CinetPay avec le secret de l'école (repli global)
    const cfg = await getSchoolPaymentConfig(schemaName)
    const isValid = await verifyWebhookSignature(payload, cfg?.webhookSecret ?? undefined)
    if (!isValid) {
      console.error('[CinetPay webhook] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    // ── Abonnement transport / cantine (paiement en ligne parent) ──────────
    if (metadata.kind === 'transport_subscription' || metadata.kind === 'cafeteria_subscription') {
      const table = metadata.kind === 'transport_subscription' ? 'bus_subscriptions' : 'cafeteria_subscriptions'
      if (!metadata.subscriptionId) {
        return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 })
      }
      const verification = await verifySchoolPayment(schemaName, 'CINETPAY', transactionId)
      const tenantDb = getTenantPrisma(schemaName) as any
      if (verification.status === 'ACCEPTED') {
        await tenantDb.$executeRawUnsafe(
          `UPDATE ${table} SET status = 'ACTIVE', payment_status = 'PAID', paid_at = NOW(), updated_at = NOW() WHERE id = $1 AND provider_ref = $2`,
          metadata.subscriptionId, transactionId,
        )
      } else if (verification.status === 'REFUSED') {
        await tenantDb.$executeRawUnsafe(
          `UPDATE ${table} SET payment_status = 'FAILED', updated_at = NOW() WHERE id = $1 AND provider_ref = $2`,
          metadata.subscriptionId, transactionId,
        )
      }
      console.info(`[CinetPay webhook] ${metadata.kind} ${metadata.subscriptionId} → ${verification.status}`)
      return NextResponse.json({ received: true })
    }

    const { paymentId } = metadata
    if (!paymentId) {
      console.error('[CinetPay webhook] Missing paymentId in metadata')
      return NextResponse.json({ error: 'Missing metadata fields' }, { status: 400 })
    }

    // Vérifier le statut auprès de CinetPay (clés de l'école)
    const verification = await verifySchoolPayment(schemaName, 'CINETPAY', transactionId)

    const db = getTenantPrisma(schemaName) as any

    if (verification.status === 'ACCEPTED') {
      await db.$executeRaw`
        UPDATE payments
        SET status = 'SUCCESS', paid_at = NOW()
        WHERE id = ${paymentId} AND provider_ref = ${transactionId}
      `
      console.info(`[CinetPay webhook] Payment ${paymentId} accepted (${transactionId})`)
    } else if (verification.status === 'REFUSED') {
      await db.$executeRaw`
        UPDATE payments
        SET status = 'FAILED'
        WHERE id = ${paymentId} AND provider_ref = ${transactionId}
      `
      console.warn(`[CinetPay webhook] Payment ${paymentId} refused (${transactionId})`)
    }
    // PENDING: on ne fait rien, on attend un prochain appel

    return NextResponse.json({ received: true })
  } catch (e: any) {
    console.error('[CinetPay webhook] Unexpected error:', e?.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// CinetPay envoie parfois un GET pour tester l'URL
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
