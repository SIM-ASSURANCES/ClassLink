import { getCafeteriaMenus, getCafeteriaSubscriptions } from '@/actions/cafeteria'
import { PageHeader } from '@/components/ui/page-header'
import { CafeteriaClient } from './cafeteria-client'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ tab?: string; week?: string }>
}

function getISOWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export default async function CafeteriaPage({ searchParams }: Props) {
  const sp = await searchParams
  const activeTab = sp.tab === 'subs' ? 'subs' : 'menus'

  // Calcul de la semaine courante ou celle passée en query param
  let weekStart: string
  if (sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week)) {
    // S'assurer que c'est bien un lundi
    weekStart = getISOWeekStart(new Date(sp.week))
  } else {
    weekStart = getISOWeekStart(new Date())
  }

  const [menus, subscriptions] = await Promise.all([
    getCafeteriaMenus(weekStart),
    getCafeteriaSubscriptions(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cantine scolaire"
        description="Gestion des menus de la semaine et des abonnements élèves"
        action={
          <Link
            href="/admin/cafeteria/checkin"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            Check-in
          </Link>
        }
      />

      <CafeteriaClient
        menus={menus}
        subscriptions={subscriptions}
        activeTab={activeTab}
        weekStart={weekStart}
      />
    </div>
  )
}
