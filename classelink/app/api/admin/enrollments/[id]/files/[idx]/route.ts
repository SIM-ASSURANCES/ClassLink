import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTenantPrisma } from '@/lib/db/tenant'
import { getSignedDownloadUrl } from '@/lib/storage/r2'
import { ensureEnrollmentSchema } from '@/lib/enrollment/schema'

export const runtime = 'nodejs'

/**
 * GET /api/admin/enrollments/:id/files/:idx — ouvre une pièce jointe d'une
 * candidature (acte de naissance, photo…). Les fichiers ne sont jamais servis
 * par une URL publique : l'admin connecté est redirigé vers une URL signée
 * valable 5 minutes.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; idx: string }> },
) {
  const session = await auth()
  const user = session?.user as { role?: string; schemaName?: string } | undefined
  if (!user?.schemaName) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!['ADMIN', 'CENSOR'].includes(user.role ?? '')) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
  }

  const { id, idx } = await params
  const index = Number(idx)
  if (!Number.isInteger(index) || index < 0) return NextResponse.json({ error: 'Pièce introuvable.' }, { status: 404 })

  const db = getTenantPrisma(user.schemaName) as any
  await ensureEnrollmentSchema(db)
  const rows: any[] = await db.$queryRaw`SELECT attachments FROM enrollment_applications WHERE id = ${id} LIMIT 1`
  const attachment = rows[0]?.attachments?.[index]
  if (!attachment?.key) return NextResponse.json({ error: 'Pièce introuvable.' }, { status: 404 })

  // Garde-fou : la clé doit appartenir au dossier de CETTE école et de CETTE candidature.
  if (!String(attachment.key).startsWith(`${user.schemaName}/enrollment/${id}/`)) {
    return NextResponse.json({ error: 'Pièce introuvable.' }, { status: 404 })
  }

  try {
    return NextResponse.redirect(await getSignedDownloadUrl(attachment.key, 300))
  } catch {
    return NextResponse.json({ error: 'Stockage indisponible.' }, { status: 503 })
  }
}
