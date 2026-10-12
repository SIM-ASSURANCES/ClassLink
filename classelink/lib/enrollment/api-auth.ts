import { createHash, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { publicPrisma } from '@/lib/db/public'
import { getTenantPrisma } from '@/lib/db/tenant'
import { rateLimit } from '@/lib/rate-limit'
import { loadSchoolContext, ProvisionError, type SchoolContext } from './provision'
import { ensureEnrollmentSchema } from './schema'

/**
 * Authentification machine-à-machine de l'API d'inscription (/api/v1).
 *
 * Format de clé : `mcl_<slug-école>.<secret>`. Le slug fait partie de la clé
 * pour retrouver l'école SANS session ni sous-domaine (la requête vient d'un
 * serveur tiers). Seul le hash SHA-256 du secret est stocké : la clé est
 * aléatoire (256 bits), donc un hash rapide suffit — contrairement à un mot
 * de passe humain, il n'y a rien à « deviner » par force brute.
 */

const KEY_RE = /^mcl_([a-z0-9-]{1,64})\.([A-Za-z0-9_-]{32,128})$/

const REQUESTS_PER_MINUTE = 120

export function apiError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}

/** Traduit une erreur du cœur de création en réponse d'API ; toute autre erreur reste opaque (500). */
export function provisionErrorResponse(e: unknown): NextResponse {
  if (e instanceof ProvisionError) return apiError(e.code, e.message, e.status)
  console.error('[API v1] Erreur inattendue :', (e as Error)?.message)
  return apiError('INTERNAL_ERROR', 'Erreur interne.', 500)
}

export function hashApiKey(fullKey: string): string {
  return createHash('sha256').update(fullKey).digest('hex')
}

export function generateApiKey(slug: string): { fullKey: string; prefix: string; hash: string } {
  const secret  = randomBytes(32).toString('base64url') // 43 caractères
  const fullKey = `mcl_${slug}.${secret}`
  return { fullKey, prefix: `mcl_${slug}.${secret.slice(0, 6)}…`, hash: hashApiKey(fullKey) }
}

export interface AuthenticatedApiRequest {
  db:    any
  ctx:   SchoolContext
  keyId: string
}

/**
 * Vérifie la clé Bearer, résout l'école et applique la limitation de débit.
 * Renvoie soit le contexte authentifié, soit directement la réponse d'erreur.
 */
export async function authenticateEnrollmentKey(
  req: NextRequest,
): Promise<AuthenticatedApiRequest | NextResponse> {
  const header = req.headers.get('authorization') ?? ''
  const match  = KEY_RE.exec(header.startsWith('Bearer ') ? header.slice(7).trim() : '')
  // Même message pour « clé mal formée », « école inconnue » et « clé inconnue » :
  // ne rien révéler sur l'existence d'une école.
  if (!match) return apiError('UNAUTHORIZED', 'Clé API manquante ou invalide.', 401)

  const school = await (publicPrisma as any).school.findUnique({
    where:  { slug: match[1] },
    select: { schemaName: true, status: true },
  })
  if (!school) return apiError('UNAUTHORIZED', 'Clé API manquante ou invalide.', 401)
  if (!['ACTIVE', 'TRIAL'].includes(school.status)) {
    return apiError('SCHOOL_INACTIVE', 'Cet établissement n\'accepte pas de requêtes pour le moment.', 403)
  }

  const db = getTenantPrisma(school.schemaName) as any
  await ensureEnrollmentSchema(db)

  const keys: any[] = await db.$queryRaw`
    SELECT id FROM enrollment_api_keys WHERE key_hash = ${hashApiKey(match[0])} AND is_active = TRUE LIMIT 1
  `
  if (!keys[0]) return apiError('UNAUTHORIZED', 'Clé API manquante ou invalide.', 401)
  const keyId: string = keys[0].id

  const allowed = await rateLimit(`v1:${school.schemaName}:${keyId}`, REQUESTS_PER_MINUTE, 60_000)
  if (!allowed) return apiError('RATE_LIMITED', 'Trop de requêtes. Réessayez dans une minute.', 429)

  const ctx = await loadSchoolContext(school.schemaName)
  if (!ctx) return apiError('SCHOOL_INACTIVE', 'Cet établissement n\'accepte pas de requêtes pour le moment.', 403)

  // Traçabilité « dernière utilisation » — ne doit jamais bloquer la requête.
  db.$executeRaw`UPDATE enrollment_api_keys SET last_used_at = NOW() WHERE id = ${keyId}`.catch(() => {})

  return { db, ctx, keyId }
}
