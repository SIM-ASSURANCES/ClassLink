import { ensureEnrollmentSchema } from './schema'

/**
 * Configuration de la page publique d'inscription (réglée par l'admin).
 *
 * Source de vérité UNIQUE des champs configurables : l'écran d'administration,
 * le formulaire public ET la validation côté serveur lisent ce catalogue, donc
 * ils ne peuvent pas diverger (un champ masqué n'est ni affiché ni accepté).
 * Sans 'use server' : fonctions utilitaires, pas des server actions.
 */

export type FieldMode = 'required' | 'optional' | 'hidden'

/** Champs toujours demandés (non configurables) : prénom/nom de l'élève et nom du parent. */
export interface FieldDef { key: string; label: string; group: 'student' | 'parent'; defaultMode: FieldMode }

export const FIELD_DEFS: readonly FieldDef[] = [
  { key: 'dateOfBirth',     label: 'Date de naissance',      group: 'student', defaultMode: 'optional' },
  { key: 'gender',          label: 'Sexe',                   group: 'student', defaultMode: 'optional' },
  { key: 'level',           label: 'Niveau souhaité',        group: 'student', defaultMode: 'optional' },
  { key: 'previousSchool',  label: 'École précédente',       group: 'student', defaultMode: 'optional' },
  { key: 'previousAverage', label: 'Moyenne précédente /20', group: 'student', defaultMode: 'optional' },
  { key: 'address',         label: 'Adresse',                group: 'parent',  defaultMode: 'optional' },
  { key: 'parentPhone',     label: 'Téléphone du parent',    group: 'parent',  defaultMode: 'required' },
  { key: 'parentEmail',     label: 'Email du parent',        group: 'parent',  defaultMode: 'optional' },
  { key: 'parentRelation',  label: 'Lien de parenté',        group: 'parent',  defaultMode: 'optional' },
  { key: 'notes',           label: 'Message complémentaire', group: 'parent',  defaultMode: 'optional' },
] as const

export interface DocumentDef { key: string; label: string }

export const DOCUMENT_DEFS: readonly DocumentDef[] = [
  { key: 'birthCertificate', label: 'Acte de naissance' },
  { key: 'photo',            label: 'Photo d\'identité' },
  { key: 'previousReport',   label: 'Dernier bulletin' },
] as const

export interface EnrollmentSettings {
  isOpen:            boolean
  opensAt:           string | null
  closesAt:          string | null
  welcomeTitle:      string | null
  welcomeMessage:    string | null
  conditionsText:    string | null
  requireConditions: boolean
  offeredLevelIds:   string[]
  fields:            Record<string, FieldMode>
  documents:         Record<string, FieldMode>
  notifyAdmins:      boolean
}

const MODES: readonly FieldMode[] = ['required', 'optional', 'hidden']

function normalizeModes(raw: unknown, defs: readonly { key: string }[], fallback: (key: string) => FieldMode) {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: Record<string, FieldMode> = {}
  for (const def of defs) {
    const value = source[def.key]
    out[def.key] = MODES.includes(value as FieldMode) ? (value as FieldMode) : fallback(def.key)
  }
  return out
}

export function defaultSettings(): EnrollmentSettings {
  return {
    isOpen: false, opensAt: null, closesAt: null,
    welcomeTitle: null, welcomeMessage: null, conditionsText: null, requireConditions: false,
    offeredLevelIds: [],
    fields:    normalizeModes({}, FIELD_DEFS,    k => FIELD_DEFS.find(f => f.key === k)!.defaultMode),
    documents: normalizeModes({}, DOCUMENT_DEFS, () => 'hidden'), // les dépôts de fichiers sont à activer explicitement
    notifyAdmins: true,
  }
}

/** Lit la configuration (ou les valeurs par défaut : page fermée) et la normalise. */
export async function loadEnrollmentSettings(db: any): Promise<EnrollmentSettings> {
  await ensureEnrollmentSchema(db)
  const rows: any[] = await db.$queryRaw`
    SELECT is_open, opens_at, closes_at, welcome_title, welcome_message, conditions_text,
           require_conditions, offered_level_ids, field_config, documents_config, notify_admins
    FROM enrollment_settings LIMIT 1
  `
  const r = rows[0]
  if (!r) return defaultSettings()
  return {
    isOpen:            r.is_open,
    opensAt:           r.opens_at ? new Date(r.opens_at).toISOString() : null,
    closesAt:          r.closes_at ? new Date(r.closes_at).toISOString() : null,
    welcomeTitle:      r.welcome_title,
    welcomeMessage:    r.welcome_message,
    conditionsText:    r.conditions_text,
    requireConditions: r.require_conditions,
    offeredLevelIds:   r.offered_level_ids ?? [],
    fields:    normalizeModes(r.field_config,     FIELD_DEFS,    k => FIELD_DEFS.find(f => f.key === k)!.defaultMode),
    documents: normalizeModes(r.documents_config, DOCUMENT_DEFS, () => 'hidden'),
    notifyAdmins:      r.notify_admins,
  }
}

/** Les inscriptions sont-elles acceptées à cet instant ? (interrupteur ET fenêtre de dates). */
export function isEnrollmentOpen(s: EnrollmentSettings, now = new Date()): boolean {
  if (!s.isOpen) return false
  if (s.opensAt && now < new Date(s.opensAt)) return false
  if (s.closesAt && now > new Date(s.closesAt)) return false
  return true
}
