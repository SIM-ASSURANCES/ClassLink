import type { Role } from '@/types'
import { ForbiddenError, UnauthorizedError } from '@/lib/errors'
import { auth } from './config'

// ─── Table des permissions ───────────────────────────────────────────────────
const PERMISSIONS: Record<string, Record<string, Role[]>> = {
  SCHOOL: {
    READ: ['SUPER_ADMIN'],
    CREATE: ['SUPER_ADMIN'],
    UPDATE: ['SUPER_ADMIN'],
    DELETE: ['SUPER_ADMIN'],
  },
  USER: {
    READ: ['ADMIN', 'CENSOR'],
    CREATE: ['ADMIN'],
    UPDATE: ['ADMIN'],
    DELETE: ['ADMIN'],
  },
  GRADE: {
    READ: ['ADMIN', 'CENSOR', 'TEACHER', 'PARENT', 'STUDENT'],
    CREATE: ['ADMIN', 'TEACHER'],
    UPDATE: ['ADMIN', 'TEACHER'],
    DELETE: ['ADMIN'],
    PUBLISH: ['ADMIN', 'TEACHER'],
  },
  ATTENDANCE: {
    READ: ['ADMIN', 'CENSOR', 'TEACHER', 'PARENT', 'STUDENT'],
    CREATE: ['ADMIN', 'CENSOR', 'TEACHER'],
    UPDATE: ['ADMIN', 'CENSOR', 'TEACHER'],
    JUSTIFY: ['ADMIN', 'CENSOR', 'PARENT'],
  },
  PAYMENT: {
    READ: ['ADMIN', 'ACCOUNTANT', 'PARENT'],
    CREATE: ['ADMIN', 'ACCOUNTANT', 'PARENT'],
    UPDATE: ['ADMIN', 'ACCOUNTANT'],
    DELETE: ['ADMIN'],
    REFUND: ['ADMIN', 'ACCOUNTANT'],
  },
  REPORT_CARD: {
    READ: ['ADMIN', 'CENSOR', 'TEACHER', 'PARENT', 'STUDENT'],
    CREATE: ['ADMIN'],
    SEND: ['ADMIN'],
    SIGN: ['ADMIN'],
  },
  ASSIGNMENT: {
    READ: ['ADMIN', 'TEACHER', 'PARENT', 'STUDENT'],
    CREATE: ['ADMIN', 'TEACHER'],
    UPDATE: ['ADMIN', 'TEACHER'],
    DELETE: ['ADMIN', 'TEACHER'],
    SUBMIT: ['STUDENT'],
    GRADE: ['ADMIN', 'TEACHER'],
  },
  LESSON: {
    READ: ['ADMIN', 'CENSOR', 'TEACHER', 'PARENT', 'STUDENT'],
    CREATE: ['ADMIN', 'TEACHER'],
    UPDATE: ['ADMIN', 'TEACHER'],
    DELETE: ['ADMIN'],
  },
  MESSAGE: {
    READ: ['ADMIN', 'CENSOR', 'TEACHER', 'PARENT', 'STUDENT'],
    CREATE: ['ADMIN', 'CENSOR', 'TEACHER', 'PARENT'],
    DELETE: ['ADMIN'],
  },
  ANNOUNCEMENT: {
    READ: ['ADMIN', 'CENSOR', 'TEACHER', 'PARENT', 'STUDENT'],
    CREATE: ['ADMIN', 'CENSOR', 'TEACHER'],
    UPDATE: ['ADMIN', 'CENSOR'],
    DELETE: ['ADMIN'],
  },
  SCHEDULE: {
    READ: ['ADMIN', 'CENSOR', 'TEACHER', 'PARENT', 'STUDENT'],
    CREATE: ['ADMIN'],
    UPDATE: ['ADMIN', 'CENSOR'],
    DELETE: ['ADMIN'],
  },
  FINANCE_REPORT: {
    READ: ['ADMIN', 'ACCOUNTANT'],
    EXPORT: ['ADMIN', 'ACCOUNTANT'],
  },
}

export function can(role: Role, resource: string, action: string): boolean {
  return PERMISSIONS[resource]?.[action]?.includes(role) ?? false
}

// Wrapper Server Action avec vérification auth + permission
export function withPermission<TArgs extends unknown[], TReturn>(
  resource: string,
  action: string,
  handler: (
    ctx: { userId: string; schemaName: string; role: Role },
    ...args: TArgs
  ) => Promise<TReturn>
) {
  return async (...args: TArgs): Promise<TReturn> => {
    const session = await auth()

    if (!session?.user) throw new UnauthorizedError()
    if (!can(session.user.role, resource, action)) throw new ForbiddenError()

    return handler(
      {
        userId: session.user.id!,
        schemaName: session.user.schemaName,
        role: session.user.role,
      },
      ...args
    )
  }
}

// Récupérer la session ou lever une erreur
export async function requireAuth() {
  const session = await auth()
  if (!session?.user) throw new UnauthorizedError()
  return session as typeof session & { user: NonNullable<typeof session.user> }
}

// Récupérer la session ou lever une erreur + vérifier le rôle
export async function requireRole(...roles: Role[]) {
  const session = await requireAuth()
  if (!roles.includes(session.user.role)) throw new ForbiddenError()
  return session
}

// ─── Permissions des super admins collaborateurs (READ / EDIT / BOTH) ────────
export type SuperAdminPermission = 'READ' | 'EDIT' | 'BOTH'

// Lecture défensive : si la colonne "permission" n'existe pas encore en base
// (déploiement pas encore migré), on considère l'accès complet (BOTH) pour ne
// jamais casser le compte super admin historique. La colonne est créée par
// getSuperAdminUsers()/createSuperAdminUser() dans actions/super-admin.ts.
async function getSuperAdminPermission(userId: string): Promise<SuperAdminPermission> {
  try {
    const { publicPrisma } = await import('@/lib/db/public')
    const rows = await publicPrisma.$queryRawUnsafe<{ permission: SuperAdminPermission }[]>(
      `SELECT permission FROM super_admin_users WHERE id = $1 LIMIT 1`,
      userId
    )
    return rows[0]?.permission ?? 'BOTH'
  } catch {
    return 'BOTH'
  }
}

// SUPER_ADMIN + droit d'écriture (EDIT ou BOTH) — bloque les collaborateurs en lecture seule.
export async function requireSuperAdminWrite() {
  const session = await requireRole('SUPER_ADMIN')
  const permission = await getSuperAdminPermission(session.user.id!)
  if (permission === 'READ') throw new ForbiddenError('Accès en lecture seule : action non autorisée')
  return session
}

// Seuls les super admins en accès complet (BOTH) peuvent gérer d'autres comptes super admin.
export async function requireSuperAdminOwner() {
  const session = await requireRole('SUPER_ADMIN')
  const permission = await getSuperAdminPermission(session.user.id!)
  if (permission !== 'BOTH') throw new ForbiddenError('Seuls les administrateurs à accès complet peuvent gérer les collaborateurs')
  return session
}
