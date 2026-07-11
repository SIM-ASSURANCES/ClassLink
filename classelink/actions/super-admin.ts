'use server'

import { revalidatePath } from 'next/cache'
import { nanoid, customAlphabet } from 'nanoid'

// Alphabet restreint (sans tiret) — le nom de schéma est injecté dans du SQL
// brut via search_path et validé par SCHEMA_RE (lib/db/tenant.ts) qui
// n'accepte que [a-z0-9] après "school_".
const schemaSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { publicPrisma } from '@/lib/db/public'
import { createTenantSchema, dropTenantSchema, getTenantPrisma } from '@/lib/db/tenant'
import { requireRole } from '@/lib/auth/rbac'
import { toActionError } from '@/lib/errors'
import type { ActionResult, PaginatedResult } from '@/types'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Pool } from 'pg'

const db = publicPrisma as any

// ─── Schémas de validation ────────────────────────────────────────────────────
const createSchoolSchema = z.object({
  name: z.string().min(3, 'Nom requis (min 3 caractères)'),
  adminEmail: z.string().email('Email administrateur invalide'),
  adminFirstName: z.string().min(2, 'Prénom requis'),
  adminLastName: z.string().min(2, 'Nom requis'),
  adminPassword: z.string().min(8, 'Mot de passe minimum 8 caractères'),
  planId: z.string().min(1, 'Plan requis'),
  city: z.string().optional(),
  country: z.string().default('CI'),
  phone: z.string().optional(),
})

const updateSchoolSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(3).optional(),
  status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED']).optional(),
  planId: z.string().optional(),
  superAdminNotes: z.string().optional(),
})

// ─── KPIs globaux ─────────────────────────────────────────────────────────────
export async function getSuperAdminKPIs() {
  await requireRole('SUPER_ADMIN')

  const [
    totalSchools,
    activeSchools,
    trialSchools,
    suspendedSchools,
    recentSchools,
    recentPayments,
  ] = await Promise.all([
    db.school.count(),
    db.school.count({ where: { status: 'ACTIVE' } }),
    db.school.count({ where: { status: 'TRIAL' } }),
    db.school.count({ where: { status: 'SUSPENDED' } }),
    db.school.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { name: true } } },
    }),
    db.globalPayment.findMany({
      take: 5,
      where: { status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: {
          include: { school: { select: { name: true } } },
        },
      },
    }),
  ])

  // Calcul MRR : somme des plans actifs
  const activeSubscriptions = await db.subscription.findMany({
    where: { status: 'ACTIVE' },
    include: { school: { include: { plan: true } } },
  })

  const mrr = activeSubscriptions.reduce((sum: number, sub: any) => {
    const price =
      sub.billing === 'YEARLY'
        ? Math.round(sub.school.plan.priceYearly / 12)
        : sub.school.plan.priceMonthly
    return sum + price
  }, 0)

  return {
    totalSchools,
    activeSchools,
    trialSchools,
    suspendedSchools,
    mrr,
    arr: mrr * 12,
    recentSchools,
    recentPayments,
  }
}

// ─── Liste des écoles (paginée) ───────────────────────────────────────────────
export async function getSchools(params: {
  page?: number
  search?: string
  status?: string
  planId?: string
} = {}): Promise<PaginatedResult<any>> {
  await requireRole('SUPER_ADMIN')

  const page = params.page ?? 1
  const perPage = 20
  const skip = (page - 1) * perPage

  const where: any = {}
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { adminEmail: { contains: params.search, mode: 'insensitive' } },
      { subdomain: { contains: params.search, mode: 'insensitive' } },
    ]
  }
  if (params.status) where.status = params.status
  if (params.planId) where.planId = params.planId

  const [data, total] = await Promise.all([
    db.school.findMany({
      where,
      skip,
      take: perPage,
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { name: true, slug: true } } },
    }),
    db.school.count({ where }),
  ])

  return { data, total, page, perPage, totalPages: Math.ceil(total / perPage) }
}

// ─── Détail d'une école ────────────────────────────────────────────────────────
export async function getSchoolById(id: string) {
  await requireRole('SUPER_ADMIN')
  return db.school.findUnique({
    where: { id },
    include: {
      plan: true,
      subscription: { include: { payments: { take: 10, orderBy: { createdAt: 'desc' } } } },
    },
  })
}

