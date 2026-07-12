import { getChildDetails, getChildGrades } from '@/actions/parent'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChildTabs } from '../child-tabs'
import { ParentPaywall } from '@/components/ui/parent-paywall'

interface Props { params: Promise<{ studentId: string }> }

function avgColor(v: number | null) {
  if (v === null) return 'text-gray-400'
  return v >= 14 ? 'text-green-700' : v >= 10 ? 'text-blue-700' : 'text-red-700'
}

export default async function ChildNotesPage({ params }: Props) {
  const { studentId } = await params
  const [details, gradesData] = await Promise.all([
    getChildDetails(studentId),
    getChildGrades(studentId),
  ])
  if (!details || !gradesData) notFound()

  const { profile, terms } = details
  const { terms: termList, rows } = gradesData

  // Regrouper les lignes par term_id
  const byTerm: Record<string, any[]> = {}
  for (const t of termList) byTerm[t.id] = []
  for (const r of rows) {
    if (!byTerm[r.term_id]) byTerm[r.term_id] = []
    byTerm[r.term_id].push(r)
  }

  // Calculer la moyenne générale par trimestre (pondérée par coefficient matière)
  function termAvg(subjects: any[]) {
    let sumWAvg = 0, sumCoef = 0
    for (const s of subjects) {
      if (s.subject_avg !== null) {
        sumWAvg += parseFloat(s.subject_avg) * parseFloat(s.coefficient)
        sumCoef += parseFloat(s.coefficient)
      }
    }
    return sumCoef > 0 ? sumWAvg / sumCoef : null
  }

  const GRADE_TYPE: Record<string, string> = {
    DEVOIR: 'Devoir', INTERROGATION: 'Interro.', COMPOSITION: 'Composition', EXAM: 'Examen',
  }

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
        <span className="text-gray-900 font-medium">Notes</span>
      </div>

      {/* En-tête */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center
                        text-purple-700 font-bold text-lg flex-shrink-0">
          {profile.first_name[0]}{profile.last_name[0]}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile.first_name} {profile.last_name}</h1>
          <p className="text-sm text-gray-500">{profile.class_name} · Notes & Moyennes</p>
        </div>
      </div>

      <ChildTabs studentId={studentId} />

      <ParentPaywall featureName="Les notes & moyennes" featureKey="grades">
      {/* Récapitulatif moyennes par trimestre */}
      <div className="grid grid-cols-3 gap-3">
        {termList.map(t => {
          const subjects = byTerm[t.id] ?? []
          const avg = termAvg(subjects)
          return (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t.name}</p>
              <p className={`text-2xl font-bold ${avgColor(avg)}`}>
                {avg !== null ? avg.toFixed(2) : '—'}
              </p>
              {avg !== null && <p className="text-xs text-gray-400 mt-0.5">/ 20</p>}
            </div>
          )
        })}
      </div>

      {/* Notes par trimestre */}
      {termList.map(t => {
        const subjects = byTerm[t.id] ?? []
        const avg = termAvg(subjects)
        if (subjects.length === 0) return null
        return (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* En-tête trimestre */}
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">{t.name}</h2>
              {avg !== null && (
                <span className={`text-sm font-bold ${avgColor(avg)}`}>
                  Moyenne générale : {avg.toFixed(2)} / 20
                </span>
              )}
            </div>

            {/* Matières */}
            <div className="divide-y divide-gray-50">
              {subjects.map((s: any) => {
                const avg = s.subject_avg !== null ? parseFloat(s.subject_avg) : null
                const grades: any[] = typeof s.grades === 'string'
                  ? JSON.parse(s.grades) : s.grades ?? []
                return (
                  <details key={s.subject_id} className="group">
                    <summary className="flex items-center justify-between px-5 py-3 cursor-pointer
                                        hover:bg-gray-50 list-none select-none">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-indigo-400" />
                        <span className="text-sm font-medium text-gray-900">{s.subject_name}</span>
                        <span className="text-xs text-gray-400">coeff. {parseFloat(s.coefficient)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{s.grade_count} note{s.grade_count > 1 ? 's' : ''}</span>
                        <span className={`text-sm font-bold ${avgColor(avg)}`}>
                          {avg !== null ? `${avg.toFixed(2)} / 20` : '—'}
                        </span>
                        <svg className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform"
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </summary>

                    {/* Détail des notes */}
                    {grades.length > 0 && (
                      <div className="px-5 pb-4 pt-1">
                        <div className="flex flex-wrap gap-2">
                          {grades.map((g: any, i: number) => (
                            <div key={g.id ?? i}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                              <span className={`text-sm font-bold ${avgColor(parseFloat(g.value))}`}>
                                {parseFloat(g.value).toFixed(2)}
                              </span>
                              <span className="text-gray-300">/</span>
                              <span className="text-xs text-gray-400">20</span>
                              {g.coefficient > 1 && (
                                <span className="text-xs text-gray-400">×{g.coefficient}</span>
                              )}
                              <span className="text-xs text-gray-400 border-l border-gray-200 pl-2">
                                {GRADE_TYPE[g.type] ?? g.type}
                              </span>
                              {g.published_at && (
                                <span className="text-xs text-gray-300">
                                  {new Date(g.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </details>
                )
              })}
            </div>
          </div>
        )
      })}

      {termList.every(t => (byTerm[t.id] ?? []).length === 0) && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-14 text-center">
          <p className="text-gray-400 text-sm">Aucune note enregistrée pour cette année.</p>
        </div>
      )}
      </ParentPaywall>
    </div>
  )
}
