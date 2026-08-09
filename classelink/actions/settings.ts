'use server'

import { getTenantPrisma } from '@/lib/db/tenant'
import { publicPrisma } from '@/lib/db/public'
import { requireRole } from '@/lib/auth/rbac'
import { revalidatePath } from 'next/cache'
import { toActionError } from '@/lib/errors'
import { encryptSecret, maskSecret } from '@/lib/crypto/secrets'
import type { ActionResult } from '@/types'

// Taille max d'un logo encodé en base64 (data URL). ~400 Ko de chaîne.
const MAX_LOGO_DATAURL_LEN = 400_000

async function getDb() {
  const session = await requireRole('ADMIN')
  const db = getTenantPrisma(session.user.schemaName) as any
  return { db, user: session.user }
}

// Colonnes ajoutées après le premier déploiement de school_settings — voir
// actions/transport.ts::ensureBusSubscriptionsTable pour le contexte de ce
// pattern d'auto-création idempotente.
async function ensureServicePriceColumns(db: any) {
  await db.$executeRawUnsafe(`ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS transport_monthly_price NUMERIC(10,2)`)
  await db.$executeRawUnsafe(`ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS cafeteria_price_lunch NUMERIC(10,2)`)
  await db.$executeRawUnsafe(`ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS cafeteria_price_snack NUMERIC(10,2)`)
  await db.$executeRawUnsafe(`ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS cafeteria_price_lunch_snack NUMERIC(10,2)`)
}

export async function getSchoolSlug(): Promise<string | null> {
  const session = await requireRole('ADMIN')
  const school = await (publicPrisma as any).school.findUnique({
    where: { schemaName: session.user.schemaName },
    select: { slug: true },
  })
  return school?.slug ?? null
}

// ─── Lire les paramètres de l'établissement ───────────────────────────────────
export async function getSchoolSettings(): Promise<any> {
  const { db } = await getDb()
  await ensureServicePriceColumns(db)

  const rows: any[] = await db.$queryRaw`
    SELECT
      id, school_name, address, city, phone, email,
      director_name AS principal_name, logo_url, updated_at,
      slogan, font_family, primary_color, secondary_color,
      payment_provider, payment_enabled,
      payment_api_key_enc, payment_api_secret_enc,
      payment_site_id_enc, payment_webhook_secret_enc,
      transport_monthly_price, cafeteria_price_lunch,
      cafeteria_price_snack, cafeteria_price_lunch_snack
    FROM school_settings
    LIMIT 1
  `
  const r = rows[0] ?? {}

  // Ne jamais renvoyer les secrets en clair : aperçus masqués + indicateurs de présence.
  return {
    ...r,
    payment_api_key_preview:        maskSecret(r.payment_api_key_enc),
    payment_api_secret_preview:     maskSecret(r.payment_api_secret_enc),
    payment_site_id_preview:        maskSecret(r.payment_site_id_enc),
    payment_webhook_secret_preview: maskSecret(r.payment_webhook_secret_enc),
    has_payment_keys: !!r.payment_api_key_enc,
    // Retirer les valeurs chiffrées de la réponse
    payment_api_key_enc:        undefined,
    payment_api_secret_enc:     undefined,
    payment_site_id_enc:        undefined,
    payment_webhook_secret_enc: undefined,
  }
}

// ─── Lire le plan d'abonnement actuel ─────────────────────────────────────────
export async function getSubscriptionInfo(): Promise<any> {
  const { db } = await getDb()

  const rows: any[] = await db.$queryRaw`
    SELECT
      s.id, s.status, s.plan_name, s.plan_slug,
      s.current_period_end, s.trial_ends_at,
      s.max_students, s.max_teachers
    FROM subscriptions s
    ORDER BY s.created_at DESC
    LIMIT 1
  `
  return rows[0] ?? null
}

