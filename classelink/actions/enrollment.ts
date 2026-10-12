'use server'

import { randomUUID } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/rbac'
import { getTenantPrisma } from '@/lib/db/tenant'
import { publicPrisma } from '@/lib/db/public'
import { toActionError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { uploadFile } from '@/lib/storage/r2'
import { sendNotification } from '@/lib/notifications/service'
import { notifyUser } from '@/lib/notifications/create'
import { ensureEnrollmentSchema } from '@/lib/enrollment/schema'
import { DOCUMENT_DEFS, isEnrollmentOpen, loadEnrollmentSettings } from '@/lib/enrollment/config'
import { loadSchoolContext, provisionStudent, ProvisionError, splitFullName } from '@/lib/enrollment/provision'
import type { ActionResult, PaginatedResult } from '@/types'

// ─── Validation du formulaire public ──────────────────────────────────────────
class FieldError extends Error {}

const MAX_FILE_BYTES = 3 * 1024 * 1024
const RELATIONS = ['PARENT', 'TUTEUR', 'GRAND_PARENT', 'AUTRE']

/** Type réel du fichier d'après ses premiers octets — le type MIME envoyé par le client n'est pas fiable. */
function detectFileType(b: Buffer): { mime: string; label: string } | null {
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', label: 'PDF' }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', label: 'JPEG' }
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', label: 'PNG' }
  }
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { mime: 'image/webp', label: 'WebP' }
  }
  return null
}

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

