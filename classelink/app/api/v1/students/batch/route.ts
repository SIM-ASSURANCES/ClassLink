import { NextRequest, NextResponse } from 'next/server'
import { authenticateEnrollmentKey, apiError } from '@/lib/enrollment/api-auth'
import { provisionStudent, ProvisionError } from '@/lib/enrollment/provision'
import { apiBatchSchema, toProvisionInput } from '@/lib/enrollment/validation'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 1_000_000

/**
 * POST /api/v1/students/batch — jusqu'à 100 élèves par requête.
 *
 * Chaque élève est traité dans sa PROPRE transaction : un élément en échec
 * (classe pleine, doublon…) n'annule pas les autres. La réponse est toujours
 * 200 avec un résultat par élément, dans l'ordre d'envoi.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateEnrollmentKey(req)
  if (auth instanceof NextResponse) return auth

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return apiError('PAYLOAD_TOO_LARGE', 'Corps de requête trop volumineux.', 413)

  let json: unknown
  try { json = JSON.parse(raw) } catch { return apiError('INVALID_JSON', 'Le corps doit être du JSON valide.', 400) }

  const parsed = apiBatchSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return apiError('VALIDATION_ERROR', `${issue.path.join('.') || 'corps'} : ${issue.message}`, 422)
  }

  // Séquentiel volontairement : évite que 100 transactions concurrentes
  // saturent le pool (5 connexions par école) et fausse le contrôle de capacité.
  const results: Array<Record<string, unknown>> = []
  for (const [index, item] of parsed.data.students.entries()) {
    try {
      const result = await provisionStudent(auth.db, auth.ctx, toProvisionInput(item))
      results.push({ index, externalId: item.externalId ?? null, status: result.created ? 'created' : 'existing', data: result })
    } catch (e) {
      if (e instanceof ProvisionError) {
        results.push({ index, externalId: item.externalId ?? null, status: 'error', error: { code: e.code, message: e.message } })
      } else {
        console.error('[API v1 batch] Erreur inattendue :', (e as Error)?.message)
        results.push({ index, externalId: item.externalId ?? null, status: 'error', error: { code: 'INTERNAL_ERROR', message: 'Erreur interne.' } })
      }
    }
  }

  const count = (s: string) => results.filter(r => r.status === s).length
  return NextResponse.json({
    summary: { total: results.length, created: count('created'), existing: count('existing'), errors: count('error') },
    results,
  })
}
