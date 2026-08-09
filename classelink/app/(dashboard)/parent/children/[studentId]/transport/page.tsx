import { getChildDetails } from '@/actions/parent'
import { getChildTransportInfo } from '@/actions/transport'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChildTabs } from '../child-tabs'
import { ParentPaywall } from '@/components/ui/parent-paywall'
import { TransportLiveView } from './transport-live-view'
import { SubscribeTransportButton } from '@/components/transport/subscribe-transport-button'

interface Props {
  params: Promise<{ studentId: string }>
  searchParams: Promise<{ paid?: string }>
}

export default async function ChildTransportPage({ params, searchParams }: Props) {
  const { studentId } = await params
  const { paid } = await searchParams
  const [details, result] = await Promise.all([
    getChildDetails(studentId),
    getChildTransportInfo(studentId),
  ])
  if (!details) notFound()

  const { profile } = details
  const transport = result.success ? result.data : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/parent" className="hover:text-purple-600">Tableau de bord</Link>
        <span>›</span>
        <Link href={`/parent/children/${studentId}`} className="hover:text-purple-600">
          {profile.first_name} {profile.last_name}
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Transport</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center
                        text-purple-700 font-bold text-lg flex-shrink-0">
          {profile.first_name[0]}{profile.last_name[0]}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile.first_name} {profile.last_name}</h1>
          <p className="text-sm text-gray-500">{profile.class_name} · Transport scolaire</p>
        </div>
      </div>

      <ChildTabs studentId={studentId} />

      <ParentPaywall featureName="Le transport scolaire" featureKey="transport">
        {!transport ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-sm text-gray-400">Aucun transport scolaire assigné pour cet enfant.</p>
            <p className="text-xs text-gray-400 mt-1">Contactez l&apos;administration de l&apos;école.</p>
          </div>
        ) : !transport.subscribed ? (
          <div className="bg-amber-50 rounded-xl border border-dashed border-amber-300 py-16 text-center px-6">
            <p className="text-sm font-semibold text-amber-800">Abonnement transport requis</p>
            <p className="text-xs text-amber-700 mt-1">
              {transport.routeName} — {transport.stop?.name}
            </p>

            {paid === 'pending' && transport.subscription?.paymentStatus === 'PENDING' && (
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-3 max-w-sm mx-auto">
                Paiement en cours de traitement — cette page se mettra à jour automatiquement une fois confirmé.
              </p>
            )}

            {transport.subscription?.paymentStatus === 'PENDING' ? (
              <p className="text-xs text-amber-600 mt-3 max-w-sm mx-auto">
                Un paiement est en attente de confirmation. Actualisez la page dans quelques instants.
              </p>
            ) : transport.monthlyPrice != null ? (
              <>
                {transport.subscription?.paymentStatus === 'FAILED' && (
                  <p className="text-xs text-red-600 mt-3">Le dernier paiement a échoué — vous pouvez réessayer.</p>
                )}
                <SubscribeTransportButton studentId={studentId} price={transport.monthlyPrice} />
              </>
            ) : (
              <p className="text-xs text-amber-600 mt-3 max-w-sm mx-auto">
                Le suivi en direct du car et les informations du chauffeur ne sont disponibles
                qu&apos;une fois l&apos;abonnement transport souscrit auprès de l&apos;administration de l&apos;école.
              </p>
            )}
          </div>
        ) : (
          <TransportLiveView studentId={studentId} initialData={transport} />
        )}
      </ParentPaywall>
    </div>
  )
}
