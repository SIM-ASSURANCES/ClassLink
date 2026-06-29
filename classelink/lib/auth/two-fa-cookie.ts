/**
 * Helpers pour le cookie 2FA signé HMAC.
 * Ce module utilise Node.js `crypto` — ne pas importer dans Edge Runtime.
 */

export const TWO_FA_COOKIE     = '2fa_verified'
export const TWO_FA_MAX_AGE_S  = 12 * 60 * 60  // 12 heures en secondes
export const TWO_FA_MAX_AGE_MS = TWO_FA_MAX_AGE_S * 1000

/**
 * Récupère le secret de signature du cookie 2FA. Échoue (fail-fast) si `AUTH_SECRET`
 * est absent : pas de valeur de repli codée en dur, qui rendrait le cookie forgeable.
 */
function requireAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET est requis pour signer/vérifier le cookie 2FA.')
  }
  return secret
}

/**
 * Construit la valeur du cookie signée :
 *   `${userId}:${expiresAt}.${hmacHex}`
 */
export async function buildSigned2FACookie(userId: string): Promise<string> {
  const { createHmac } = await import('crypto')
  const secret    = requireAuthSecret()
  const expiresAt = Date.now() + TWO_FA_MAX_AGE_MS
  const payload   = `${userId}:${expiresAt}`
  const sig       = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${sig}`
}

/**
 * Vérifie la signature HMAC + userId + expiration du cookie.
 * Retourne `true` seulement si tout est valide.
 */
export async function verify2FACookie(value: string, userId: string): Promise<boolean> {
  try {
    const { createHmac } = await import('crypto')
    const secret      = requireAuthSecret()
    const lastDot     = value.lastIndexOf('.')
    if (lastDot === -1) return false
    const payload     = value.slice(0, lastDot)
    const sig         = value.slice(lastDot + 1)
    const [uid, expiresAtStr] = payload.split(':')
    if (uid !== userId) return false
    const expiresAt = parseInt(expiresAtStr, 10)
    if (isNaN(expiresAt) || Date.now() > expiresAt) return false
    const expectedSig = createHmac('sha256', secret).update(payload).digest('hex')
    // Constant-time comparison to prevent timing attacks
    if (sig.length !== expectedSig.length) return false
    let diff = 0
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i)
    }
    return diff === 0
  } catch {
    return false
  }
}
