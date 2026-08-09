import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature, verifyPayment as geniuspayVerifyGlobal } from '@/lib/payments/geniuspay'
import { getSchoolPaymentConfig, verifySchoolPayment } from '@/lib/payments/provider'
import { getTenantPrisma } from '@/lib/db/tenant'
import { activateSchoolIfPaid } from '@/actions/register'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Corps brut nécessaire pour la vérification de signature
    const rawBody = await request.text()
    const signature = request.headers.get('X-Webhook-Signature') ?? ''
    const timestamp = request.headers.get('X-Webhook-Timestamp') ?? ''

    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const data = payload?.data ?? {}
    const reference: string | undefined = data.reference
    const metadata: {
      kind?: string
      paymentId?: string
      schemaName?: string
      studentId?: string
      schoolId?: string
      parentSubscriptionId?: string
      subscriptionId?: string
    } = data.metadata ?? {}

    // ── Paiement d'abonnement SaaS (création d'école) ──────────────────────
    // Compte GeniusPay global MyClassLink → signature avec le secret global.
    if (metadata.kind === 'subscription') {
      const validGlobal = await verifyWebhookSignature(rawBody, timestamp, signature)
      if (!validGlobal) {
        console.error('[GeniusPay webhook] Signature invalide (abonnement)')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
      if (!metadata.schoolId) {
        return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 })
      }
      const res = await activateSchoolIfPaid(metadata.schoolId)
      console.info(`[GeniusPay webhook] Abonnement ${metadata.schoolId} → ${res.status}`)
      return NextResponse.json({ received: true })
    }

    // ── Abonnement parent MyClassLink (2000 FCFA/an/enfant) ────────────────
    // Compte GeniusPay global MyClassLink (jamais celui de l'école) → signature
    // avec le secret global, comme pour l'abonnement SaaS.
    if (metadata.kind === 'parent_subscription') {
      const validGlobal = await verifyWebhookSignature(rawBody, timestamp, signature)
      if (!validGlobal) {
        console.error('[GeniusPay webhook] Signature invalide (abonnement parent)')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
      if (!metadata.parentSubscriptionId || !metadata.schemaName || !reference) {
        return NextResponse.json({ error: 'Missing metadata fields' }, { status: 400 })
      }
      const verification = await geniuspayVerifyGlobal(reference)
      const tenantDb = getTenantPrisma(metadata.schemaName) as any
      if (verification.status === 'ACCEPTED') {
        await tenantDb.$executeRaw`
          UPDATE parent_subscriptions
          SET status = 'SUCCESS', paid_at = NOW(), updated_at = NOW()
          WHERE id = ${metadata.parentSubscriptionId} AND provider_ref = ${reference}
        `
      } else if (verification.status === 'REFUSED') {
        await tenantDb.$executeRaw`
          UPDATE parent_subscriptions
          SET status = 'FAILED', updated_at = NOW()
          WHERE id = ${metadata.parentSubscriptionId} AND provider_ref = ${reference}
        `
      }
      console.info(`[GeniusPay webhook] Abonnement parent ${metadata.parentSubscriptionId} → ${verification.status}`)
      return NextResponse.json({ received: true })
    }

    // ── Abonnement transport / cantine (paiement en ligne parent) ──────────
    // Compte GeniusPay de l'ÉCOLE (jamais le compte global) → signature avec
    // le secret webhook de l'école (repli global géré par verifyWebhookSignature).
    if (metadata.kind === 'transport_subscription' || metadata.kind === 'cafeteria_subscription') {
      const table = metadata.kind === 'transport_subscription' ? 'bus_subscriptions' : 'cafeteria_subscriptions'
      if (!metadata.subscriptionId || !metadata.schemaName || !reference) {
        return NextResponse.json({ error: 'Missing metadata fields' }, { status: 400 })
      }
      const cfg = await getSchoolPaymentConfig(metadata.schemaName)
      const isValid = await verifyWebhookSignature(rawBody, timestamp, signature, cfg?.webhookSecret ?? undefined)
      if (!isValid) {
        console.error(`[GeniusPay webhook] Signature invalide (${metadata.kind})`)
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
      const verification = await verifySchoolPayment(metadata.schemaName, 'GENIUSPAY', reference)
      const tenantDb = getTenantPrisma(metadata.schemaName) as any
      if (verification.status === 'ACCEPTED') {
        await tenantDb.$executeRawUnsafe(
          `UPDATE ${table} SET status = 'ACTIVE', payment_status = 'PAID', paid_at = NOW(), updated_at = NOW() WHERE id = $1 AND provider_ref = $2`,
          metadata.subscriptionId, reference,
        )
      } else if (verification.status === 'REFUSED') {
        await tenantDb.$executeRawUnsafe(
          `UPDATE ${table} SET payment_status = 'FAILED', updated_at = NOW() WHERE id = $1 AND provider_ref = $2`,
          metadata.subscriptionId, reference,
        )
      }
      console.info(`[GeniusPay webhook] ${metadata.kind} ${metadata.subscriptionId} → ${verification.status}`)
      return NextResponse.json({ received: true })
    }

    // ── Paiement de frais (tenant) ─────────────────────────────────────────
    const { paymentId, schemaName } = metadata
    if (!reference || !paymentId || !schemaName) {
      console.error('[GeniusPay webhook] Métadonnées manquantes (reference/paymentId/schemaName)')
      return NextResponse.json({ error: 'Missing metadata fields' }, { status: 400 })
    }

    // Signature vérifiée avec le secret de l'école (repli global)
    const cfg = await getSchoolPaymentConfig(schemaName)
    const isValid = await verifyWebhookSignature(rawBody, timestamp, signature, cfg?.webhookSecret ?? undefined)
    if (!isValid) {
      console.error('[GeniusPay webhook] Signature invalide')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // On revérifie le statut côté PSP de l'école (ne pas se fier au seul payload)
    const verification = await verifySchoolPayment(schemaName, 'GENIUSPAY', reference)
    const db = getTenantPrisma(schemaName) as any

    if (verification.status === 'ACCEPTED') {
      await db.$executeRaw`
        UPDATE payments
        SET status = 'SUCCESS', paid_at = NOW()
        WHERE id = ${paymentId} AND provider_ref = ${reference}
      `
      console.info(`[GeniusPay webhook] Paiement ${paymentId} confirmé (${reference})`)
    } else if (verification.status === 'REFUSED') {
      await db.$executeRaw`
        UPDATE payments
        SET status = 'FAILED'
        WHERE id = ${paymentId} AND provider_ref = ${reference}
      `
      console.warn(`[GeniusPay webhook] Paiement ${paymentId} refusé (${reference})`)
    }
    // PENDING / processing : on attend une prochaine notification

    return NextResponse.json({ received: true })
  } catch (e: any) {
    console.error('[GeniusPay webhook] Erreur inattendue:', e?.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GeniusPay peut envoyer un GET pour tester l'URL
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
