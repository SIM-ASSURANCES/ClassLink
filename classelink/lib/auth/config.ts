import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { compare } from 'bcryptjs'
import { z } from 'zod'
import { getTenantPrisma } from '@/lib/db/tenant'
import { publicPrisma } from '@/lib/db/public'
import { verifyAutoLoginToken } from '@/lib/auth/auto-login'
import type { Role } from '@/types'
// Sentinel pour identifier le Super Admin (pas de schéma tenant)
export const SUPER_ADMIN_SCHEMA = '__super_admin__'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
        autoLoginToken: { label: 'Token', type: 'text' },
      },
      async authorize(credentials) {
        const db = publicPrisma as any

        // Indice d'école résolu côté serveur (sous-domaine) par l'action de
        // connexion. S'il est présent, on cible UN seul schéma au lieu de les
        // scanner tous (login en O(1) au lieu de O(N écoles)). Sinon (domaine
        // apex, dev), on retombe sur le scan complet — comportement inchangé.
        const schemaHint =
          typeof (credentials as any)?.schemaName === 'string' && (credentials as any).schemaName
            ? ((credentials as any).schemaName as string)
            : null

        // ── 0. Connexion automatique par jeton (après paiement) ────────────
        const autoToken = (credentials as any)?.autoLoginToken as string | undefined
        if (autoToken) {
          const tokenEmail = await verifyAutoLoginToken(autoToken)
          if (!tokenEmail) return null
          try {
            const schools = schemaHint
              ? [{ schemaName: schemaHint }]
              : await db.school.findMany({
                  where: { status: { in: ['TRIAL', 'ACTIVE'] } },
                  select: { schemaName: true },
                })
            for (const school of schools) {
              try {
                const tenantDb = getTenantPrisma(school.schemaName) as any
                const rows: any[] = await tenantDb.$queryRaw`
                  SELECT id, email, first_name, last_name, role, is_active, avatar_url, two_factor_enabled
                  FROM users WHERE email = ${tokenEmail} LIMIT 1
                `
                const user = rows[0]
                if (!user || !user.is_active) continue
                return {
                  id: user.id,
                  email: user.email,
                  name: `${user.first_name} ${user.last_name}`,
                  image: user.avatar_url ?? undefined,
                  role: user.role as Role,
                  schemaName: school.schemaName,
                  firstName: user.first_name,
                  lastName: user.last_name,
                  twoFactorEnabled: user.two_factor_enabled ?? false,
                }
              } catch { continue }
            }
          } catch { /* aucun tenant */ }
          return null
        }

        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        // ── 1. Chercher dans Super Admin ───────────────────────────────────
        try {
          const admin = await db.superAdminUser.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              passwordHash: true,
              isActive: true,
            },
          })

          if (admin && admin.isActive) {
            const valid = await compare(password, admin.passwordHash)
            if (valid) {
              await db.superAdminUser.update({
                where: { id: admin.id },
                data: { lastLoginAt: new Date() },
              })
              return {
                id: admin.id,
                email: admin.email,
                name: `${admin.firstName} ${admin.lastName}`,
                role: 'SUPER_ADMIN' as Role,
                schemaName: SUPER_ADMIN_SCHEMA,
                firstName: admin.firstName,
                lastName: admin.lastName,
              }
            }
          }
        } catch { /* pas un super admin, on continue */ }

        // ── 2. Chercher dans tous les tenants actifs ───────────────────────
        try {
          const schools = schemaHint
            ? [{ schemaName: schemaHint }]
            : await db.school.findMany({
                where: { status: { in: ['TRIAL', 'ACTIVE'] } },
                select: { schemaName: true },
              })

          for (const school of schools) {
            try {
              const tenantDb = getTenantPrisma(school.schemaName) as any
              const rows: any[] = await tenantDb.$queryRaw`
                SELECT id, email, first_name, last_name, password_hash, role, is_active, avatar_url,
                       two_factor_enabled
                FROM users WHERE email = ${email} LIMIT 1
              `
              const user = rows[0]
              if (!user || !user.is_active || !user.password_hash) continue

              const valid = await compare(password, user.password_hash)
              if (!valid) continue

              return {
                id: user.id,
                email: user.email,
                name: `${user.first_name} ${user.last_name}`,
                image: user.avatar_url ?? undefined,
                role: user.role as Role,
                schemaName: school.schemaName,
                firstName: user.first_name,
                lastName: user.last_name,
                twoFactorEnabled: user.two_factor_enabled ?? false,
              }
            } catch { continue }
          }
        } catch { /* aucun tenant trouvé */ }

        return null
      },
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!
        token.role = user.role
        token.schemaName = user.schemaName
        token.firstName = user.firstName
        token.lastName = user.lastName
        token.twoFactorEnabled = (user as any).twoFactorEnabled ?? false
      }
      return token
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.schemaName = token.schemaName
        session.user.firstName = token.firstName
        session.user.lastName = token.lastName
        session.user.twoFactorEnabled = token.twoFactorEnabled as boolean | undefined
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
    verifyRequest: '/verify-email',
  },

  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
})
