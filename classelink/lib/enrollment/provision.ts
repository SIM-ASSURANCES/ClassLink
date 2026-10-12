import { customAlphabet } from 'nanoid'
import { publicPrisma } from '@/lib/db/public'
import { createInvitationLink, sendInvitationEmail } from '@/lib/auth/invitation'

/**
 * Cœur partagé de création d'un élève : utilisé par l'API publique /api/v1
 * ET par l'acceptation d'une candidature (actions/enrollment.ts). Un seul
 * chemin de code = un seul comportement, quel que soit le point d'entrée.
 *
 * Tout ce qui touche la base se fait dans UNE transaction : un échec à
 * mi-parcours ne laisse plus de compte `users` orphelin (défaut de
 * createStudent / importStudents dans actions/admin.ts).
 */

const digits = customAlphabet('0123456789', 6)
const MAX_NUMBER_ATTEMPTS = 8

export class ProvisionError extends Error {
  constructor(
    public code:   string,
    message:       string,
    public status: number = 422,
  ) {
    super(message)
    this.name = 'ProvisionError'
  }
}

export interface ProvisionInput {
  student: {
    firstName:   string
    lastName:    string
    email?:      string | null
    dateOfBirth?: string | null
    gender?:     'M' | 'F' | null
    address?:    string | null
  }
  parent: {
    firstName: string
    lastName:  string
    email?:    string | null
    phone?:    string | null
    relation?: string | null
  }
  /** Classe cible : par identifiant, sinon par nom (année courante). Facultative. */
  classId?:    string | null
  className?:  string | null
  /** Identifiant côté application source — garantit l'idempotence. */
  externalRef?: string | null
}

export interface SchoolContext {
  schemaName: string
  slug:       string
  name:       string
  /** -1 = illimité (modèle Plan.maxStudents). */
  maxStudents: number
}

export type InvitationStatus = 'sent' | 'not_sent' | 'skipped'

export interface ProvisionResult {
  created:       boolean
  studentId:     string
  studentNumber: string
  classId:       string | null
  enrollmentId:  string | null
  parentId:      string
  invitation:    { parent: InvitationStatus; student: InvitationStatus }
}

/** Charge l'école (schéma public) et la limite d'élèves de son plan. */
export async function loadSchoolContext(schemaName: string): Promise<SchoolContext | null> {
  const school = await (publicPrisma as any).school.findUnique({
    where:  { schemaName },
    select: { slug: true, name: true, status: true, plan: { select: { maxStudents: true } } },
  })
  if (!school || ['SUSPENDED', 'CANCELLED'].includes(school.status)) return null
  return {
    schemaName,
    slug:        school.slug,
    name:        school.name,
    maxStudents: school.plan?.maxStudents ?? -1,
  }
}

/** Un email de substitution (« .invalid », jamais délivrable) signale un compte sans vraie adresse. */
export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith('.invalid')
}

/** Nom complet « YAPI Emmanuel » → { lastName: 'YAPI', firstName: 'Emmanuel' } (nom de famille en premier). */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '-', lastName: '-' }
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] }
  return { lastName: parts[0], firstName: parts.slice(1).join(' ') }
}

type ParentMatch = { parentId: string; userId: string }

/**
 * Cherche un parent déjà enregistré par adresse email exacte. Obligatoire :
 * `users.email` est unique, donc sans cette reconnaissance l'inscription d'un
 * deuxième enfant du même parent échouerait sur la contrainte d'unicité.
 */
async function findParentByEmail(tx: any, email: string): Promise<ParentMatch | null> {
  const rows: any[] = await tx.$queryRaw`
    SELECT p.id AS parent_id, u.id AS user_id
    FROM users u
    JOIN parents p ON p.user_id = u.id
    WHERE u.role = 'PARENT' AND LOWER(u.email) = ${email.toLowerCase()}
    LIMIT 1
  `
  return rows[0] ? { parentId: rows[0].parent_id, userId: rows[0].user_id } : null
}

/**
 * Règle de rapprochement quand le parent n'a PAS d'email (ou que l'email ne
 * correspond à personne) : doit-on le reconnaître grâce à son téléphone ?
 *
 * TODO(human): décidez de la règle. Un même numéro peut appartenir à deux
 * familles distinctes (téléphone partagé, numéro recyclé), donc une fusion
 * trop large rattacherait un enfant au mauvais compte parent.
 */
async function findParentByPhone(tx: any, phone: string | null | undefined): Promise<ParentMatch | null> {
  void tx; void phone
  return null // Par défaut : jamais de rapprochement par téléphone (pas de fusion risquée).
}

