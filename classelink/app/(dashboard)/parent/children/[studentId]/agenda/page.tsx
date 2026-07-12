import { getChildDetails, getChildAgenda } from '@/actions/parent'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChildTabs } from '../child-tabs'
import { ParentPaywall } from '@/components/ui/parent-paywall'

interface Props {
  params: Promise<{ studentId: string }>
  searchParams: Promise<{ month?: string }>
}

export const metadata = { title: 'Agenda scolaire' }

const EVENT_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  EXAM:     { label: 'Examen',     cls: 'bg-red-50 border-red-200',    dot: 'bg-red-400' },
  HOLIDAY:  { label: 'Vacances',   cls: 'bg-green-50 border-green-200', dot: 'bg-green-400' },
  MEETING:  { label: 'Réunion',    cls: 'bg-purple-50 border-purple-200', dot: 'bg-purple-400' },
  ACTIVITY: { label: 'Activité',   cls: 'bg-blue-50 border-blue-200',  dot: 'bg-blue-400' },
  DEADLINE: { label: 'Échéance',   cls: 'bg-orange-50 border-orange-200', dot: 'bg-orange-400' },
  GENERAL:  { label: 'Général',    cls: 'bg-gray-50 border-gray-200',  dot: 'bg-gray-400' },
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function prevMonth(m: string) {
  const d = new Date(m + '-01')
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 7)
}

function nextMonth(m: string) {
  const d = new Date(m + '-01')
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 7)
}

export default async function AgendaPage({ params, searchParams }: Props) {
  const { studentId } = await params
  const { month: rawMonth } = await searchParams
  const month = rawMonth ?? currentMonth()

  const [details, result] = await Promise.all([
    getChildDetails(studentId),
    getChildAgenda(studentId, month),
  ])
  if (!details) notFound()

  const { profile } = details
  const events = result.success ? (result.data ?? []) : []

  const monthLabel = new Date(month + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  // Group events by start_date
  const byDate: Record<string, any[]> = {}
  for (const ev of events) {
    const key = String(ev.start_date).slice(0, 10)
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(ev)
  }
  const sortedDates = Object.keys(byDate).sort()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/parent" className="hover:text-purple-600">Tableau de bord</Link>
        <span>›</span>
        <Link href={`/parent/children/${studentId}`} className="hover:text-purple-600">
          {profile.first_name} {profile.last_name}
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Agenda</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center
                        text-purple-700 font-bold text-lg flex-shrink-0">
          {profile.first_name[0]}{profile.last_name[0]}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile.first_name} {profile.last_name}</h1>
          <p className="text-sm text-gray-500">{profile.class_name} · Agenda scolaire</p>
        </div>
      </div>

      <ChildTabs studentId={studentId} />

      <ParentPaywall featureName="L'agenda scolaire" featureKey="agenda">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Link
          href={`/parent/children/${studentId}/agenda?month=${prevMonth(month)}`}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600
                     bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Mois précédent
        </Link>
        <h2 className="text-base font-semibold text-gray-900 capitalize">{monthLabel}</h2>
        <Link
          href={`/parent/children/${studentId}/agenda?month=${nextMonth(month)}`}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600
                     bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
        >
          Mois suivant
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {sortedDates.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <p className="text-gray-400 text-sm">Aucun événement ce mois</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map(date => {
            const dayEvents = byDate[date]
            const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
              weekday: 'long', day: 'numeric', month: 'long',
            })
            return (
              <div key={date}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 capitalize">
                  {dayLabel}
                </p>
                <div className="space-y-2">
                  {dayEvents.map((ev: any) => {
                    const style = EVENT_STYLE[ev.event_type] ?? EVENT_STYLE.GENERAL
                    return (
                      <div key={ev.id}
                        className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${style.cls}`}>
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${style.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-gray-500">{style.label}</span>
                            {(ev.start_time || ev.end_time) && (
                              <span className="text-xs text-gray-400">
                                {ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-900 mt-0.5">{ev.title}</p>
                          {ev.description && (
                            <p className="text-xs text-gray-500 mt-0.5">{ev.description}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
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
