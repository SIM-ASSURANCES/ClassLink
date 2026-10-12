/**
 * Auto-création idempotente du schéma « inscriptions » (API + page publique).
 *
 * Les tables/colonnes ci-dessous sont aussi dans prisma/tenant-schema.sql, mais
 * ce fichier n'est appliqué qu'au clic « Resynchroniser le schéma » du
 * super-admin. Sans cette auto-création, la page publique et l'API
 * planteraient sur toute école non encore resynchronisée (même leçon que
 * bus_subscriptions et grade_disputes). Garder les deux copies identiques.
 *
 * Volontairement SANS 'use server' : ce module n'est pas une server action
 * (il reçoit un client Prisma, non sérialisable).
 */

// Une instruction par entrée : $executeRawUnsafe n'accepte pas le multi-statement.
export const ENROLLMENT_SCHEMA_STATEMENTS: readonly string[] = [
  `ALTER TABLE enrollment_applications ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'WEB'`,
  `ALTER TABLE enrollment_applications ADD COLUMN IF NOT EXISTS external_ref TEXT`,
  `ALTER TABLE enrollment_applications ADD COLUMN IF NOT EXISTS level_id     TEXT REFERENCES levels(id) ON DELETE SET NULL`,
  `ALTER TABLE enrollment_applications ADD COLUMN IF NOT EXISTS attachments  JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE enrollment_applications ADD COLUMN IF NOT EXISTS student_id   TEXT REFERENCES students(id) ON DELETE SET NULL`,
  `ALTER TABLE enrollment_applications ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS external_ref TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_students_external_ref ON students(external_ref) WHERE external_ref IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS enrollment_settings (
     id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
     is_open            BOOLEAN NOT NULL DEFAULT FALSE,
     opens_at           TIMESTAMPTZ,
     closes_at          TIMESTAMPTZ,
     welcome_title      TEXT,
     welcome_message    TEXT,
     conditions_text    TEXT,
     require_conditions BOOLEAN NOT NULL DEFAULT FALSE,
     offered_level_ids  TEXT[] NOT NULL DEFAULT '{}',
     field_config       JSONB NOT NULL DEFAULT '{}'::jsonb,
     documents_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
     notify_admins      BOOLEAN NOT NULL DEFAULT TRUE,
     updated_at         TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS enrollment_api_keys (
     id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
     name         TEXT NOT NULL,
     key_prefix   TEXT NOT NULL,
     key_hash     TEXT NOT NULL UNIQUE,
     is_active    BOOLEAN NOT NULL DEFAULT TRUE,
     last_used_at TIMESTAMPTZ,
     created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
     created_at   TIMESTAMPTZ DEFAULT NOW(),
     revoked_at   TIMESTAMPTZ
   )`,
]

// Le client tenant est mis en cache par schéma (lib/db/tenant.ts) : on peut
// donc mémoriser « déjà fait » par instance de client. La promesse (et non un
// booléen) évite que deux requêtes concurrentes lancent les ALTER en parallèle.
const done = new WeakMap<object, Promise<void>>()

export function ensureEnrollmentSchema(db: any): Promise<void> {
  let pending = done.get(db)
  if (!pending) {
    pending = (async () => {
      for (const sql of ENROLLMENT_SCHEMA_STATEMENTS) {
        await db.$executeRawUnsafe(sql)
      }
    })()
    done.set(db, pending)
    // En cas d'échec, on oublie pour réessayer à la requête suivante.
    pending.catch(() => done.delete(db))
  }
  return pending
}
