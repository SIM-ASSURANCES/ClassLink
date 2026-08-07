import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getTenantPrisma } from '@/lib/db/tenant'
import { verifyMobileAccessToken, extractBearerToken } from '@/lib/auth/mobile-jwt'

interface IcsAuthResult {
  db: any
  userId: string
  role: string
}

/**
 * Authentifie une requête d'export .ics soit via la session web (cookie
 * next-auth), soit via le JWT mobile — passé en en-tête `Authorization`
 * (appels internes de l'app) OU en paramètre `?token=` (lien ouvert par le
 * navigateur/l'app Calendrier externe, qui ne porte pas les en-têtes de
 * l'app). Même principe que les liens iCal privés de Google Calendar :
 * un lien en lecture seule scoped aux événements de l'utilisateur.
 */
export async function authenticateIcsRequest(req: NextRequest): Promise<IcsAuthResult | null> {
  const session = await auth()
  if (session?.user) {
    return {
      db:     getTenantPrisma((session.user as any).schemaName) as any,
      userId: (session.user as any).id,
      role:   (session.user as any).role,
    }
  }

  const token = extractBearerToken(req.headers.get('authorization'))
    ?? req.nextUrl.searchParams.get('token')
  if (!token) return null

  const payload = await verifyMobileAccessToken(token)
  if (!payload) return null

  return {
    db:     getTenantPrisma(payload.schemaName) as any,
    userId: payload.userId,
    role:   payload.role,
  }
}
