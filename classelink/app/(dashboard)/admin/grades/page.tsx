import { getClasses, getTerms, getClassGradesOverview, getRecentGrades } from '@/actions/admin'
import { ExportExcelButton } from '@/components/ui/export-excel-button'
import Link from 'next/link'
import { GradesLogClient } from './grades-log-client'

interface Props {
  searchParams: Promise<{ classId?: string; termId?: string; tab?: string }>
}

export default async function AdminGradesPage({ searchParams }: Props) {
  const params = await searchParams
  const tab = params.tab === 'log' ? 'log' : 'averages'

  const tabsNav = (
    <div className="flex gap-1 border-b border-gray-200">
      {[
        { key: 'averages', label: 'Moyennes' },
        { key: 'log', label: 'Suivi des saisies' },
      ].map(t => (
        <Link
          key={t.key}
          href={`/admin/grades?tab=${t.key}`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )

  if (tab === 'log') {
    const recent = await getRecentGrades()
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Moyennes par classe et suivi de toutes les notes saisies par les enseignants.
          </p>
        </div>
        {tabsNav}
        {recent.success ? (
          <GradesLogClient grades={recent.data ?? []} />
        ) : (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{recent.error}</p>
        )}
      </div>
    )
  }

  const [classes, terms] = await Promise.all([getClasses(), getTerms()])

  const selectedClassId = params.classId ?? ''
  const selectedTermId  = params.termId  ?? (terms[0]?.id ?? '')
  const selectedClass   = classes.find((c: any) => c.id === selectedClassId)
  const selectedTerm    = terms.find((t: any) => t.id === selectedTermId)

  const overview = selectedClassId && selectedTermId
    ? await getClassGradesOverview(selectedClassId, selectedTermId)
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Vue d&apos;ensemble des moyennes par classe et par trimestre.
        </p>
      </div>

      {tabsNav}

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Classe
            </label>
            <div className="flex flex-wrap gap-2">
              {classes.map((c: any) => (
                <Link
                  key={c.id}
                  href={`/admin/grades?classId=${c.id}&termId=${selectedTermId}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    c.id === selectedClassId
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {c.name}
                </Link>
              ))}
              {classes.length === 0 && (
                <p className="text-sm text-gray-400">Aucune classe créée.</p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Trimestre
            </label>
            <div className="flex flex-wrap gap-2">
              {terms.map((t: any) => (
                <Link
                  key={t.id}
                  href={`/admin/grades?classId=${selectedClassId}&termId=${t.id}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    t.id === selectedTermId
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {t.name}
                </Link>
              ))}
              {terms.length === 0 && (
                <p className="text-sm text-gray-400">Aucun trimestre configuré.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tableau des moyennes */}
      {!overview ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm text-gray-400">Sélectionnez une classe et un trimestre</p>
        </div>
      ) : (
        <>
          {/* Résumé de la classe */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {selectedClass?.name} — {selectedTerm?.name}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {overview.rows.length} élèves · {overview.subjects.length} matières
              </p>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
                {overview.rows.filter(r => r.generalAverage !== null && r.generalAverage >= 10).length} reçus
              </span>
              <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-medium">
                {overview.rows.filter(r => r.generalAverage !== null && r.generalAverage < 10).length} recalés
              </span>
              <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
                {overview.rows.filter(r => r.generalAverage === null).length} incomplets
              </span>
            </div>
            <ExportExcelButton
              rows={overview.rows.map((s: any) => ({
                'N° élève': s.student_number,
                'Nom': s.last_name,
                'Prénom': s.first_name,
                ...Object.fromEntries(overview.subjects.map((sub: any) => [sub.code, s.subjectAverages[sub.id] ?? ''])),
                'Moyenne générale': s.generalAverage ?? '',
              }))}
              filename={`moyennes_${selectedClass?.name ?? 'classe'}_${selectedTerm?.name ?? ''}.xlsx`}
              sheetName="Moyennes"
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50">
                    Rang
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Élève
                  </th>
                  {overview.subjects.map((sub: any) => (
                    <th key={sub.id}
                      className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      title={sub.name}
                    >
                      {sub.code}
                      <div className="text-gray-400 font-normal normal-case">
                        ×{sub.coefficient}
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-semibold text-blue-600 uppercase tracking-wide sticky right-0 bg-gray-50">
                    Moy. Gén.
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overview.rows.map((student: any, idx: number) => (
                  <tr key={student.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-xs font-bold text-gray-400 sticky left-0 bg-white">
                      {student.generalAverage !== null ? idx + 1 : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 text-xs
                                        font-bold flex items-center justify-center flex-shrink-0">
                          {student.first_name[0]}{student.last_name[0]}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 whitespace-nowrap">
                            {student.last_name} {student.first_name}
                          </p>
                          <p className="text-xs text-gray-400">{student.student_number}</p>
                        </div>
                      </div>
                    </td>
                    {overview.subjects.map((sub: any) => {
                      const avg = student.subjectAverages[sub.id]
                      return (
                        <td key={sub.id} className="px-3 py-3 text-center">
                          {avg !== null ? (
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                              avg >= 10
                                ? 'bg-green-50 text-green-700'
                                : 'bg-red-50 text-red-700'
                            }`}>
                              {avg.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-gray-200 text-xs">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-center sticky right-0 bg-white">
                      {student.generalAverage !== null ? (
                        <span className={`inline-block px-3 py-1 rounded-lg text-sm font-bold ${
                          student.generalAverage >= 10
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {student.generalAverage.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