// ─── Soumission publique (pas d'auth) ─────────────────────────────────────────
export async function submitEnrollmentApplication(
  slug: string,
  _prevState: ActionResult<{ applicationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ applicationId: string }>> {
  // Honeypot : champ invisible que seuls les robots remplissent. On fait
  // semblant de réussir pour ne pas leur apprendre qu'ils ont été repérés.
  if ((formData.get('website') as string | null)?.trim()) {
    return { success: true, data: { applicationId: randomUUID() } }
  }

  try {
    const ip = await clientIp()
    if (!(await rateLimit(`enroll:ip:${ip}`, 5, 60 * 60 * 1000)) ||
        !(await rateLimit(`enroll:school:${slug}`, 200, 24 * 60 * 60 * 1000))) {
      return { success: false, error: 'Trop de demandes. Réessayez plus tard.' }
    }

    const school = await (publicPrisma as any).school.findFirst({
      where: { slug, status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { schemaName: true },
    })
    if (!school) return { success: false, error: 'École introuvable ou inactive.' }

    const db = getTenantPrisma(school.schemaName) as any
    const settings = await loadEnrollmentSettings(db)
    if (!isEnrollmentOpen(settings)) {
      return { success: false, error: 'Les inscriptions en ligne sont actuellement closes.' }
    }

    // Lecture d'un champ selon sa configuration : masqué → ignoré, obligatoire → exigé.
    const read = (key: string, label: string, max: number): string | null => {
      const mode = settings.fields[key]
      if (mode === 'hidden') return null
      const value = (formData.get(key) as string | null)?.trim() ?? ''
      if (!value) {
        if (mode === 'required') throw new FieldError(`${label} requis.`)
        return null
      }
      if (value.length > max) throw new FieldError(`${label} trop long (${max} caractères max).`)
      return value
    }
    const required = (key: string, label: string, min: number, max: number): string => {
      const value = (formData.get(key) as string | null)?.trim() ?? ''
      if (value.length < min) throw new FieldError(`${label} requis.`)
      if (value.length > max) throw new FieldError(`${label} trop long (${max} caractères max).`)
      return value
    }

    let parsed
    try {
      const firstName  = required('firstName', 'Prénom de l\'élève', 2, 80)
      const lastName   = required('lastName', 'Nom de l\'élève', 2, 80)
      const parentName = required('parentName', 'Nom du parent', 2, 120)

      const dateOfBirth = read('dateOfBirth', 'Date de naissance', 10)
      if (dateOfBirth) {
        const d = new Date(dateOfBirth)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || isNaN(d.getTime()) || d > new Date()) {
          throw new FieldError('Date de naissance invalide.')
        }
      }
      const gender = read('gender', 'Sexe', 1)
      if (gender && gender !== 'M' && gender !== 'F') throw new FieldError('Sexe invalide.')

      const levelId = read('level', 'Niveau souhaité', 64)
      let desiredLevel: string | null = null
      if (levelId) {
        if (!settings.offeredLevelIds.includes(levelId)) throw new FieldError('Niveau non proposé.')
        const lv: any[] = await db.$queryRaw`SELECT name FROM levels WHERE id = ${levelId}`
        desiredLevel = lv[0]?.name ?? null
        if (!desiredLevel) throw new FieldError('Niveau non proposé.')
      }

      const previousAverageRaw = read('previousAverage', 'Moyenne précédente', 6)
      const previousAverage = previousAverageRaw === null ? null : Number(previousAverageRaw.replace(',', '.'))
      if (previousAverage !== null && (isNaN(previousAverage) || previousAverage < 0 || previousAverage > 20)) {
        throw new FieldError('La moyenne doit être comprise entre 0 et 20.')
      }

      const parentPhone = read('parentPhone', 'Téléphone du parent', 20)
      if (parentPhone && !/^[0-9+\s().-]{8,20}$/.test(parentPhone)) throw new FieldError('Téléphone invalide.')
      const parentEmail = read('parentEmail', 'Email du parent', 254)
      if (parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) throw new FieldError('Email invalide.')
      if (!parentPhone && !parentEmail) throw new FieldError('Indiquez au moins un téléphone ou un email pour vous joindre.')

      const parentRelation = read('parentRelation', 'Lien de parenté', 20) ?? 'PARENT'
      if (!RELATIONS.includes(parentRelation)) throw new FieldError('Lien de parenté invalide.')

      if (settings.requireConditions && formData.get('acceptConditions') !== 'on') {
        throw new FieldError('Vous devez accepter les conditions d\'admission.')
      }

      parsed = {
        firstName, lastName, parentName, dateOfBirth, gender, levelId, desiredLevel,
        previousSchool: read('previousSchool', 'École précédente', 120),
        previousAverage, parentPhone, parentEmail, parentRelation,
        address: read('address', 'Adresse', 300),
        notes:   read('notes', 'Message', 1000),
      }
    } catch (e) {
      if (e instanceof FieldError) return { success: false, error: e.message }
      throw e
    }

    // ── Pièces jointes : type réel vérifié sur les octets, taille bornée ──────
    const applicationId = randomUUID()
    const attachments: { key: string; type: string; name: string; label: string; size: number; mime: string }[] = []
    for (const def of DOCUMENT_DEFS) {
      const mode = settings.documents[def.key]
      if (mode === 'hidden') continue
      const file = formData.get(`doc_${def.key}`)
      if (!(file instanceof File) || file.size === 0) {
        if (mode === 'required') return { success: false, error: `${def.label} requis.` }
        continue
      }
      if (file.size > MAX_FILE_BYTES) return { success: false, error: `${def.label} : fichier trop volumineux (3 Mo max).` }
      const buffer = Buffer.from(await file.arrayBuffer())
      const detected = detectFileType(buffer)
      if (!detected) return { success: false, error: `${def.label} : format non accepté (PDF, JPEG, PNG ou WebP).` }

      try {
        // Dossier dérivé du tenant résolu côté serveur — jamais d'une valeur client.
        const { key } = await uploadFile(buffer, {
          folder: `enrollment/${applicationId}`, contentType: detected.mime, schoolId: school.schemaName,
        })
        attachments.push({ key, type: def.key, label: def.label, name: file.name.slice(0, 120), size: file.size, mime: detected.mime })
      } catch {
        return { success: false, error: 'Le dépôt de documents est momentanément indisponible. Réessayez plus tard.' }
      }
    }

    const yearRows: any[] = await db.$queryRaw`SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1`

    await db.$executeRaw`
      INSERT INTO enrollment_applications
        (id, academic_year_id, first_name, last_name, date_of_birth, gender, desired_level, level_id,
         previous_school, previous_average, parent_name, parent_phone, parent_email, parent_relation,
         address, notes, source, attachments)
      VALUES (
        ${applicationId}, ${yearRows[0]?.id ?? null}, ${parsed.firstName}, ${parsed.lastName},
        ${parsed.dateOfBirth ? new Date(parsed.dateOfBirth) : null}, ${parsed.gender},
        ${parsed.desiredLevel}, ${parsed.levelId}, ${parsed.previousSchool}, ${parsed.previousAverage},
        ${parsed.parentName}, ${parsed.parentPhone ?? ''}, ${parsed.parentEmail}, ${parsed.parentRelation},
        ${parsed.address}, ${parsed.notes}, 'WEB', ${JSON.stringify(attachments)}::jsonb
      )
    `

    // Prévient l'administration (best-effort : ne doit jamais faire échouer la candidature).
    if (settings.notifyAdmins) {
      try {
        const staff: any[] = await db.$queryRaw`SELECT id FROM users WHERE role IN ('ADMIN','CENSOR') AND is_active = TRUE`
        await Promise.all(staff.map((s: any) => notifyUser(db, {
          userId: s.id, type: 'ENROLLMENT_RECEIVED', title: 'Nouvelle candidature',
          body: `${parsed.firstName} ${parsed.lastName} — candidature reçue en ligne.`, href: '/admin/enrollments',
        })))
      } catch { /* ignoré */ }
    }

    return { success: true, data: { applicationId } }
  } catch (error) {
    console.error('[Inscription publique] Erreur :', (error as Error)?.message)
    return { success: false, error: 'Une erreur est survenue. Réessayez dans quelques instants.' }
  }
}

// ─── Liste des candidatures (admin) ───────────────────────────────────────────
export async function getEnrollmentApplications(params: {
  status?: string
  search?: string
  page?:   number
} = {}): Promise<PaginatedResult<any>> {
  const session = await requireRole('ADMIN', 'CENSOR', 'ACCOUNTANT')
  const db      = getTenantPrisma(session.user.schemaName) as any
  await ensureEnrollmentSchema(db)

  const page    = params.page ?? 1
  const perPage = 20
  const offset  = (page - 1) * perPage

  const status = params.status || null
  const search = params.search ? `%${params.search}%` : null

  const [rows, countRows] = await Promise.all([
    db.$queryRaw`
      SELECT
        ea.*,
        ay.name AS academic_year_name,
        u.first_name AS reviewer_first_name,
        u.last_name  AS reviewer_last_name
      FROM enrollment_applications ea
      LEFT JOIN academic_years ay ON ea.academic_year_id = ay.id
      LEFT JOIN users           u  ON ea.reviewed_by     = u.id
      WHERE (${status}::text IS NULL OR ea.status = ${status})
        AND (${search}::text IS NULL
             OR ea.first_name ILIKE ${search}
             OR ea.last_name  ILIKE ${search}
             OR ea.parent_name ILIKE ${search}
             OR ea.parent_phone ILIKE ${search})
      ORDER BY ea.submitted_at DESC
      LIMIT ${perPage} OFFSET ${offset}
    `,
    db.$queryRaw`
      SELECT COUNT(*)::int AS total
      FROM enrollment_applications ea
      WHERE (${status}::text IS NULL OR ea.status = ${status})
        AND (${search}::text IS NULL
             OR ea.first_name  ILIKE ${search}
             OR ea.last_name   ILIKE ${search}
             OR ea.parent_name ILIKE ${search}
             OR ea.parent_phone ILIKE ${search})
    `,
  ])

  const total = (countRows as any[])[0]?.total ?? 0
  return {
    data: rows as any[],
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  }
}

// ─── Statistiques candidatures ────────────────────────────────────────────────
export async function getEnrollmentStats() {
  const session = await requireRole('ADMIN', 'CENSOR')
  const db      = getTenantPrisma(session.user.schemaName) as any
  await ensureEnrollmentSchema(db)

  const rows = await db.$queryRaw`
    SELECT status, COUNT(*)::int AS count
    FROM enrollment_applications
    GROUP BY status
  ` as any[]

  const map: Record<string, number> = {}
  for (const r of rows) map[r.status] = r.count
  return {
    pending:    map['PENDING']    ?? 0,
    accepted:   map['ACCEPTED']   ?? 0,
    rejected:   map['REJECTED']   ?? 0,
    waitlisted: map['WAITLISTED'] ?? 0,
    total: rows.reduce((a, r) => a + r.count, 0),
  }
}

// ─── Décision sur une candidature ─────────────────────────────────────────────
export interface ReviewOutcome {
  studentNumber?: string
  invitation?:    'sent' | 'not_sent' | 'skipped'
}

export async function reviewApplication(
  applicationId: string,
  decision: 'ACCEPTED' | 'REJECTED' | 'WAITLISTED',
  reviewNotes?: string,
  options: { classId?: string | null } = {},
): Promise<ActionResult<ReviewOutcome>> {
  const session = await requireRole('ADMIN')
  const db      = getTenantPrisma(session.user.schemaName) as any

  try {
    await ensureEnrollmentSchema(db)

    const rows: any[] = await db.$queryRaw`SELECT * FROM enrollment_applications WHERE id = ${applicationId} LIMIT 1`
    const app = rows[0]
    if (!app) return { success: false, error: 'Candidature introuvable.' }
    // Une candidature déjà acceptée/refusée est définitive : le serveur refuse de la re-décider
    // (avant, n'importe quel appel direct pouvait l'écraser).
    if (!['PENDING', 'WAITLISTED'].includes(app.status)) {
      return { success: false, error: 'Cette candidature a déjà été traitée.' }
    }

    const outcome: ReviewOutcome = {}
    let studentId: string | null = null

    if (decision === 'ACCEPTED') {
      const ctx = await loadSchoolContext(session.user.schemaName)
      if (!ctx) return { success: false, error: 'Établissement inactif.' }

      const parentName = splitFullName(app.parent_name)
      try {
        const result = await provisionStudent(db, ctx, {
          student: {
            firstName: app.first_name, lastName: app.last_name,
            dateOfBirth: app.date_of_birth ? new Date(app.date_of_birth).toISOString().slice(0, 10) : null,
            gender: app.gender, address: app.address,
          },
          parent: {
            firstName: parentName.firstName, lastName: parentName.lastName,
            email: app.parent_email, phone: app.parent_phone, relation: app.parent_relation,
          },
          classId: options.classId || null,
          // Clé d'idempotence propre à la candidature : un double-clic ou une
          // course entre deux admins ne peut pas créer deux élèves.
          externalRef: `application:${applicationId}`,
        })
        studentId = result.studentId
        outcome.studentNumber = result.studentNumber
        outcome.invitation = result.invitation.parent
      } catch (e) {
        if (e instanceof ProvisionError) return { success: false, error: e.message }
        throw e
      }
    }

    await db.$executeRaw`
      UPDATE enrollment_applications
      SET status = ${decision}, reviewed_by = ${session.user.id}, reviewed_at = NOW(),
          review_notes = ${reviewNotes ?? null}, student_id = ${studentId}, processed_at = NOW()
      WHERE id = ${applicationId}
    `

    // Refus : courrier au parent. L'acceptation est notifiée par l'email d'invitation
    // envoyé par provisionStudent (lien d'activation du compte).
    if (decision === 'REJECTED' && app.parent_email) {
      await sendNotification({
        userId:   applicationId, // pas d'userId réel pour les candidats
        type:     'ANNOUNCEMENT',
        title:    'Candidature non retenue',
        body:     `La candidature de ${app.first_name} ${app.last_name} n'a pas été retenue cette année.`,
        channels: ['email'],
        email: {
          to:      app.parent_email,
          subject: 'Résultat de votre candidature',
          html: `<p>Bonjour,</p>
                 <p>Nous avons bien reçu la candidature de <strong>${escapeHtml(app.first_name)} ${escapeHtml(app.last_name)}</strong>. Malheureusement, celle-ci n'a pas pu être retenue cette année.</p>`,
        },
      }).catch(() => {})
    }

    revalidatePath('/admin/enrollments')
    revalidatePath('/admin/students')
    return { success: true, data: outcome }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

function escapeHtml(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Envoi SMS de rappel (paiements en attente) ───────────────────────────────
export async function sendPaymentReminderSMS(
  parentPhone: string,
  studentName: string,
  amount:      string,
  dueDate:     string
): Promise<ActionResult> {
  await requireRole('ADMIN', 'ACCOUNTANT')
  try {
    await sendNotification({
      userId:   'system',
      type:     'PAYMENT_DUE',
      title:    'Rappel de paiement',
      body:     `Rappel paiement ${amount} pour ${studentName}`,
      channels: ['sms'],
      sms: {
        to:      parentPhone,
        message: `MyClassLink: Rappel - Un paiement de ${amount} est attendu avant le ${dueDate} pour ${studentName}. Merci de régulariser.`,
      },
    })
    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}
