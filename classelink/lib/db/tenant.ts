import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { publicPrisma } from './public'
import { TenantError } from '@/lib/errors'

const tenantClients = new Map<string, PrismaClient>()

/**
 * Valide le nom de schéma avant toute interpolation dans une requête SQL brute
 * (search_path, CREATE/DROP SCHEMA). Les noms sont générés par le système
 * (`school_${nanoid}`), mais on impose une allowlist stricte par défense en
 * profondeur : seuls lettres, chiffres, tiret et underscore, longueur ≤ 63
 * (limite d'identifiant PostgreSQL). Bloque guillemets, espaces, `;`, etc.
 */
function assertValidSchemaName(schemaName: string): void {
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(schemaName)) {
    throw new TenantError()
  }
}

export function getTenantPrisma(schemaName: string): PrismaClient {
  if (!schemaName) throw new TenantError()
  assertValidSchemaName(schemaName)

  if (tenantClients.has(schemaName)) {
    return tenantClients.get(schemaName)!
  }

  // Définir le search_path PostgreSQL pour isoler le schéma tenant
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path="${schemaName}",public`,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })

  const adapter = new PrismaPg(pool)
  const client = new PrismaClient({ adapter } as any)

  tenantClients.set(schemaName, client)
  return client
}

export async function getSchemaFromHostname(hostname: string): Promise<string | null> {
  const host = hostname.split(':')[0]

  if (process.env.NODE_ENV === 'development' && host === 'localhost') {
    return process.env.DEV_SCHOOL_SCHEMA ?? null
  }

  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'classelink.ci'
  const isSubdomain = host.endsWith(`.${appDomain}`)
  const subdomain = isSubdomain ? host.replace(`.${appDomain}`, '') : null

  const school = await (publicPrisma as any).school.findFirst({
    where: {
      OR: [
        ...(subdomain ? [{ subdomain }] : []),
        { customDomain: host },
      ],
      status: { in: ['TRIAL', 'ACTIVE'] },
    },
    select: { schemaName: true },
  })

  return school?.schemaName ?? null
}

export async function createTenantSchema(schemaName: string): Promise<void> {
  assertValidSchemaName(schemaName)
  await (publicPrisma as any).$executeRawUnsafe(
    `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`
  )
}

export async function dropTenantSchema(schemaName: string): Promise<void> {
  assertValidSchemaName(schemaName)
  const client = tenantClients.get(schemaName)
  if (client) {
    await client.$disconnect()
    tenantClients.delete(schemaName)
  }
  await (publicPrisma as any).$executeRawUnsafe(
    `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`
  )
}
