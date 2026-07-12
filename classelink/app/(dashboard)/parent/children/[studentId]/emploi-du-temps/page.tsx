import { getChildDetails, getChildSchedule } from '@/actions/parent'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChildTabs } from '../child-tabs'
import { ParentPaywall } from '@/components/ui/parent-paywall'

interface Props { params: Promise<{ studentId: string }> }

const DAYS: { key: number; label: string; short: string }[] = [
  { key: 1, label: 'Lundi',    short: 'LUN' },
  { key: 2, label: 'Mardi',    short: 'MAR' },
  { key: 3, label: 'Mercredi', short: 'MER' },
  { key: 4, label: 'Jeudi',    short: 'JEU' },
  { key: 5, label: 'Vendredi', short: 'VEN' },
  { key: 6, label: 'Samedi',   short: 'SAM' },
]

function fmt(time: string) {
  if (!time) return ''
  return time.slice(0, 5) // "08:00:00" → "08:00"
}

const COLORS = [
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-green-100 text-green-800 border-green-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-pink-100 text-pink-800 border-pink-200',
  'bg-indigo-100 text-indigo-800 border-indigo-200',
  'bg-teal-100 text-teal-800 border-teal-200',
  'bg-red-100 text-red-800 border-red-200',
]

export default async function ChildSchedulePage({ params }: Props) {
  const { studentId } = await params
  const [details, schedule] = await Promise.all([
    getChildDetails(studentId),
    getChildSchedule(studentId),
  ])
  if (!details || schedule === null) notFound()

  const { profile } = details

  // Regrouper par jour
  const byDay: Record<number, any[]> = {}
  for (const d of DAYS) byDay[d.key] = []
  for (const slot of schedule) {
    const day = Number(slot.day_of_week)
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(slot)
  }

  // Palette de couleurs par matière
  const subjectColors: Record<string, string> = {}
  let ci = 0
  for (const slot of schedule) {
    if (!subjectColors[slot.subject_name]) {
      subjectColors[slot.subject_name] = COLORS[ci % COLORS.length]
      ci++
    }
  }

  // Jours avec des cours
  const activeDays = DAYS.filter(d => byDay[d.key].length > 0)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/parent" className="hover:text-purple-600">Tableau de bord</Link>
        <span>›</span>
        <Link href={`/parent/children/${studentId}`} className="hover:text-purple-600">
          {profile.first_name} {profile.last_name}
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Emploi du temps</span>
      </div>

      {/* En-tête */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center
                        text-purple-700 font-bold text-lg flex-shrink-0">
          {profile.first_name[0]}{profile.last_name[0]}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile.first_name} {profile.last_name}</h1>
          <p className="text-sm text-gray-500">{profile.class_name} · Emploi du temps</p>
        </div>
      </div>

      <ChildTabs studentId={studentId} />

      <ParentPaywall featureName="L'emploi du temps" featureKey="schedule">
      {schedule.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-14 text-center">
          <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-400 text-sm">Aucun cours programmé pour cette classe.</p>
        </div>
      ) : (
        <>
          {/* Vue semaine — affichage mobile : accordéon par jour */}
          <div className="block md:hidden space-y-3">
            {activeDays.map(d => (
              <div key={d.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <h2 className="text-sm font-bold text-gray-700">{d.label}</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {byDay[d.key].map((slot: any, i: number) => (
                    <SlotCard key={i} slot={slot} colorCls={subjectColors[slot.subject_name]} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Vue semaine — grille desktop */}
          <div className="hidden md:grid gap-3" style={{ gridTemplateColumns: `repeat(${activeDays.length}, 1fr)` }}>
            {activeDays.map(d => (
              <div key={d.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-center">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{d.short}</p>
                  <p className="text-xs text-gray-400">{d.label}</p>
                </div>
                <div className="p-2 space-y-2">
                  {byDay[d.key].map((slot: any, i: number) => (
                    <SlotCard key={i} slot={slot} colorCls={subjectColors[slot.subject_name]} compact />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Légende matières */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Matières</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(subjectColors).map(([name, cls]) => (
                <span key={name} className={`px-3 py-1 rounded-full text-xs font-medium border ${cls}`}>
                  {name}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
      </ParentPaywall>
    </div>
  )
}

function SlotCard({ slot, colorCls, compact = false }: {
  slot: any; colorCls: string; compact?: boolean
}) {
  if (compact) {
    return (
      <div className={`rounded-lg border px-2 py-1.5 ${colorCls}`}>
        <p className="text-xs font-bold truncate">{slot.subject_name}</p>
        <p className="text-xs opacity-75">{fmt(slot.start_time)} – {fmt(slot.end_time)}</p>
        {slot.room && <p className="text-xs opacity-60">Salle {slot.room}</p>}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-shrink-0 text-center">
        <p className="text-xs font-bold text-gray-700">{fmt(slot.start_time)}</p>
        <p className="text-xs text-gray-400">{fmt(slot.end_time)}</p>
      </div>
      <div className={`flex-1 rounded-lg border px-3 py-2 ${colorCls}`}>
        <p className="text-xs font-bold">{slot.subject_name}</p>
        {slot.teacher_name && <p className="text-xs opacity-75">{slot.teacher_name}</p>}
        {slot.room && <p className="text-xs opacity-60">Salle {slot.room}</p>}
      </div>
    </div>
  )
}
