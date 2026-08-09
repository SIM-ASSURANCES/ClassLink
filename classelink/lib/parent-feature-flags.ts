/**
 * Fonctionnalités de l'espace parent verrouillables individuellement par le
 * Super Admin — la clé correspond au `featureKey` passé à ParentPaywall
 * (web) et ParentPaywallGate (mobile).
 *
 * Fichier "client-safe" : aucune dépendance serveur (Prisma/pg) ici, pour
 * pouvoir être importé depuis des composants client (ex. parent-features-client.tsx)
 * sans faire fuiter `pg` dans le bundle navigateur. La lecture en base
 * (getFeatureOverrides) vit dans lib/parent-feature-flags.server.ts.
 */
export const PARENT_FEATURES = [
  { key: 'cafeteria',   label: 'Cantine' },
  { key: 'messages',    label: 'Messagerie' },
  { key: 'attendance',  label: 'Justification des absences' },
  { key: 'schedule',    label: 'Emploi du temps' },
  { key: 'grades',      label: 'Notes & moyennes' },
  { key: 'bulletins',   label: 'Bulletins scolaires' },
  { key: 'assignments', label: 'Devoirs & exercices' },
  { key: 'agenda',      label: 'Agenda scolaire' },
  { key: 'sanctions',   label: 'Sanctions' },
  { key: 'summary',     label: 'Aperçu (résumé hebdomadaire)' },
  { key: 'liaison',     label: 'Carnet de liaison' },
  { key: 'appointments', label: 'Rendez-vous enseignants' },
  { key: 'transport',    label: 'Transport scolaire' },
] as const

export type ParentFeatureKey = (typeof PARENT_FEATURES)[number]['key']
export type FeatureOverride = 'LOCK' | 'UNLOCK' | null

/**
 * Combine le statut de paiement de l'abonnement avec un éventuel override
 * admin. L'override prime toujours sur le paiement.
 */
export function resolveFeatureAccess(paid: boolean, override: FeatureOverride): boolean {
  if (override === 'LOCK') return false
  if (override === 'UNLOCK') return true
  return paid
}