async function generateStudentNumber(tx: any): Promise<string> {
  const yy = String(new Date().getFullYear()).slice(-2)
  for (let i = 0; i < MAX_NUMBER_ATTEMPTS; i++) {
    const candidate = `EL-${yy}-${digits()}`
    const taken: any[] = await tx.$queryRaw`SELECT 1 FROM students WHERE student_id = ${candidate} LIMIT 1`
    if (!taken[0]) return candidate
  }
  throw new ProvisionError('NUMBER_GENERATION_FAILED', 'Impossible de générer un matricule unique. Réessayez.', 503)
}

export async function provisionStudent(
  db:    any,
  ctx:   SchoolContext,
  input: ProvisionInput,
): Promise<ProvisionResult> {
  const parentEmail  = input.parent.email?.trim().toLowerCase() || null
  const studentEmail = input.student.email?.trim().toLowerCase() || null

  if (!parentEmail && !input.parent.phone?.trim()) {
    throw new ProvisionError('PARENT_CONTACT_REQUIRED', 'Le parent doit avoir au moins un email ou un téléphone.')
  }

  const tx = await runTransaction(db, ctx, input, parentEmail, studentEmail)

  // ── Après commit : invitations (best-effort, n'annulent jamais l'inscription) ──
  const invite = async (userId: string, email: string | null, name: string): Promise<InvitationStatus> => {
    if (!email || isPlaceholderEmail(email)) return 'skipped'
    const link = await createInvitationLink({ userId, schemaName: ctx.schemaName, email })
    if (!link) return 'not_sent'
    const ok = await sendInvitationEmail({
      to: email, recipientName: name, schoolName: ctx.name,
      studentName: `${input.student.firstName} ${input.student.lastName}`, link,
    })
    return ok ? 'sent' : 'not_sent'
  }

  const parentInvite = tx.parentIsNew
    ? await invite(tx.parentUserId, parentEmail, `${input.parent.firstName} ${input.parent.lastName}`)
    : 'skipped' // parent déjà inscrit (fratrie) : il a déjà ses accès
  const studentInvite = tx.created
    ? await invite(tx.studentUserId, studentEmail, `${input.student.firstName} ${input.student.lastName}`)
    : 'skipped'

  return {
    created:       tx.created,
    studentId:     tx.studentId,
    studentNumber: tx.studentNumber,
    classId:       tx.classId,
    enrollmentId:  tx.enrollmentId,
    parentId:      tx.parentId,
    invitation:    { parent: parentInvite, student: studentInvite },
  }
}

