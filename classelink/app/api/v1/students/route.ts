import { NextRequest, NextResponse } from 'next/server'
import { authenticateEnrollmentKey, apiError, provisionErrorResponse } from '@/lib/enrollment/api-auth'
import { provisionStudent } from '@/lib/enrollment/provision'
import { apiStudentSchema, toProvisionInput } from '@/lib/enrollment/validation'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 100_000

/**
 * POST /api/v1/students — inscrit directement un élève (et son parent).
 *
 * Authentification : `Authorization: Bearer mcl_<école>.<secret>`.
 * Idempotent grâce à `externalId` : rejouer la même requête renvoie l'élève
 * existant (200) au lieu d'en créer un second (201).
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateEnrollmentKey(req)
  if (auth instanceof NextResponse) return auth

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return apiError('PAYLOAD_TOO_LARGE', 'Corps de requête trop volumineux.', 413)

  let json: unknown
  try { json = JSON.parse(raw) } catch { return apiError('INVALID_JSON', 'Le corps doit être du JSON valide.', 400) }

  const parsed = apiStudentSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return apiError('VALIDATION_ERROR', `${issue.path.join('.') || 'corps'} : ${issue.message}`, 422)
  }

  try {
    const result = await provisionStudent(auth.db, auth.ctx, toProvisionInput(parsed.data))
    return NextResponse.json({ data: result }, { status: result.created ? 201 : 200 })
  } catch (e) {
    return provisionErrorResponse(e)
  }
}
