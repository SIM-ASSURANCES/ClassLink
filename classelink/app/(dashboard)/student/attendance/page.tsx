import { getStudentAttendanceSummary } from '@/actions/student'
import { AttendanceTrendChart } from '@/components/charts/attendance-trend-chart'

export default async function StudentAttendancePage() {
  const terms = await getStudentAttendanceSummary()
  const totalAbsent = terms.reduce((s: number, t: any) => s + t.absent, 0)
  const totalUnjustified = terms.reduce((s: number, t: any) => s + t.unjustified, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mes présences</h1>
        <p className="text-sm text-gray-500 mt-1">Suivi de vos absences et retards par trimestre.</p>
      </div>

      {totalAbsent > 0 && (
        <div className={`rounded-xl p-4 border flex items-center gap-4 ${
          totalUnjustified > 3 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="text-center">
            <p className={`text-3xl font-bold ${totalUnjustified > 3 ? 'text-red-700' : 'text-yellow-700'}`}>
              {totalAbsent}
            </p>
            <p className="text-xs text-gray-500">absences</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-orange-700">{totalUnjustified}</p>
            <p className="text-xs text-gray-500">non justifiées</p>
          </div>
          {totalUnjustified > 3 && (
            <p className="text-sm text-red-700 flex-1">
              Vous avez trop d&apos;absences non justifiées. Contactez votre administration.
            </p>
          )}
        </div>
      )}

      {terms.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Évolution par trimestre</h2>
          <AttendanceTrendChart terms={terms.map((t: any) => ({ name: t.name, present: t.present, late: t.late, absent: t.absent }))} />
        </div>
      )}

      <div className="grid gap-4">
        {terms.map((t: any) => {
          const rate = t.total > 0 ? Math.round((t.present / t.total) * 100) : null
          return (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">{t.name}</h2>
                {rate !== null && (
                  <span className={`text-sm font-bold ${rate >= 80 ? 'text-green-600' : rate >= 60 ? 'text-orange-600' : 'text-red-600'}`}>
                    {rate}% de présence
                  </span>
                )}
              </div>
              {t.total === 0 ? (
                <p className="text-sm text-gray-400">Aucune donnée.</p>
              ) : (
                <>
                  {rate !== null && (
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
                      <div className={`h-full rounded-full transition-all ${rate >= 80 ? 'bg-green-500' : rate >= 60 ? 'bg-orange-400' : 'bg-red-500'}`}
                        style={{ width: `${rate}%` }} />
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Présent',      value: t.present,     color: 'text-green-700',  bg: 'bg-green-50' },
                      { label: 'Absent',       value: t.absent,      color: 'text-red-700',    bg: 'bg-red-50' },
                      { label: 'Retard',       value: t.late,        color: 'text-orange-700', bg: 'bg-orange-50' },
                      { label: 'Non justifié', value: t.unjustified, color: 'text-red-800',    bg: 'bg-red-100' },
                    ].map(stat => (
                      <div key={stat.label} className={`${stat.bg} rounded-lg p-3 text-center`}>
                        <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
