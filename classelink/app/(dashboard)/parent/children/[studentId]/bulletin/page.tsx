import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTermsAndClasses } from '@/actions/bulletin'
import { getChildDetails } from '@/actions/parent'
import { ChildTabs } from '../child-tabs'
import { ParentPaywall } from '@/components/ui/parent-paywall'

interface Props {
  params: Promise<{ studentId: string }>
}

export default async function ParentBulletinListPage({ params }: Props) {
  const { studentId } = await params

  const [childData, { terms }] = await Promise.all([
    getChildDetails(studentId),
    getTermsAndClasses(),
  ])

  if (!childData || !childData.profile) notFound()

  const profile = childData.profile

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/parent" className="hover:text-purple-600">Tableau de bord</Link>
        <span>›</span>
        <Link href="/parent/children" className="hover:text-purple-600">Mes enfants</Link>
        <span>›</span>
        <Link href={`/parent/children/${studentId}`} className="hover:text-purple-600">
          {profile.first_name} {profile.last_name}
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Bulletin</span>
      </nav>

      {/* En-tête enfant */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-lg flex-shrink-0">
          {profile.first_name?.[0]?.toUpperCase() ?? '?'}{profile.last_name?.[0]?.toUpperCase() ?? ''}
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900">
            {profile.first_name} {profile.last_name}
          </p>
          <p className="text-sm text-gray-500">{profile.class_name ?? 'Classe non assignée'} · {profile.level_name ?? ''}</p>
        </div>
      </div>

      {/* Tabs */}
      <ChildTabs studentId={studentId} />

      {/* Contenu */}
      <ParentPaywall featureName="Les bulletins scolaires" featureKey="bulletins">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h1 className="text-lg font-bold text-gray-900 mb-1">Bulletins scolaires</h1>
        <p className="text-sm text-gray-500 mb-6">Consultez le bulletin de {profile.first_name} par trimestre.</p>

        {terms.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-500 font-medium">Aucun bulletin disponible</p>
            <p className="text-xs text-gray-400 mt-1">Les bulletins seront disponibles à la fin de chaque trimestre.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {terms.map((term: any) => (
              <div key={term.id} className="border border-gray-200 rounded-xl p-5 hover:border-purple-300 hover:bg-purple-50 transition group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 text-sm font-bold group-hover:bg-purple-600 group-hover:text-white transition">
                    T{term.term_order}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{term.name}</p>
                    <p className="text-xs text-gray-400">Trimestre {term.term_order}</p>
                  </div>
                </div>
                <Link
                  href={`/parent/children/${studentId}/bulletin/${term.id}`}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Consulter le bulletin
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
      </ParentPaywall>
    </div>
  )
}