async function runTransaction(
  db: any, ctx: SchoolContext, input: ProvisionInput,
  parentEmail: string | null, studentEmail: string | null,
) {
  try {
    return await db.$transaction(async (tx: any) => {
      // 1. Idempotence : même externalRef = même élève, pas de doublon.
      if (input.externalRef) {
        const existing: any[] = await tx.$queryRaw`
          SELECT s.id, s.student_id,
                 (SELECT e.id FROM enrollments e WHERE e.student_id = s.id AND e.status = 'ACTIVE' LIMIT 1) AS enrollment_id,
                 (SELECT e.class_id FROM enrollments e WHERE e.student_id = s.id AND e.status = 'ACTIVE' LIMIT 1) AS class_id,
                 (SELECT ps.parent_id FROM parent_students ps WHERE ps.student_id = s.id LIMIT 1) AS parent_id
          FROM students s WHERE s.external_ref = ${input.externalRef} LIMIT 1
        `
        if (existing[0]) {
          return {
            created: false, studentId: existing[0].id, studentNumber: existing[0].student_id,
            classId: existing[0].class_id ?? null, enrollmentId: existing[0].enrollment_id ?? null,
            parentId: existing[0].parent_id ?? '', parentIsNew: false, parentUserId: '', studentUserId: '',
          }
        }
      }

      // 2. Année scolaire courante.
      const years: any[] = await tx.$queryRaw`SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1`
      const yearId: string | undefined = years[0]?.id
      if (!yearId) throw new ProvisionError('NO_ACADEMIC_YEAR', 'Aucune année scolaire courante n\'est définie.', 409)

      // 3. Limite d'élèves du plan d'abonnement.
      if (ctx.maxStudents >= 0) {
        const count: any[] = await tx.$queryRaw`SELECT COUNT(*)::int AS n FROM students`
        if (count[0].n >= ctx.maxStudents) {
          throw new ProvisionError('PLAN_LIMIT_REACHED', `La limite de ${ctx.maxStudents} élèves du plan est atteinte.`, 403)
        }
      }

      // 4. Classe (facultative) : résolution + capacité (refus strict si pleine).
      let classId: string | null = null
      if (input.classId || input.className) {
        const found: any[] = input.classId
          ? await tx.$queryRaw`SELECT id, max_students FROM classes WHERE id = ${input.classId} AND academic_year_id = ${yearId}`
          : await tx.$queryRaw`SELECT id, max_students FROM classes WHERE LOWER(name) = LOWER(${input.className}) AND academic_year_id = ${yearId}`
        if (found.length === 0) throw new ProvisionError('CLASS_NOT_FOUND', 'Classe introuvable pour l\'année courante.')
        if (found.length > 1) throw new ProvisionError('CLASS_AMBIGUOUS', 'Plusieurs classes portent ce nom : utilisez classId.')
        classId = found[0].id
        const occupancy: any[] = await tx.$queryRaw`
          SELECT COUNT(*)::int AS n FROM enrollments WHERE class_id = ${classId} AND status = 'ACTIVE'
        `
        if (found[0].max_students != null && occupancy[0].n >= found[0].max_students) {
          throw new ProvisionError('CLASS_FULL', 'La classe a atteint sa capacité maximale.', 409)
        }
      }

      // 5. Parent : réutilisé s'il existe (fratrie), sinon créé sans mot de passe.
      let parentMatch: ParentMatch | null = null
      if (parentEmail) parentMatch = await findParentByEmail(tx, parentEmail)
      if (!parentMatch) parentMatch = await findParentByPhone(tx, input.parent.phone)

      let parentId: string
      let parentUserId: string
      const parentIsNew = !parentMatch
      if (parentMatch) {
        parentId = parentMatch.parentId
        parentUserId = parentMatch.userId
      } else {
        const email = parentEmail ?? `parent-${digits()}${digits()}@${ctx.slug}.invalid`
        const user: any[] = await tx.$queryRaw`
          INSERT INTO users (email, first_name, last_name, phone, role)
          VALUES (${email}, ${input.parent.firstName}, ${input.parent.lastName}, ${input.parent.phone?.trim() || null}, 'PARENT')
          RETURNING id
        `
        parentUserId = user[0].id
        const parent: any[] = await tx.$queryRaw`INSERT INTO parents (user_id) VALUES (${parentUserId}) RETURNING id`
        parentId = parent[0].id
      }

      // 6. Élève : compte (sans mot de passe) + fiche + inscription.
      const studentNumber = await generateStudentNumber(tx)
      const sEmail = studentEmail ?? `${studentNumber.toLowerCase()}@${ctx.slug}.invalid`
      const studentUser: any[] = await tx.$queryRaw`
        INSERT INTO users (email, first_name, last_name, role)
        VALUES (${sEmail}, ${input.student.firstName}, ${input.student.lastName}, 'STUDENT')
        RETURNING id
      `
      const studentUserId: string = studentUser[0].id
      const student: any[] = await tx.$queryRaw`
        INSERT INTO students (user_id, student_id, date_of_birth, gender, address, external_ref)
        VALUES (${studentUserId}, ${studentNumber},
                ${input.student.dateOfBirth ? new Date(input.student.dateOfBirth) : null},
                ${input.student.gender ?? null}, ${input.student.address ?? null}, ${input.externalRef ?? null})
        RETURNING id
      `
      const studentId: string = student[0].id

      let enrollmentId: string | null = null
      if (classId) {
        const enr: any[] = await tx.$queryRaw`
          INSERT INTO enrollments (student_id, class_id, academic_year_id)
          VALUES (${studentId}, ${classId}, ${yearId})
          RETURNING id
        `
        enrollmentId = enr[0].id
      }

      // 7. Lien parent ↔ élève.
      await tx.$executeRaw`
        INSERT INTO parent_students (parent_id, student_id, relation, is_primary)
        VALUES (${parentId}, ${studentId}, ${input.parent.relation ?? 'PARENT'}, TRUE)
      `

      return { created: true, studentId, studentNumber, classId, enrollmentId, parentId, parentIsNew, parentUserId, studentUserId }
    }, { timeout: 20_000 })
  } catch (e: any) {
    if (e instanceof ProvisionError) throw e
    // 23505 : e-mail (ou externalRef) déjà pris par un compte qui n'est pas un parent.
    if (e?.code === '23505' || e?.message?.includes('23505') || e?.message?.includes('duplicate key')) {
      throw new ProvisionError('DUPLICATE', 'Un compte existe déjà avec cet email ou cet identifiant externe.', 409)
    }
    throw e
  }
}
