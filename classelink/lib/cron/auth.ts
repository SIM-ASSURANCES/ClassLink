import { NextRequest } from 'next/server'

/**
 * Vérifie qu'une requête vers une route /api/cron/* provient bien de Vercel
 * Cron (en-tête `Authorization: Bearer ${CRON_SECRET}`, ajouté automatiquement
 * par Vercel quand la variable d'env CRON_SECRET est définie sur le projet).
 * En développement local (CRON_SECRET absent), la vérification est ignorée.
 */
export function isAuthorizedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${secret}`
}
