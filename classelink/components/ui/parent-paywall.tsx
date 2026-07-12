import { checkFeatureAccess } from '@/actions/parent'
import type { ParentFeatureKey } from '@/lib/parent-feature-flags'
import { PaySubscriptionButton } from './pay-subscription-button'

interface Props {
  children: React.ReactNode
  featureName: string
  featureKey: ParentFeatureKey
}

/**
 * Verrouille une fonctionnalité parent tant que l'abonnement MyClassLink
 * (2000 FCFA/an/enfant) n'est pas réglé pour l'année scolaire en cours —
 * sauf override explicite du Super Admin (verrou/déverrouillage forcé,
 * voir /super-admin/parents), qui prime toujours sur le paiement.
 * Le rendu est côté serveur : rien n'est envoyé au client si verrouillé.
 */
export async function ParentPaywall({ children, featureName, featureKey }: Props) {
  const result = await checkFeatureAccess(featureKey)

  // En cas d'erreur de lecture du statut, on n'affiche pas le contenu verrouillable
  // par défaut (fail-closed) plutôt que de risquer une fuite d'accès.
  if (!result.success || !result.data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        Impossible de vérifier le statut de votre abonnement pour le moment.
      </div>
    )
  }

  if (result.data.allowed) return <>{children}</>

  const { paid, childrenCount, amountDue } = result.data

  // Verrouillé alors que l'abonnement est payé : c'est un verrou administrateur
  // plateforme, pas un problème de paiement — ne pas proposer de payer.
  if (paid) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center space-y-2">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </span>
        <p className="text-sm font-semibold text-gray-900">Fonctionnalité temporairement indisponible</p>
        <p className="text-xs text-gray-500">
          {featureName} est actuellement désactivée par l&apos;administrateur de la plateforme.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-amber-200 p-6 text-center space-y-3">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </span>
      <div>
        <p className="text-sm font-semibold text-gray-900">Fonctionnalité verrouillée</p>
        <p className="text-xs text-gray-500 mt-1">
          {featureName} nécessite un abonnement MyClassLink actif pour l&apos;année scolaire en cours.
        </p>
      </div>
      <div className="inline-block rounded-lg bg-gray-50 px-4 py-2 text-sm text-gray-700">
        {childrenCount} enfant{childrenCount > 1 ? 's' : ''} × 2 000 FCFA ={' '}
        <span className="font-bold text-gray-900">{amountDue.toLocaleString('fr-FR')} FCFA/an</span>
      </div>
      <div className="pt-1">
        <PaySubscriptionButton />
      </div>
    </div>
  )
}
