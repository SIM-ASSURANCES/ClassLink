'use server'

import { nanoid, customAlphabet } from 'nanoid'

// Alphabet restreint (sans tiret) — le nom de schéma est injecté dans du SQL
// brut via search_path et validé par SCHEMA_RE (lib/db/tenant.ts) qui
// n'accepte que [a-z0-9] après "school_".
const schemaSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Pool } from 'pg'
import { publicPrisma } from '@/lib/db/public'
import { createTenantSchema, dropTenantSchema, getTenantPrisma } from '@/lib/db/tenant'
import { toActionError } from '@/lib/errors'
import { initiatePayment, verifyPayment } from '@/lib/payments/geniuspay'
import { signIn } from '@/lib/auth/config'
import { mintAutoLoginToken } from '@/lib/auth/auto-login'
import type { ActionResult } from '@/types'

const db = publicPrisma as any

const registerSchema = z.object({
  schoolName:     z.string().min(3, 'Nom de l’établissement requis (min 3 caractères)'),
  city:           z.string().optional(),
  adminFirstName: z.string().min(2, 'Prénom requis'),
  adminLastName:  z.string().min(2, 'Nom requis'),
  adminEmail:     z.string().email('Email invalide'),
  adminPassword:  z.string().min(8, 'Mot de passe : 8 caractères minimum'),
  planSlug:       z.string().min(1, 'Forfait requis'),
})

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
}

// ─── 1. Inscription d'une école (self-service) ───────────────────────────────
export async function registerSchool(
  prevState: ActionResult<{ schoolId: string }> | null,
  formData: FormData
): Promise<ActionResult<{ schoolId: string }>> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { schoolName, city, adminFirstName, adminLastName, adminEmail, adminPassword, planSlug } =
    parsed.data
  const email = adminEmail.toLowerCase().trim()

  let schemaName: string | null = null
  try {
    // Vérifier le plan
    const plan = await db.plan.findUnique({ where: { slug: planSlug } })
    if (!plan || !plan.isActive) {
      return { success: false, error: 'Forfait introuvable.' }
    }

    // Email déjà utilisé par une autre école ?
    const existing = await db.school.findFirst({ where: { adminEmail: email } })
    if (existing) {
      return { success: false, error: 'Un compte existe déjà avec cet email.' }
    }

    const slug = `${slugify(schoolName)}-${nanoid(4).toLowerCase()}`
    schemaName = `school_${schemaSuffix()}`

    // 1. École (statut PENDING : pas d'accès tant que le paiement n'est pas validé)
    const school = await db.school.create({
      data: {
        name: schoolName,
        slug,
        city: city || null,
        adminEmail: email,
        planId: plan.id,
        schemaName,
        status: 'PENDING',
      },
    })

    // 2. Schéma PostgreSQL du tenant + tables
    await createTenantSchema(schemaName)
    const sql = readFileSync(join(process.cwd(), 'prisma', 'tenant-schema.sql'), 'utf-8')
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const client = await pool.connect()
    try {
      await client.query(`SET search_path = "${schemaName}", public`)
      await client.query(sql)
    } finally {
      client.release()
      await pool.end()
    }

    // 3. Administrateur de l'école + paramètres
    const passwordHash = await hash(adminPassword, 12)
    const tenantDb = getTenantPrisma(schemaName) as any
    await tenantDb.$executeRaw`
      INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
      VALUES (${email}, ${passwordHash}, ${adminFirstName}, ${adminLastName}, 'ADMIN', TRUE)
    `
    await tenantDb.$executeRaw`
      INSERT INTO school_settings (school_name, city) VALUES (${schoolName}, ${city || null})
    `

    // 4. Abonnement (en attente de paiement) — forfait annuel
    const now = new Date()
    await db.subscription.create({
      data: {
        schoolId: school.id,
        planId: plan.id,
        billing: 'YEARLY',
        status: 'TRIALING',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      },
    })

    return { success: true, data: { schoolId: school.id } }
  } catch (error) {
    // Rollback best-effort du schéma si créé
    if (schemaName) {
      try { await dropTenantSchema(schemaName) } catch { /* ignore */ }
    }
    return { success: false, error: toActionError(error) }
  }
}

