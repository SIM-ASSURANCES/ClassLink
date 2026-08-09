import { getParentChildren } from '@/actions/parent'
import { getStudentCafeteriaInfo } from '@/actions/cafeteria'
import { ParentPaywall } from '@/components/ui/parent-paywall'
import { SubscribeCafeteriaButton } from '@/components/cafeteria/subscribe-cafeteria-button'

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']

function statusBadge(status: string | null) {
  if (!status) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Non abonné</span>
  switch (status) {
    case 'ACTIVE':          return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Actif</span>
    case 'PENDING_PAYMENT': return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Paiement en attente</span>
    case 'SUSPENDED':       return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Suspendu</span>
    case 'INACTIVE':        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Inactif</span>
    default:                return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{status}</span>
  }
}

export default async function ParentCafeteriaPage() {
  const children = await getParentChildren()

  // Charger les infos cantine pour chaque enfant
  const cafeteriaData = await Promise.all(
    children.map(async (child: any) => {
      const result = await getStudentCafeteriaInfo(child.id)
      return {
        child,
        subscription: result.success ? result.data?.subscription ?? null : null,
        menus: result.success ? result.data?.menus ?? [] : [],
        prices: result.success ? result.data?.prices ?? { LUNCH: null, SNACK: null, LUNCH_SNACK: null } : { LUNCH: null, SNACK: null, LUNCH_SNACK: null },
      }
    })
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cantine</h1>
        <p className="text-sm text-gray-500 mt-1">
          Consultez les menus de la semaine et le statut d&apos;abonnement de vos enfants.
        </p>
      </div>

      <ParentPaywall featureName="La cantine" featureKey="cafeteria">
      {children.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl bg-white">
          <p className="text-sm text-gray-500">Aucun enfant associé à votre compte.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {cafeteriaData.map(({ child, subscription, menus, prices }) => {
            // Grouper les menus par jour
            const menusByDay: Record<number, any[]> = {}
            for (const menu of menus) {
              if (!menusByDay[menu.day_of_week]) menusByDay[menu.day_of_week] = []
              menusByDay[menu.day_of_week].push(menu)
            }

            return (
              <div key={child.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* En-tête enfant */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-sm font-bold">
                      {child.first_name?.[0]?.toUpperCase()}{child.last_name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{child.first_name} {child.last_name}</p>
                      <p className="text-xs text-gray-400">{child.class_name ?? 'Classe non assignée'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Abonnement :</span>
                    {statusBadge(subscription?.status ?? null)}
                  </div>
                </div>

                {/* Infos abonnement */}
                {subscription?.status === 'ACTIVE' && (
                  <div className="px-6 py-3 bg-green-50 border-b border-green-100">
                    <div className="flex flex-wrap gap-4 text-xs text-green-800">
                      <span><strong>Type :</strong> {subscription.meal_type}</span>
                      <span><strong>Depuis le :</strong> {new Date(subscription.start_date).toLocaleDateString('fr-FR')}</span>
                      <span><strong>Montant :</strong> {subscription.amount ? Number(subscription.amount).toLocaleString('fr-FR') + ' FCFA' : '—'}</span>
                    </div>
                  </div>
                )}
                {subscription?.status === 'PENDING_PAYMENT' && (
                  <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
                    <p className="text-xs text-blue-800">
                      Paiement en cours de traitement pour {subscription.meal_type} — cette page se mettra à jour automatiquement une fois confirmé.
                    </p>
                  </div>
                )}

                {/* Menus de la semaine */}
                <div className="p-6">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Menus de la semaine</p>
                  {menus.length === 0 ? (
                    <p className="text-sm text-gray-400 italic text-center py-6">Aucun menu disponible pour cette semaine.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {[1, 2, 3, 4, 5].map(day => (
                        <div key={day} className="border border-gray-100 rounded-lg p-3">
                          <p className="text-xs font-semibold text-gray-700 mb-2">{DAYS[day - 1]}</p>
                          {menusByDay[day] && menusByDay[day].length > 0 ? (
                            <div className="space-y-1">
                              {menusByDay[day].map((menu: any) => (
                                <div key={menu.id}>
                                  <p className="text-xs font-medium text-purple-700 capitalize">{menu.meal_type?.toLowerCase()}</p>
                                  <p className="text-xs text-gray-600">{menu.description}</p>
                                  {menu.price > 0 && (
                                    <p className="text-xs text-gray-400 mt-0.5">{Number(menu.price).toLocaleString('fr-FR')} FCFA</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-300 italic">—</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Message contact / abonnement en ligne */}
                {(!subscription || subscription.status === 'CANCELLED' || subscription.status === 'SUSPENDED') && (
                  <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 text-center">
                    {Object.values(prices).some((p: any) => p != null) ? (
                      <>
                        <p className="text-sm text-gray-500">
                          <strong>{child.first_name}</strong> n&apos;est pas abonné(e) à la cantine.
                        </p>
                        <SubscribeCafeteriaButton studentId={child.id} prices={prices} />
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">
                        <strong>{child.first_name}</strong> n&apos;est pas abonné(e) à la cantine.{' '}
                        <span className="text-purple-700">Contactez l&apos;administration</span> pour souscrire à un abonnement.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      </ParentPaywall>
    </div>
  )
}