// ─── Enregistrer les paramètres de l'établissement ───────────────────────────
export async function saveSchoolSettings(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { db } = await getDb()

  const school_name    = (formData.get('school_name')    as string)?.trim() || null
  const address        = (formData.get('address')        as string)?.trim() || null
  const city           = (formData.get('city')           as string)?.trim() || null
  const phone          = (formData.get('phone')          as string)?.trim() || null
  const email          = (formData.get('email')          as string)?.trim() || null
  const director_name  = (formData.get('principal_name') as string)?.trim() || null

  // ── Identité visuelle ──────────────────────────────────────────────────────
  const slogan          = (formData.get('slogan')          as string)?.trim() || null
  const font_family     = (formData.get('font_family')     as string)?.trim() || null
  const primary_color   = (formData.get('primary_color')   as string)?.trim() || null
  const secondary_color = (formData.get('secondary_color') as string)?.trim() || null
  const logo_url        = (formData.get('logo_url')        as string)?.trim() || null

  if (!school_name) {
    return { success: false, error: 'Le nom de l\'établissement est requis.' }
  }

  // Garde-fou : couleurs au format hex et logo base64 borné en taille
  const hexOk = (v: string | null) => v === null || /^#[0-9a-fA-F]{6}$/.test(v)
  if (!hexOk(primary_color) || !hexOk(secondary_color)) {
    return { success: false, error: 'Couleur invalide (format attendu : #RRGGBB).' }
  }
  if (logo_url && logo_url.length > MAX_LOGO_DATAURL_LEN) {
    return { success: false, error: 'Le logo est trop volumineux (max ~300 Ko).' }
  }
  if (logo_url && !/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/.test(logo_url) && !/^https?:\/\//.test(logo_url)) {
    return { success: false, error: 'Format de logo non pris en charge.' }
  }

  try {
    // Vérifier si un enregistrement existe
    const existing: any[] = await db.$queryRaw`
      SELECT id FROM school_settings LIMIT 1
    `

    if (existing[0]) {
      await db.$executeRaw`
        UPDATE school_settings
        SET
          school_name     = ${school_name},
          address         = ${address},
          city            = ${city},
          phone           = ${phone},
          email           = ${email},
          director_name   = ${director_name},
          slogan          = ${slogan},
          font_family     = ${font_family},
          primary_color   = ${primary_color},
          secondary_color = ${secondary_color},
          logo_url        = ${logo_url}
        WHERE id = ${existing[0].id}
      `
    } else {
      await db.$executeRaw`
        INSERT INTO school_settings
          (school_name, address, city, phone, email, director_name,
           slogan, font_family, primary_color, secondary_color, logo_url)
        VALUES
          (${school_name}, ${address}, ${city}, ${phone}, ${email}, ${director_name},
           ${slogan}, ${font_family}, ${primary_color}, ${secondary_color}, ${logo_url})
      `
    }

    revalidatePath('/admin/settings', 'layout')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── Enregistrer la configuration de paiement de l'école ──────────────────────
export async function savePaymentConfig(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { db } = await getDb()

  const provider = (formData.get('payment_provider') as string)?.trim() || null
  const enabled  = formData.get('payment_enabled') === 'on'

  if (provider && provider !== 'GENIUSPAY' && provider !== 'CINETPAY') {
    return { success: false, error: 'Fournisseur de paiement non pris en charge.' }
  }

  // Champs secrets : vide = conserver la valeur existante (ne pas écraser).
  const apiKey        = (formData.get('payment_api_key')        as string)?.trim() || ''
  const apiSecret     = (formData.get('payment_api_secret')     as string)?.trim() || ''
  const siteId        = (formData.get('payment_site_id')        as string)?.trim() || ''
  const webhookSecret = (formData.get('payment_webhook_secret') as string)?.trim() || ''

  if (enabled && !provider) {
    return { success: false, error: 'Sélectionnez un fournisseur avant d\'activer les paiements.' }
  }

  try {
    const existing: any[] = await db.$queryRaw`
      SELECT id, payment_api_key_enc FROM school_settings LIMIT 1
    `
    if (!existing[0]) {
      return { success: false, error: 'Enregistrez d\'abord les informations générales de l\'établissement.' }
    }
    if (enabled && !apiKey && !existing[0].payment_api_key_enc) {
      return { success: false, error: 'Renseignez au moins la clé API avant d\'activer les paiements.' }
    }

    const id = existing[0].id
    const key_enc           = apiKey        ? encryptSecret(apiKey)        : null
    const secret_enc        = apiSecret     ? encryptSecret(apiSecret)     : null
    const site_enc          = siteId        ? encryptSecret(siteId)        : null
    const webhook_enc       = webhookSecret ? encryptSecret(webhookSecret) : null

    // COALESCE(nouvelle valeur, valeur existante) → ne pas écraser un secret laissé vide.
    await db.$executeRaw`
      UPDATE school_settings
      SET
        payment_provider           = ${provider},
        payment_enabled            = ${enabled},
        payment_api_key_enc        = COALESCE(${key_enc},     payment_api_key_enc),
        payment_api_secret_enc     = COALESCE(${secret_enc},  payment_api_secret_enc),
        payment_site_id_enc        = COALESCE(${site_enc},    payment_site_id_enc),
        payment_webhook_secret_enc = COALESCE(${webhook_enc}, payment_webhook_secret_enc)
      WHERE id = ${id}
    `

    revalidatePath('/admin/settings')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── Tarifs des services payants en libre-service (transport, cantine) ───────
export async function saveServicePrices(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { db } = await getDb()
  await ensureServicePriceColumns(db)

  function parsePrice(field: string): number | null {
    const raw = (formData.get(field) as string)?.trim()
    if (!raw) return null
    const n = parseFloat(raw)
    if (isNaN(n) || n < 0) return NaN
    return n
  }

  const transport    = parsePrice('transport_monthly_price')
  const lunch        = parsePrice('cafeteria_price_lunch')
  const snack        = parsePrice('cafeteria_price_snack')
  const lunchSnack   = parsePrice('cafeteria_price_lunch_snack')

  if ([transport, lunch, snack, lunchSnack].some(v => typeof v === 'number' && isNaN(v))) {
    return { success: false, error: 'Tarif invalide.' }
  }

  try {
    const existing: any[] = await db.$queryRaw`SELECT id FROM school_settings LIMIT 1`
    if (!existing[0]) {
      return { success: false, error: 'Enregistrez d\'abord les informations générales de l\'établissement.' }
    }

    await db.$executeRaw`
      UPDATE school_settings
      SET
        transport_monthly_price     = ${transport},
        cafeteria_price_lunch       = ${lunch},
        cafeteria_price_snack       = ${snack},
        cafeteria_price_lunch_snack = ${lunchSnack}
      WHERE id = ${existing[0].id}
    `

    revalidatePath('/admin/settings')
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}