// ─── 2. Initier le paiement de l'abonnement ──────────────────────────────────
export async function initiateSubscriptionPayment(
  schoolId: string
): Promise<ActionResult<{ paymentUrl?: string; redirect?: string }>> {
  try {
    const school = await db.school.findUnique({
      where: { id: schoolId },
      include: { plan: true, subscription: true },
    })
    if (!school) return { success: false, error: 'Établissement introuvable.' }
    if (school.status === 'ACTIVE') {
      return { success: true, data: { redirect: '/login' } }
    }

    const basePrice = school.plan.priceYearly as number
    const discount  = (school.plan as any).discountPercent ?? 0
    const amount    = discount > 0
      ? Math.round(basePrice * (1 - discount / 100))
      : basePrice

    // Forfait gratuit (le cas échéant) → activation immédiate, sans paiement
    if (amount <= 0) {
      await activateSchool(school.id, school.subscription?.id ?? null)
      return { success: true, data: { redirect: `/register/success?school=${school.id}` } }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const init = await initiatePayment({
      amount,
      description: `Abonnement ${school.plan.name} — ${school.name}`,
      customerId: school.id,
      customerName: school.name,
      customerEmail: school.adminEmail,
      returnUrl: `${baseUrl}/register/success?school=${school.id}`,
      notifyUrl: `${baseUrl}/api/webhooks/geniuspay`,
      metadata: { kind: 'subscription', schoolId: school.id, planId: school.planId },
    })

    // Enregistre le paiement SaaS (PENDING) avec la référence GeniusPay
    if (school.subscription) {
      await db.globalPayment.create({
        data: {
          subscriptionId: school.subscription.id,
          amount,
          currency: 'XOF',
          status: 'PENDING',
          provider: 'GENIUSPAY',
          providerRef: init.transactionId,
        },
      })
    }

    return { success: true, data: { paymentUrl: init.paymentUrl } }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── 3. Activer l'école (après paiement confirmé) ────────────────────────────
async function activateSchool(schoolId: string, subscriptionId: string | null): Promise<void> {
  const now = new Date()
  await db.school.update({
    where: { id: schoolId },
    data: { status: 'ACTIVE' },
  })
  if (subscriptionId) {
    await db.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      },
    })
  }
}

/**
 * Vérifie le paiement de l'abonnement auprès de GeniusPay et active l'école si confirmé.
 * Utilisé par le webhook ET par la page de retour (double sécurité).
 */
export async function activateSchoolIfPaid(
  schoolId: string
): Promise<{ activated: boolean; status: string }> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    include: { plan: true, subscription: { include: { payments: true } } },
  })
  if (!school) return { activated: false, status: 'NOT_FOUND' }
  if (school.status === 'ACTIVE') return { activated: true, status: 'ACTIVE' }

  // Forfait gratuit (le cas échéant)
  if ((school.plan.priceYearly as number) <= 0) {
    await activateSchool(school.id, school.subscription?.id ?? null)
    return { activated: true, status: 'ACTIVE' }
  }

  // Dernier paiement GeniusPay en attente
  const payments = school.subscription?.payments ?? []
  const pending = payments
    .filter((p: any) => p.providerRef)
    .sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]

  if (!pending?.providerRef) return { activated: false, status: 'NO_PAYMENT' }

  const verification = await verifyPayment(pending.providerRef)
  if (verification.status === 'ACCEPTED') {
    await db.globalPayment.update({ where: { id: pending.id }, data: { status: 'SUCCESS' } })
    await activateSchool(school.id, school.subscription?.id ?? null)
    return { activated: true, status: 'ACTIVE' }
  }
  if (verification.status === 'REFUSED') {
    await db.globalPayment.update({ where: { id: pending.id }, data: { status: 'FAILED' } })
    return { activated: false, status: 'FAILED' }
  }
  return { activated: false, status: 'PENDING' }
}

// ─── 3b. Connexion automatique après paiement ───────────────────────────────
export async function autoLoginAfterPayment(schoolId: string): Promise<ActionResult> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { adminEmail: true, status: true },
  })
  if (!school) return { success: false, error: 'Établissement introuvable.' }

  // S'assurer que l'école est active (active si paiement confirmé)
  if (school.status !== 'ACTIVE') {
    const res = await activateSchoolIfPaid(schoolId)
    if (!res.activated) {
      return { success: false, error: 'Le paiement n’est pas encore confirmé.' }
    }
  }

  const token = await mintAutoLoginToken(school.adminEmail)
  // signIn effectue la connexion puis redirige vers '/' (routé selon le rôle)
  await signIn('credentials', {
    email: school.adminEmail,
    autoLoginToken: token,
    redirectTo: '/',
  })
  return { success: true } // non atteint (signIn redirige)
}

// ─── 4. Contexte pour les pages paiement / succès ────────────────────────────
export async function getRegistrationInfo(schoolId: string): Promise<{
  schoolName: string
  status: string
  planName: string
  planSlug: string
  amount: number
} | null> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    include: { plan: true },
  })
  if (!school) return null
  const basePrice = school.plan.priceYearly
  const discount  = (school.plan as any).discountPercent ?? 0
  return {
    schoolName: school.name,
    status: school.status,
    planName: school.plan.name,
    planSlug: school.plan.slug,
    amount: discount > 0 ? Math.round(basePrice * (1 - discount / 100)) : basePrice,
  }
}