// ─── Créer une école ──────────────────────────────────────────────────────────
export async function createSchool(
  prevState: ActionResult<{ schoolId: string; slug: string }> | null,
  formData: FormData
): Promise<ActionResult<{ schoolId: string; slug: string }>> {
  await requireRole('SUPER_ADMIN')

  const parsed = createSchoolSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { adminEmail, adminFirstName, adminLastName, adminPassword, planId, ...schoolData } =
    parsed.data

  try {
    // Générer un slug unique
    const baseSlug = schoolData.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 30)
    const slug = `${baseSlug}-${nanoid(4).toLowerCase()}`
    const schemaName = `school_${schemaSuffix()}`

    // 1. Créer l'entrée dans le schéma public
    const school = await db.school.create({
      data: {
        ...schoolData,
        slug,
        schemaName,
        adminEmail,
        planId,
        status: 'TRIAL',
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 jours
      },
    })

    // 2. Créer le schéma PostgreSQL
    await createTenantSchema(schemaName)

    // 3. Appliquer le schéma tenant via pg directement (supporte plusieurs statements)
    const sqlPath = join(process.cwd(), 'prisma', 'tenant-schema.sql')
    const sql = readFileSync(sqlPath, 'utf-8')

    const pgPool = new Pool({ connectionString: process.env.DATABASE_URL })
    const pgClient = await pgPool.connect()
    try {
      await pgClient.query(`SET search_path = "${schemaName}", public`)
      await pgClient.query(sql)
    } finally {
      pgClient.release()
      await pgPool.end()
    }

    // 4. Créer l'administrateur de l'école (SQL brut — schéma tenant)
    const passwordHash = await hash(adminPassword, 12)
    const tenantDb = getTenantPrisma(schemaName) as any
    await tenantDb.$executeRaw`
      INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
      VALUES (${adminEmail}, ${passwordHash}, ${adminFirstName}, ${adminLastName}, 'ADMIN', TRUE)
    `

    // 5. Créer l'abonnement initial (statut TRIALING — 30 jours d'essai, forfait annuel)
    const now = new Date()
    await db.subscription.create({
      data: {
        schoolId:           school.id,
        planId,
        billing:            'YEARLY',
        status:             'TRIALING',
        currentPeriodStart: now,
        currentPeriodEnd:   new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    // 6. Log global
    await db.globalAuditLog.create({
      data: {
        schoolId: school.id,
        action: 'CREATE',
        resource: 'SCHOOL',
        resourceId: school.id,
        metadata: { slug, schemaName },
      },
    })

    revalidatePath('/super-admin/schools')
    return { success: true, data: { schoolId: school.id, slug } }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── Mettre à jour une école ──────────────────────────────────────────────────
export async function updateSchool(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole('SUPER_ADMIN')

  const parsed = updateSchoolSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    const { id, ...data } = parsed.data
    await db.school.update({ where: { id }, data })

    await db.globalAuditLog.create({
      data: { schoolId: id, action: 'UPDATE', resource: 'SCHOOL', resourceId: id, metadata: data },
    })

    revalidatePath('/super-admin/schools')
    revalidatePath(`/super-admin/schools/${id}`)
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── Suspendre / Activer une école ────────────────────────────────────────────
export async function toggleSchoolStatus(schoolId: string, suspend: boolean): Promise<void> {
  await requireRole('SUPER_ADMIN')

  try {
    await db.school.update({
      where: { id: schoolId },
      data: { status: suspend ? 'SUSPENDED' : 'ACTIVE' },
    })

    await db.globalAuditLog.create({
      data: {
        schoolId,
        action: suspend ? 'SUSPEND' : 'ACTIVATE',
        resource: 'SCHOOL',
        resourceId: schoolId,
      },
    })

    revalidatePath('/super-admin/schools')
  } catch {
    // Erreur silencieuse — sera visible via Sentry en prod
  }
}

// ─── Prolonger la période d'essai ─────────────────────────────────────────────
export async function extendTrial(schoolId: string, days: number): Promise<void> {
  await requireRole('SUPER_ADMIN')

  try {
    const school = await db.school.findUnique({ where: { id: schoolId } })
    if (!school) return

    const base = school.trialEndsAt && school.trialEndsAt > new Date()
      ? school.trialEndsAt
      : new Date()
    const newDate = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)

    await db.school.update({
      where: { id: schoolId },
      data: { trialEndsAt: newDate, status: 'TRIAL' },
    })

    revalidatePath(`/super-admin/schools/${schoolId}`)
  } catch {
    // Erreur silencieuse
  }
}

// ─── Supprimer un établissement ───────────────────────────────────────────────
export async function deleteSchool(schoolId: string): Promise<ActionResult> {
  await requireRole('SUPER_ADMIN')
  try {
    const school = await db.school.findUnique({
      where: { id: schoolId },
      include: { subscription: true },
    })
    if (!school) return { success: false, error: 'Établissement introuvable.' }

    if (school.subscription) {
      await db.globalPayment.deleteMany({ where: { subscriptionId: school.subscription.id } })
      await db.subscription.delete({ where: { id: school.subscription.id } })
    }
    await db.globalAuditLog.deleteMany({ where: { schoolId } })
    await dropTenantSchema(school.schemaName)
    await db.school.delete({ where: { id: schoolId } })

    revalidatePath('/super-admin/schools')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── Plans tarifaires ─────────────────────────────────────────────────────────
export async function getPlans() {
  await requireRole('SUPER_ADMIN')
  return db.plan.findMany({ orderBy: { priceYearly: 'asc' } })
}

const planSchema = z.object({
  name:            z.string().min(2, 'Nom requis (min 2 caractères)'),
  slug:            z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug invalide (minuscules, chiffres, tirets)'),
  priceMonthly:    z.coerce.number().min(0, 'Prix mensuel invalide'),
  priceYearly:     z.coerce.number().min(0, 'Prix annuel invalide'),
  maxStudents:     z.coerce.number().min(1, 'Nombre d\'élèves requis'),
  maxStorageMb:    z.coerce.number().min(100, 'Stockage minimum 100 Mo'),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  features:        z.string().optional(),
})

export async function createPlan(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole('SUPER_ADMIN')
  const parsed = planSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  try {
    const features = (parsed.data.features ?? '').split('\n').map((f: string) => f.trim()).filter(Boolean)
    const { features: _f, ...rest } = parsed.data
    await db.plan.create({ data: { ...rest, features, isActive: true } })
    revalidatePath('/super-admin/plans')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

export async function updatePlan(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole('SUPER_ADMIN')
  const id = formData.get('id') as string
  const parsed = planSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  try {
    const features = (parsed.data.features ?? '').split('\n').map((f: string) => f.trim()).filter(Boolean)
    const { features: _f, ...rest } = parsed.data
    await db.plan.update({ where: { id }, data: { ...rest, features } })
    revalidatePath('/super-admin/plans')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

export async function togglePlanActive(planId: string, isActive: boolean): Promise<ActionResult> {
  await requireRole('SUPER_ADMIN')
  try {
    await db.plan.update({ where: { id: planId }, data: { isActive } })
    revalidatePath('/super-admin/plans')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

export async function deletePlan(planId: string): Promise<ActionResult> {
  await requireRole('SUPER_ADMIN')
  try {
    const count = await db.school.count({ where: { planId } })
    if (count > 0) {
      return { success: false, error: `Ce plan est utilisé par ${count} établissement(s). Réaffectez-les d'abord.` }
    }
    await db.plan.delete({ where: { id: planId } })
    revalidatePath('/super-admin/plans')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── Abonnements ──────────────────────────────────────────────────────────────
export async function getSubscriptions(params: {
  page?:   number
  status?: string
  planId?: string
  search?: string
} = {}): Promise<PaginatedResult<any>> {
  await requireRole('SUPER_ADMIN')
  const page    = params.page ?? 1
  const perPage = 20
  const skip    = (page - 1) * perPage

  const where: any = {}
  if (params.status) where.status = params.status
  if (params.planId) where.planId = params.planId
  if (params.search) where.school = { name: { contains: params.search, mode: 'insensitive' } }

  const [data, total] = await Promise.all([
    db.subscription.findMany({
      where,
      skip,
      take: perPage,
      orderBy: { currentPeriodEnd: 'asc' },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            status: true,
            adminEmail: true,
            plan: { select: { id: true, name: true, priceMonthly: true, priceYearly: true } },
          },
        },
        payments: { take: 3, orderBy: { createdAt: 'desc' } },
      },
    }),
    db.subscription.count({ where }),
  ])
  return { data, total, page, perPage, totalPages: Math.ceil(total / perPage) }
}

export async function getSubscriptionStats() {
  await requireRole('SUPER_ADMIN')
  const [active, pastDue, cancelled, trialing] = await Promise.all([
    db.subscription.count({ where: { status: 'ACTIVE' } }),
    db.subscription.count({ where: { status: 'PAST_DUE' } }),
    db.subscription.count({ where: { status: 'CANCELLED' } }),
    db.subscription.count({ where: { status: 'TRIALING' } }),
  ])
  return { active, pastDue, cancelled, trialing }
}

export async function backfillMissingSubscriptions(): Promise<ActionResult<{ created: number }>> {
  await requireRole('SUPER_ADMIN')
  try {
    // Récupère toutes les écoles sans abonnement
    const schools = await db.school.findMany({
      where: { subscription: null },
      select: { id: true, planId: true, status: true, createdAt: true },
    })

    if (schools.length === 0) {
      return { success: true, data: { created: 0 } }
    }

    const now = new Date()
    await db.subscription.createMany({
      data: schools.map((s: any) => ({
        schoolId:           s.id,
        planId:             s.planId,
        billing:            'YEARLY',
        status:             s.status === 'ACTIVE' ? 'ACTIVE' : 'TRIALING',
        currentPeriodStart: s.createdAt,
        currentPeriodEnd:   new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      })),
    })

    revalidatePath('/super-admin/subscriptions')
    return { success: true, data: { created: schools.length } }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

export async function updateSubscription(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole('SUPER_ADMIN')
  const id = formData.get('id') as string
  try {
    const data: any = {}
    const planId          = formData.get('planId')          as string
    const billing         = formData.get('billing')         as string
    const status          = formData.get('status')          as string
    const discountPercent = formData.get('discountPercent') as string
    const promoCode       = formData.get('promoCode')       as string

    if (planId)                                       data.planId          = planId
    if (billing)                                      data.billing         = billing
    if (status)                                       data.status          = status
    if (discountPercent !== null && discountPercent !== '') data.discountPercent = parseFloat(discountPercent)
    if (promoCode !== null)                           data.promoCode       = promoCode || null

    await db.subscription.update({ where: { id }, data })
    revalidatePath('/super-admin/subscriptions')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

export async function recordManualPayment(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireRole('SUPER_ADMIN')
  try {
    const subscriptionId = formData.get('subscriptionId') as string
    const amount         = parseFloat(formData.get('amount')      as string)
    const currency       = (formData.get('currency')      as string) || 'XOF'
    const provider       = (formData.get('provider')      as string) || 'MANUEL'
    const providerRef    = (formData.get('providerRef')   as string) || `MAN-${Date.now()}`

    if (isNaN(amount) || amount <= 0) return { success: false, error: 'Montant invalide' }

    await db.globalPayment.create({
      data: { subscriptionId, amount, currency, provider, providerRef, status: 'SUCCESS' },
    })
    revalidatePath('/super-admin/subscriptions')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── Monitoring ───────────────────────────────────────────────────────────────
export async function getMonitoringData() {
  await requireRole('SUPER_ADMIN')

  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)

  const [
    schoolCount,
    activeSchools,
    trialSchools,
    suspendedSchools,
    cancelledSchools,
    totalPayments,
    successPayments,
    failedPayments,
    totalRevenue,
    recentLogs,
    recentPaymentsRaw,
    schoolsWithPlan,
    subStatuses,
  ] = await Promise.all([
    db.school.count(),
    db.school.count({ where: { status: 'ACTIVE' } }),
    db.school.count({ where: { status: 'TRIAL' } }),
    db.school.count({ where: { status: 'SUSPENDED' } }),
    db.school.count({ where: { status: 'CANCELLED' } }),
    db.globalPayment.count(),
    db.globalPayment.count({ where: { status: 'SUCCESS' } }),
    db.globalPayment.count({ where: { status: 'FAILED' } }),
    db.globalPayment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
    db.globalAuditLog.findMany({
      take: 25,
      orderBy: { createdAt: 'desc' },
      include: { school: { select: { name: true } } },
    }),
    db.globalPayment.findMany({
      where: { status: 'SUCCESS', createdAt: { gte: sixMonthsAgo } },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.school.findMany({
      select: { planId: true, plan: { select: { name: true } } },
    }),
    db.subscription.groupBy({
      by:     ['status'],
      _count: { id: true },
    }),
  ])

  // Revenus mensuels (6 derniers mois, même si 0)
  const monthMap = new Map<string, number>()
  for (const p of recentPaymentsRaw) {
    const key = new Date(p.createdAt).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
    monthMap.set(key, (monthMap.get(key) ?? 0) + p.amount)
  }
  const monthlyRevenue: { month: string; amount: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setDate(1) // éviter le débordement de setMonth (ex. le 29 vers un mois sans 29 jours)
    d.setMonth(d.getMonth() - i)
    const key = d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
    monthlyRevenue.push({ month: key, amount: monthMap.get(key) ?? 0 })
  }

  // Distribution par plan (groupé en JS)
  const planDist = new Map<string, { name: string; count: number }>()
  for (const school of schoolsWithPlan) {
    const planName = (school as any).plan?.name ?? 'Sans plan'
    const key      = (school as any).planId      ?? 'none'
    planDist.set(key, { name: planName, count: (planDist.get(key)?.count ?? 0) + 1 })
  }

  const paymentSuccessRate = totalPayments > 0
    ? Math.round((successPayments / totalPayments) * 100)
    : 100

  const subStatusMap: Record<string, number> = {}
  for (const row of subStatuses) {
    subStatusMap[(row as any).status] = (row as any)._count.id
  }

  return {
    schoolCount,
    activeSchools,
    trialSchools,
    suspendedSchools,
    cancelledSchools,
    totalPayments,
    successPayments,
    failedPayments,
    paymentSuccessRate,
    totalRevenue:    totalRevenue._sum.amount ?? 0,
    recentLogs,
    monthlyRevenue,
    planDistribution: Array.from(planDist.values()),
    subStatusMap,
  }
}

// ─── Réparer le schéma tenant (si les tables n'ont pas été créées) ────────────
export async function repairTenantSchema(schoolId: string): Promise<ActionResult> {
  await requireRole('SUPER_ADMIN')

  try {
    const school = await db.school.findUnique({ where: { id: schoolId } })
    if (!school) return { success: false, error: 'École introuvable.' }

    const sqlPath = join(process.cwd(), 'prisma', 'tenant-schema.sql')
    const sql = readFileSync(sqlPath, 'utf-8')
    const { schemaName } = school

    // Valider le format du schéma avant tout usage dans du SQL brut
    if (!/^school_[a-z0-9]+$/.test(schemaName)) {
      return { success: false, error: 'Nom de schéma invalide — opération annulée.' }
    }

    // S'assurer que le schéma PostgreSQL existe
    await (publicPrisma as any).$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`
    )

    // Appliquer le DDL complet en une passe
    const pgPool = new Pool({ connectionString: process.env.DATABASE_URL })
    const pgClient = await pgPool.connect()
    try {
      await pgClient.query(`SET search_path = "${schemaName}", public`)
      await pgClient.query(sql)
    } finally {
      pgClient.release()
      await pgPool.end()
    }

    revalidatePath(`/super-admin/schools/${schoolId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── Migrer toutes les écoles (ré-applique le DDL idempotent à chaque schéma) ──
export async function migrateAllTenants(): Promise<ActionResult<{ migrated: number; failed: string[] }>> {
  await requireRole('SUPER_ADMIN')

  try {
    const sqlPath = join(process.cwd(), 'prisma', 'tenant-schema.sql')
    const sql = readFileSync(sqlPath, 'utf-8')

    const schools: { schemaName: string }[] = await db.school.findMany({
      select: { schemaName: true },
    })

    const failed: string[] = []
    let migrated = 0

    const pgPool = new Pool({ connectionString: process.env.DATABASE_URL })
    try {
      for (const { schemaName } of schools) {
        const pgClient = await pgPool.connect()
        try {
          await pgClient.query(`SET search_path = "${schemaName}", public`)
          await pgClient.query(sql)
          migrated++
        } catch {
          failed.push(schemaName)
        } finally {
          pgClient.release()
        }
      }
    } finally {
      await pgPool.end()
    }

    return { success: true, data: { migrated, failed } }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}
