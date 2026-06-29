'use server'

import { signIn, signOut } from '@/lib/auth/config'
import { publicPrisma } from '@/lib/db/public'
import { getTenantPrisma, getSchemaFromHostname } from '@/lib/db/tenant'
import { toActionError } from '@/lib/errors'
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '@/lib/validations/auth'
import type { ActionResult } from '@/types'
import { hash } from 'bcryptjs'
import { nanoid } from 'nanoid'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { cookies } from 'next/headers'
import { requireRole, requireAuth } from '@/lib/auth/rbac'
import {
  generateTotpSecret,
  verifyTotp,
  buildOtpAuthUri,
  buildQrCodeUrl,
} from '@/lib/auth/totp'
import { rateLimit } from '@/lib/rate-limit'
import {
  TWO_FA_COOKIE,
  TWO_FA_MAX_AGE_S,
  buildSigned2FACookie,
} from '@/lib/auth/two-fa-cookie'

/**
 * Résout l'école (schemaName) à partir du sous-domaine de la requête courante.
 * Permet de ne cibler qu'un seul schéma à la connexion plutôt que de les scanner
 * tous. Retourne null si non résoluble (domaine apex, localhost) → repli sur scan.
 */
async function resolveSchemaFromHost(): Promise<string | null> {
  try {
    const host = (await headers()).get('host')
    return host ? await getSchemaFromHostname(host) : null
  } catch {
    return null
  }
}

// ─── Connexion ────────────────────────────────────────────────────────────────
export async function loginAction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  // Rate-limit: 10 attempts per email per 15 minutes
  const email = parsed.data.email.toLowerCase().trim()
  const allowed = await rateLimit(`login:${email}`, 10, 15 * 60 * 1000)
  if (!allowed) {
    return {
      success: false,
      error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
    }
  }

  try {
    // Cible l'école du sous-domaine si résoluble (login O(1)), sinon scan complet.
    const schemaHint = await resolveSchemaFromHost()
    await signIn('credentials', {
      ...parsed.data,
      ...(schemaHint ? { schemaName: schemaHint } : {}),
      redirectTo: '/',
    })
    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { success: false, error: 'Email ou mot de passe incorrect' }
        default:
          return { success: false, error: 'Erreur de connexion. Réessayez.' }
      }
    }
    throw error
  }
}

// ─── Connexion Google ─────────────────────────────────────────────────────────
export async function loginWithGoogle() {
  await signIn('google', { redirectTo: '/' })
}

// ─── Déconnexion ──────────────────────────────────────────────────────────────
export async function logoutAction() {
  await signOut({ redirectTo: '/login' })
}

// ─── Mot de passe oublié ──────────────────────────────────────────────────────
export async function forgotPasswordAction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { success: false, error: 'Email invalide' }
  }

  try {
    const { email } = parsed.data

    // Cible l'école du sous-domaine si résoluble, sinon scanne tous les tenants
    // actifs via le schéma public.
    const schemaHint = await resolveSchemaFromHost()
    const schools = schemaHint
      ? [{ schemaName: schemaHint, name: '' }]
      : await publicPrisma.school.findMany({
          where: { status: { in: ['TRIAL', 'ACTIVE'] } },
          select: { schemaName: true, name: true },
        })

    let found = false
    for (const school of schools) {
      try {
        const db = getTenantPrisma(school.schemaName)
        const user = await (db as any).user.findUnique({
          where: { email },
          select: { id: true, firstName: true },
        })

        if (user) {
          found = true
          const token = nanoid(32)
          const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

          // Stocker le token de réinitialisation (table dédiée en production)
          // Pour l'instant, on utilise Redis
          const { Redis } = await import('@upstash/redis')
          const redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
          })
          await redis.setex(
            `reset:${token}`,
            900,
            JSON.stringify({ userId: user.id, schemaName: school.schemaName, email })
          )

          // Envoyer l'email de réinitialisation
          const { Resend } = await import('resend')
          const resend = new Resend(process.env.RESEND_API_KEY)
          const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`

          await resend.emails.send({
            from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: 'Réinitialisation de votre mot de passe ClasseLink',
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                <h2 style="color: #2563eb;">Réinitialisation du mot de passe</h2>
                <p>Bonjour ${user.firstName},</p>
                <p>Vous avez demandé la réinitialisation de votre mot de passe sur ClasseLink.</p>
                <p>Cliquez sur le bouton ci-dessous dans les <strong>15 minutes</strong> :</p>
                <a href="${resetUrl}"
                   style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">
                  Réinitialiser mon mot de passe
                </a>
                <p style="color:#6b7280;font-size:12px;">
                  Si vous n'avez pas fait cette demande, ignorez cet email.<br>
                  Lien valable 15 minutes uniquement.
                </p>
              </div>
            `,
          })
          break
        }
      } catch {
        continue
      }
    }

    // Toujours retourner succès (sécurité : ne pas révéler si l'email existe)
    return {
      success: true,
      data: undefined,
    }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── Réinitialisation du mot de passe ────────────────────────────────────────
