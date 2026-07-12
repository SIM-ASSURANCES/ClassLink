import { getChildDetails, getChildWeeklySummary } from '@/actions/parent'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChildTabs } from '../child-tabs'
import { ParentPaywall } from '@/components/ui/parent-paywall'

interface Props { params: Promise<{ studentId: string }> }

export const metadata = { title: 'Résumé hebdomadaire' }

const GRADE_TYPE: Record<string, string> = {
  DEVOIR: 'Devoir', INTERROGATION: 'Interro.', COMPOSITION: 'Compo.', EXAM: 'Examen',
}

const SANCTION_LABEL: Record<string, string> = {
  AVERTISSEMENT: 'Avertissement', BLAME: 'Blâme',
  EXCLUSION_TEMP: 'Exclusion temp.', RENVOI: 'Renvoi', AUTRE: 'Autre',
}

function scoreColor(v: number, max: number) {
  const n = (v / max) * 20
  return n >= 14 ? 'text-green-700' : n >= 10 ? 'text-blue-700' : 'text-red-700'
}

export default async function ResumePage({ params }: Props) {
  const { studentId } = await params
  const [details, result] = await Promise.all([
    getChildDetails(studentId),
    getChildWeeklySummary(studentId),
  ])
  if (!details) notFound()

  const { profile } = details
  const summary = result.success ? result.data : null

  const wa = summary?.weekAttendance ?? { present: 0, absent: 0, late: 0 }
  const totalDays = wa.present + wa.absent + wa.late

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/parent" className="hover:text-purple-600">Tableau de bord</Link>
        <span>›</span>
        <Link href={`/parent/children/${studentId}`} className="hover:text-purple-600">
          {profile.first_name} {profile.last_name}
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Résumé hebdo</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center
                        text-purple-700 font-bold text-lg flex-shrink-0">
          {profile.first_name[0]}{profile.last_name[0]}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile.first_name} {profile.last_name}</h1>
          <p className="text-sm text-gray-500">{profile.class_name} · Résumé de la semaine</p>
        </div>
      </div>

      <ChildTabs studentId={studentId} />

      <ParentPaywall featureName="Le résumé hebdomadaire" featureKey="summary">
      {!summary ? (
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-sm text-red-700">
          Impossible de charger le résumé.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Présences */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Présences cette semaine
            </h3>
            {totalDays === 0 ? (
              <p className="text-sm text-gray-400">Aucune donnée cette semaine</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-24 text-xs text-gray-500">Présent</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${(wa.present / totalDays) * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold text-green-700 w-6 text-right">{wa.present}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-24 text-xs text-gray-500">Retard</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-yellow-400 h-2 rounded-full transition-all"
                      style={{ width: `${(wa.late / totalDays) * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold text-yellow-600 w-6 text-right">{wa.late}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-24 text-xs text-gray-500">Absent</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full transition-all"
                      style={{ width: `${(wa.absent / totalDays) * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold text-red-700 w-6 text-right">{wa.absent}</span>
                </div>
              </div>
            )}
          </div>

          {/* Devoirs */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Devoirs à rendre
            </h3>
            <div className="flex items-center gap-3">
              <div className={`text-3xl font-bold ${summary.pendingAssignments > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {summary.pendingAssignments}
              </div>
              <p className="text-sm text-gray-500">
                devoir{summary.pendingAssignments !== 1 ? 's' : ''} à remettre<br />
                dans les 7 prochains jours
              </p>
            </div>
          </div>

          {/* Notes récentes */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Dernières notes
            </h3>
            {summary.recentGrades.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune note récente</p>
            ) : (
              <div className="space-y-2">
                {summary.recentGrades.map((g: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-900">{g.subject_name}</span>
                      <span className="text-xs text-gray-400 ml-2">{GRADE_TYPE[g.type] ?? g.type}</span>
                    </div>
                    <span className={`font-bold ${scoreColor(g.value, g.max_value)}`}>
                      {parseFloat(g.value).toFixed(1)} / {parseFloat(g.max_value).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sanctions récentes */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Sanctions récentes
            </h3>
            {summary.recentSanctions.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <span className="text-lg">✅</span>
                Aucune sanction récente
              </div>
            ) : (
              <div className="space-y-2">
                {summary.recentSanctions.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium text-gray-800">
                        {SANCTION_LABEL[s.type] ?? s.type}
                      </span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className="text-gray-600">{s.reason}</span>
                      <p className="text-xs text-gray-400">
                        {new Date(s.date).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
      </ParentPaywall>
    </div>
  )
}
