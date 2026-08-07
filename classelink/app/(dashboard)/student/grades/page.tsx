import { getStudentTerms, getStudentGrades, getStudentTermAverages } from '@/actions/student'
import { GradeTrendChart } from '@/components/charts/grade-trend-chart'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ termId?: string }>
}

const TYPE_LABELS: Record<string, string> = {
  DEVOIR: 'Devoir', INTERROGATION: 'Interro.', COMPOSITION: 'Compo.', EXAM: 'Examen',
}

export default async function StudentGradesPage({ searchParams }: Props) {
  const params = await searchParams
  const [terms, termAverages] = await Promise.all([getStudentTerms(), getStudentTermAverages()])
  const selectedTermId = params.termId ?? (terms[0]?.id ?? '')
  const selectedTerm   = terms.find((t: any) => t.id === selectedTermId)
  const { rows, generalAverage } = selectedTermId
    ? await getStudentGrades(selectedTermId)
    : { rows: [], generalAverage: null }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mes notes</h1>
        <p className="text-sm text-gray-500 mt-1">Consultez vos notes et moyennes par trimestre.</p>
      </div>

      {termAverages.some((t: any) => t.average !== null) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Évolution de la moyenne générale</h2>
          <GradeTrendChart terms={termAverages} />
        </div>
      )}

      {/* Sélecteur trimestre */}
      <div className="flex flex-wrap gap-2">
        {terms.map((t: any) => (
          <Link key={t.id} href={`/student/grades?termId=${t.id}`}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
              t.id === selectedTermId
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
            }`}>
            {t.name}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-400">Aucune note disponible pour ce trimestre.</p>
        </div>
      ) : (
        <>
          {/* Moyenne générale */}
          {generalAverage != null && (
            <div className={`rounded-xl p-5 border ${generalAverage >= 10 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Moyenne générale — {selectedTerm?.name}
                  </p>
                  <p className={`text-4xl font-bold mt-1 ${generalAverage >= 10 ? 'text-green-700' : 'text-red-700'}`}>
                    {generalAverage.toFixed(2)} <span className="text-lg font-normal opacity-60">/ 20</span>
                  </p>
                </div>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold border-4 ${
                  generalAverage >= 10 ? 'border-green-400 text-green-700 bg-white' : 'border-red-400 text-red-700 bg-white'
                }`}>
                  {generalAverage >= 10 ? '✓' : '✗'}
                </div>
              </div>
            </div>
          )}

          {/* Notes par matière */}
          <div className="space-y-3">
            {rows.map((sub: any) => (
              <div key={sub.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                      {sub.code}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{sub.name}</span>
                    <span className="text-xs text-gray-400">coeff. {sub.coefficient}</span>
                  </div>
                  {sub.average !== null && (
                    <span className={`text-base font-bold ${sub.average >= 10 ? 'text-green-700' : 'text-red-700'}`}>
                      {sub.average.toFixed(2)} / 20
                    </span>
                  )}
                </div>
                <div className="px-5 py-3 flex flex-wrap gap-2">
                  {sub.grades.length === 0 ? (
                    <span className="text-xs text-gray-300 italic">Aucune note</span>
                  ) : sub.grades.map((g: any) => (
                    <div key={g.id} className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <span className="text-xs text-gray-400">{TYPE_LABELS[g.type] ?? g.type}</span>
                      <span className={`text-sm font-bold ${parseFloat(g.value) >= 10 ? 'text-green-700' : 'text-red-600'}`}>
                        {parseFloat(g.value).toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-400">×{g.coefficient}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
