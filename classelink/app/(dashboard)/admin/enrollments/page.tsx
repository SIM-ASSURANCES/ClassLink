import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getEnrollmentApplications, getEnrollmentStats } from '@/actions/enrollment'
import { getEnrollableClasses, getEnrollmentSettingsAdmin } from '@/actions/enrollment-settings'
import { listApiKeys } from '@/actions/enrollment-api-keys'
import { PageHeader } from '@/components/ui/page-header'
import { EnrollmentsClient } from './enrollments-client'
import { PublicPageSettings } from './public-page-settings'
import { ApiKeysPanel } from './api-keys-panel'

interface Props {
  searchParams: Promise<{ tab?: string; status?: string; search?: string; page?: string }>
}

export default async function EnrollmentsPage({ searchParams }: Props) {
  const params = await searchParams

  // Les réglages de la page publique et les clés API sont réservés à l'ADMIN
  // (le CENSOR peut seulement consulter les candidatures).
  const session = await auth()
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'ADMIN'
  const tab = isAdmin && (params.tab === 'page' || params.tab === 'api') ? params.tab : 'applications'

  const tabs = [
    { key: 'applications', label: 'Candidatures' },
    ...(isAdmin ? [
      { key: 'page', label: 'Page publique' },
      { key: 'api',  label: 'API & intégrations' },
    ] : []),
  ]

  const tabsNav = (
    <div className="flex gap-1 border-b border-gray-200">
      {tabs.map(t => (
        <Link
          key={t.key}
          href={t.key === 'applications' ? '/admin/enrollments' : `/admin/enrollments?tab=${t.key}`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )

  if (tab === 'page') {
    const view = await getEnrollmentSettingsAdmin()
    return (
      <div className="space-y-6">
        <PageHeader title="Inscriptions en ligne" description="Configurez la page publique d'inscription de votre établissement." />
        {tabsNav}
        {view.success
          ? (view.data ? <PublicPageSettings view={view.data} /> : null)
          : <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{view.error}</p>}
      </div>
    )
  }

  if (tab === 'api') {
    const [keys, view] = await Promise.all([listApiKeys(), getEnrollmentSettingsAdmin()])
    return (
      <div className="space-y-6">
        <PageHeader title="Inscriptions en ligne" description="Connectez une autre application pour y recevoir directement vos élèves." />
        {tabsNav}
        {keys.success
          ? <ApiKeysPanel keys={keys.data ?? []} slug={view.success ? (view.data?.slug ?? null) : null} />
          : <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{keys.error}</p>}
      </div>
    )
  }

  const [result, stats, classes] = await Promise.all([
    getEnrollmentApplications({
      status: params.status,
      search: params.search,
      page:   params.page ? parseInt(params.page) : 1,
    }),
    getEnrollmentStats(),
    getEnrollableClasses(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inscriptions en ligne"
        description={`${stats.total} candidature${stats.total > 1 ? 's' : ''} reçue${stats.total > 1 ? 's' : ''}`}
      />
      {tabs.length > 1 && tabsNav}
      <EnrollmentsClient result={result} stats={stats} currentFilters={params} classes={classes} />
    </div>
  )
}