export async function resetPasswordAction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    const { token, password } = parsed.data

    const { Redis } = await import('@upstash/redis')
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })

    const data = await redis.get<{ userId: string; schemaName: string; email: string }>(
      `reset:${token}`
    )

    if (!data) {
      return { success: false, error: 'Lien expiré ou invalide. Refaites la demande.' }
    }

    const db = getTenantPrisma(data.schemaName)
    const passwordHash = await hash(password, 12)

    await (db as any).user.update({
      where: { id: data.userId },
      data: { passwordHash, updatedAt: new Date() },
    })

    // Invalider le token immédiatement
    await redis.del(`reset:${token}`)

    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

// ─── 2FA : Vérification lors de la connexion ─────────────────────────────────
export async function verify2FALoginAction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireAuth()
    const digits = Array.from({ length: 6 }, (_, i) => formData.get(`digit-${i}`) ?? '').join('')
    const code = digits.replace(/\s/g, '')

    if (!/^\d{6}$/.test(code)) {
      return { success: false, error: 'Le code doit contenir 6 chiffres.' }
    }

    const db = getTenantPrisma(session.user.schemaName) as any
    const rows: any[] = await db.$queryRaw`
      SELECT two_factor_secret FROM users WHERE id = ${session.user.id} LIMIT 1
    `
    const secret = rows[0]?.two_factor_secret
    if (!secret) return { success: false, error: '2FA non configuré pour ce compte.' }

    const valid = await verifyTotp(secret, code)
    if (!valid) return { success: false, error: 'Code incorrect ou expiré.' }

    // Stocker un cookie HMAC-signé de session 2FA
    const cookieStore = await cookies()
    cookieStore.set(TWO_FA_COOKIE, await buildSigned2FACookie(session.user.id!), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: TWO_FA_MAX_AGE_S,
      path: '/',
    })

    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur de vérification.' }
  }
}

// ─── 2FA : Générer un secret pour le setup ───────────────────────────────────
export async function generate2FASetupAction(): Promise<
  ActionResult<{ secret: string; qrCodeUrl: string; otpAuthUri: string }>
> {
  try {
    const session = await requireAuth()
    const secret = generateTotpSecret()
    const email = session.user.email ?? `user-${session.user.id}`
    const uri = buildOtpAuthUri(secret, email)
    return { success: true, data: { secret, qrCodeUrl: buildQrCodeUrl(uri), otpAuthUri: uri } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur.' }
  }
}

// ─── 2FA : Activer ───────────────────────────────────────────────────────────
export async function enable2FAAction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireAuth()
    const secret = formData.get('secret') as string
    const code = (formData.get('code') as string)?.replace(/\s/g, '')

    if (!secret || !/^\d{6}$/.test(code)) {
      return { success: false, error: 'Code ou secret manquant.' }
    }

    const valid = await verifyTotp(secret, code)
    if (!valid) return { success: false, error: 'Code incorrect. Vérifiez votre application authenticator.' }

    const db = getTenantPrisma(session.user.schemaName) as any
    await db.$executeRaw`
      UPDATE users
      SET two_factor_enabled = TRUE, two_factor_secret = ${secret}
      WHERE id = ${session.user.id}
    `
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur lors de l\'activation.' }
  }
}

// ─── 2FA : Désactiver ────────────────────────────────────────────────────────
export async function disable2FAAction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireAuth()
    const code = (formData.get('code') as string)?.replace(/\s/g, '')

    if (!/^\d{6}$/.test(code)) {
      return { success: false, error: 'Code invalide.' }
    }

    const db = getTenantPrisma(session.user.schemaName) as any
    const rows: any[] = await db.$queryRaw`
      SELECT two_factor_secret FROM users WHERE id = ${session.user.id} LIMIT 1
    `
    const secret = rows[0]?.two_factor_secret
    if (!secret) return { success: false, error: '2FA non activé.' }

    const valid = await verifyTotp(secret, code)
    if (!valid) return { success: false, error: 'Code incorrect.' }

    await db.$executeRaw`
      UPDATE users
      SET two_factor_enabled = FALSE, two_factor_secret = NULL
      WHERE id = ${session.user.id}
    `
    return { success: true, data: undefined }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Erreur lors de la désactivation.' }
  }
}
