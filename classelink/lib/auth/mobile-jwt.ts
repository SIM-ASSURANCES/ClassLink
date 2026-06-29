import { SignJWT, jwtVerify } from 'jose'

/**
 * Récupère le secret de signature des tokens mobiles.
 * Échoue volontairement (fail-fast) si aucun secret n'est configuré : il ne doit
 * jamais exister de valeur de repli codée en dur (un attaquant la connaîtrait et
 * pourrait forger des tokens pour n'importe quel utilisateur/école/rôle).
 */
function getSecret(): Uint8Array {
  const secret = process.env.MOBILE_JWT_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error(
      'MOBILE_JWT_SECRET (ou à défaut NEXTAUTH_SECRET) est requis pour signer/vérifier les tokens mobiles.'
    )
  }
  return new TextEncoder().encode(secret)
}

export interface MobileJWTPayload {
  userId:     string
  role:       string
  schemaName: string
  schoolId:   string
  iat?:       number
  exp?:       number
}

export async function signMobileToken(payload: MobileJWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())
}

export async function signMobileRefreshToken(payload: Pick<MobileJWTPayload, 'userId' | 'schemaName' | 'schoolId'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret())
}

export async function verifyMobileToken(token: string): Promise<MobileJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as MobileJWTPayload
  } catch {
    return null
  }
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}
