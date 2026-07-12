import { getChildDetails, getChildSanctions } from '@/actions/parent'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChildTabs } from '../child-tabs'
import { ParentPaywall } from '@/components/ui/parent-paywall'

interface Props { params: Promise<{ studentId: string }> }

export const metadata = { title: 'Historique des sanctions' }

const SANCTION_BADGE: Record<string, { label: string; cls: string }> = {
  AVERTISSEMENT:  { label: 'Avertissement',   cls: 'bg-yellow-100 text-yellow-800' },
  BLAME:          { label: 'Blâme',            cls: 'bg-orange-100 text-orange-800' },
  EXCLUSION_TEMP: { label: 'Exclusion temp.', cls: 'bg-red-100 text-red-800' },
  RENVOI:         { label: 'Renvoi',           cls: 'bg-red-200 text-red-900 font-semibold' },
  AUTRE:          { label: 'Autre',            cls: 'bg-gray-100 text-gray-700' },
}

export default async function SanctionsPage({ params }: Props) {
  const { studentId } = await params
  const [details, result] = await Promise.all([
    getChildDetails(studentId),
    getChildSanctions(studentId),
  ])
  if (!details) notFound()

  const { profile } = details
  const sanctions = result.success ? (result.data ?? []) : []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/parent" className="hover:text-purple-600">Tableau de bord</Link>
        <span>›</span>
        <Link href={`/parent/children/${studentId}`} className="hover:text-purple-600">
          {profile.first_name} {profile.last_name}
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Sanctions</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center
                        text-purple-700 font-bold text-lg flex-shrink-0">
          {profile.first_name[0]}{profile.last_name[0]}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile.first_name} {profile.last_name}</h1>
          <p className="text-sm text-gray-500">{profile.class_name} · Historique des sanctions</p>
        </div>
      </div>

      <ChildTabs studentId={studentId} />

      <ParentPaywall featureName="L'historique des sanctions" featureKey="sanctions">
      {sanctions.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-gray-700 font-medium">Aucune sanction enregistrée</p>
          <p className="text-sm text-gray-400 mt-1">Excellent comportement !</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sanctions.map((s: any) => {
            const badge = SANCTION_BADGE[s.type] ?? SANCTION_BADGE.AUTRE
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(s.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{s.reason}</p>
                    {s.description && (
                      <p className="text-xs text-gray-500 mt-1">{s.description}</p>
                    )}
                    {s.duration && (
                      <p className="text-xs text-gray-500 mt-1">Durée : {s.duration} jour{s.duration > 1 ? 's' : ''}</p>
                    )}
                  </div>
                  {(s.issuer_first || s.issuer_last) && (
                    <p className="text-xs text-gray-400 flex-shrink-0">
                      Par {s.issuer_first} {s.issuer_last}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      </ParentPaywall>
    </div>
  )
}
