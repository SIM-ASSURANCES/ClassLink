import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getBulletinData } from '@/actions/bulletin'
import { PrintButton } from './print-button'
import { ParentPaywall } from '@/components/ui/parent-paywall'

interface Props {
  params: Promise<{ studentId: string; termId: string }>
}

function avgColor(avg: number | null) {
  if (avg === null) return 'text-gray-400'
  return avg >= 10 ? 'text-green-700' : 'text-red-700'
}

function appreciation(avg: number | null): string {
  if (avg === null) return '—'
  if (avg >= 16) return 'Très bien'
  if (avg >= 14) return 'Bien'
  if (avg >= 12) return 'Assez bien'
  if (avg >= 10) return 'Passable'
  return 'Insuffisant'
}

export default async function ParentBulletinDetailPage({ params }: Props) {
  const { studentId, termId } = await params

  const result = await getBulletinData(studentId, termId)

  if (!result.success) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-white rounded-xl border border-red-200 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-base font-semibold text-gray-900 mb-1">Bulletin momentanément indisponible</p>
        <p className="text-sm text-gray-500 mb-5">{result.error ?? 'Une erreur est survenue.'}</p>
        <Link
          href={`/parent/children/${studentId}/bulletin/${termId}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition"
        >
          Réessayer
        </Link>
      </div>
    )
  }

  if (!result.data) notFound()

  const { student, term, school, subjects, general_average, class_average, rank, attendance, council } = result.data

  const avg = general_average !== null ? parseFloat(String(general_average)) : null
  const classAvg = class_average !== null ? parseFloat(String(class_average)) : null

  return (
    <>
      {/* Barre d'actions — masquée à l'impression */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/parent" className="hover:text-purple-600">Tableau de bord</Link>
          <span>›</span>
          <Link href={`/parent/children/${studentId}`} className="hover:text-purple-600">
            {student.first_name} {student.last_name}
          </Link>
          <span>›</span>
          <Link href={`/parent/children/${studentId}/bulletin`} className="hover:text-purple-600">
            Bulletins
          </Link>
          <span>›</span>
          <span className="text-gray-900 font-medium">{term?.name ?? 'Trimestre'}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/parent/children/${studentId}/bulletin`}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition print:hidden"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Retour
          </Link>
          <PrintButton studentId={studentId} termId={termId} />
        </div>
      </div>

      <ParentPaywall featureName="Le bulletin de notes" featureKey="bulletins">
      {/* ══════════════════ BULLETIN (zone imprimable) ══════════════════ */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-3xl mx-auto
                      print:border-0 print:rounded-none print:p-0 print:max-w-none print:mx-0">

        {/* En-tête école */}
        <div className="flex items-start justify-between border-b-2 border-gray-800 pb-4 mb-5">
          <div>
            <p className="text-xl font-bold text-gray-900 uppercase tracking-wide">
              {school?.school_name ?? 'Établissement'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900 uppercase">Bulletin de notes</p>
            <p className="text-sm text-gray-600 mt-0.5">{term?.name ?? ''} — {student.year_name ?? ''}</p>
          </div>
        </div>

        {/* Informations élève */}
        <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4 mb-5 border border-gray-200">
          <div className="space-y-1.5">
            <div className="flex gap-2 text-sm">
              <span className="text-gray-500 w-24 flex-shrink-0">Nom & Prénom</span>
              <span className="font-semibold text-gray-900">
                {student.last_name?.toUpperCase()} {student.first_name}
              </span>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="text-gray-500 w-24 flex-shrink-0">N° Élève</span>
              <span className="font-mono text-gray-900">{student.student_number ?? '—'}</span>
            </div>
            {student.date_of_birth && (
              <div className="flex gap-2 text-sm">
                <span className="text-gray-500 w-24 flex-shrink-0">Né(e) le</span>
                <span className="text-gray-900">
                  {new Date(student.date_of_birth).toLocaleDateString('fr-FR')}
                </span>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex gap-2 text-sm">
              <span className="text-gray-500 w-20 flex-shrink-0">Classe</span>
              <span className="font-semibold text-gray-900">{student.class_name ?? '—'}</span>
            </div>
            {rank !== null && (
              <div className="flex gap-2 text-sm">
                <span className="text-gray-500 w-20 flex-shrink-0">Rang</span>
                <span className="font-semibold text-gray-900">
                  {rank}<sup>{rank === 1 ? 'er' : 'ème'}</sup>
                </span>
              </div>
            )}
            {classAvg !== null && (
              <div className="flex gap-2 text-sm">
                <span className="text-gray-500 w-20 flex-shrink-0">Moy. classe</span>
                <span className="font-semibold text-gray-900">{classAvg.toFixed(2)} / 20</span>
              </div>
            )}
          </div>
        </div>

        {/* Tableau des matières */}
        {subjects.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-8">Aucune note enregistrée pour ce trimestre.</p>
        ) : (
          <table className="w-full text-sm mb-5 border border-gray-300 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-gray-800 text-white text-xs uppercase tracking-wide">
                <th className="text-left px-3 py-2.5">Matière</th>
                <th className="text-center px-3 py-2.5">Coeff.</th>
                <th className="text-center px-3 py-2.5">Moy. / 20</th>
                <th className="text-left px-3 py-2.5">Appréciation</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((sub: any, i: number) => {
                const subAvg = sub.subject_avg !== null ? parseFloat(String(sub.subject_avg)) : null
                return (
                  <tr key={sub.subject_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 font-medium text-gray-900">{sub.subject_name}</td>
                    <td className="px-3 py-2 text-center text-gray-600">{sub.coefficient}</td>
                    <td className={`px-3 py-2 text-center font-bold ${avgColor(subAvg)}`}>
                      {subAvg !== null ? subAvg.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 italic">
                      {appreciation(subAvg)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 border-t-2 border-gray-800">
                <td colSpan={2} className="px-3 py-2.5 font-bold text-gray-900 text-right">
                  Moyenne générale
                </td>
                <td className={`px-3 py-2.5 text-center text-lg font-bold ${avgColor(avg)}`}>
                  {avg !== null ? avg.toFixed(2) : '—'}
                </td>
                <td className={`px-3 py-2.5 font-semibold italic ${avgColor(avg)}`}>
                  {appreciation(avg)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* Absences et Signatures */}
        <div className="grid grid-cols-2 gap-5 mb-6">
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Présences — {term?.name}
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Absences :</span>
                <span className={`ml-1 font-semibold ${attendance.absent > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {attendance.absent}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Retards :</span>
                <span className={`ml-1 font-semibold ${attendance.late > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                  {attendance.late}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Non justif. :</span>
                <span className={`ml-1 font-semibold ${attendance.unjustified > 0 ? 'text-red-800' : 'text-green-700'}`}>
                  {attendance.unjustified}
                </span>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Signatures</p>
            <div className="flex justify-between text-xs text-gray-500 mt-4">
              <div className="text-center">
                <div className="h-8 border-b border-gray-300 w-24 mb-1"></div>
                <p>Le directeur</p>
              </div>
              <div className="text-center">
                <div className="h-8 border-b border-gray-300 w-24 mb-1"></div>
                <p>Parent / Tuteur</p>
              </div>
            </div>
          </div>
        </div>

        {/* Décision conseil de classe */}
        {council && (
          <div className="border border-gray-200 rounded-lg p-4 mb-5 bg-blue-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Décision du conseil de classe</p>
            {council.decision && (
              <p className="text-sm font-semibold text-gray-900 mb-1">
                Décision : <span className="text-blue-700">{council.decision}</span>
              </p>
            )}
            {council.appreciation && (
              <p className="text-sm text-gray-700 italic mb-1">&quot;{council.appreciation}&quot;</p>
            )}
            {council.council_comment && (
              <p className="text-sm text-gray-600">{council.council_comment}</p>
            )}
          </div>
        )}

        {/* Pied de page */}
        <div className="border-t border-gray-200 pt-3 text-center text-xs text-gray-400">
          Bulletin généré par MyClassLink · {new Date().toLocaleDateString('fr-FR')}
        </div>
      </div>
      </ParentPaywall>

      {/* Styles d'impression */}
      <style>{`
        @media print {
          body { background: white !important; }
          @page { margin: 1cm; size: A4; }
        }
      `}</style>
    </>
  )
}
