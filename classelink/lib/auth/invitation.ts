import { nanoid } from 'nanoid'

/**
 * Invitation « définir mon mot de passe » pour les comptes créés sans mot de
 * passe (inscription via l'API ou acceptation d'une candidature).
 *
 * On réutilise volontairement le mécanisme existant de réinitialisation
 * (actions/auth.ts : clé Redis `reset:<token>` consommée par
 * resetPasswordAction et la page /reset-password) : même format de charge
 * utile, mais une durée de vie de 7 jours au lieu de 15 minutes, car un
 * parent n'ouvre pas forcément l'email tout de suite.
 */
const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60

export interface InvitationTarget {
  userId:     string
  schemaName: string
  email:      string
}

/** Échappe le HTML : les noms viennent d'un formulaire public ou d'une API tierce. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Crée le jeton et renvoie l'URL d'invitation, ou null si Redis n'est pas
 * configuré / injoignable (l'appelant continue : le compte existe, l'admin
 * pourra renvoyer un accès depuis la fiche).
 */
export async function createInvitationLink(target: InvitationTarget): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  try {
    const { Redis } = await import('@upstash/redis')
    const redis = new Redis({ url, token })
    const secret = nanoid(32)
    await redis.setex(
      `reset:${secret}`,
      INVITATION_TTL_SECONDS,
      JSON.stringify({ userId: target.userId, schemaName: target.schemaName, email: target.email }),
    )
    return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/reset-password?token=${secret}`
  } catch {
    return null
  }
}

/** Envoie l'email d'invitation. Ne lève jamais : un échec d'email ne doit pas annuler une inscription. */
export async function sendInvitationEmail(params: {
  to:            string
  recipientName: string
  schoolName:    string
  studentName:   string
  link:          string
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`,
      to: params.to,
      subject: `Activez votre accès MyClassLink — ${params.schoolName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1800ad;">Bienvenue à ${esc(params.schoolName)}</h2>
          <p>Bonjour ${esc(params.recipientName)},</p>
          <p>L'inscription de <strong>${esc(params.studentName)}</strong> a été enregistrée.
             Pour accéder à votre espace MyClassLink, définissez votre mot de passe :</p>
          <a href="${esc(params.link)}"
             style="display:inline-block;background:#1800ad;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">
            Définir mon mot de passe
          </a>
          <p style="color:#6b7280;font-size:12px;">
            Ce lien est valable 7 jours. Passé ce délai, utilisez « Mot de passe oublié » sur la page de connexion.
          </p>
        </div>
      `,
    })
    return true
  } catch {
    return false
  }
}
