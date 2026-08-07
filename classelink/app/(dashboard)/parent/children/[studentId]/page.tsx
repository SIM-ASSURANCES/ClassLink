import { getChildDetails, getPaymentAvailability } from '@/actions/parent'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PayOnlineButton } from './pay-button'
import { ChildTabs } from './child-tabs'
import { GradeTrendChart } from '@/components/charts/grade-trend-chart'
import { AttendanceTrendChart } from '@/components/charts/attendance-trend-chart'

interface Props {
  params: Promise<{ studentId: string }>
}

const STATUS: Record<string, { label: string; color: string }> = {
  PENDING:  { label: 'En attente', color: 'bg-yellow-100 text-yellow-700' },
  SUCCESS:  { label: 'Payé',       color: 'bg-green-100 text-green-700' },
  FAILED:   { label: 'Échoué',     color: 'bg-red-100 text-red-700' },
  REFUNDED: { label: 'Remboursé',  color: 'bg-gray-100 text-gray-600' },
}

export default async function ChildDetailPage({ params }: Props) {
  const { studentId } = await params
  const [data, paymentAvailable] = await Promise.all([
    getChildDetails(studentId),
    getPaymentAvailability(),
  ])
  if (!data) notFound()

  const { profile, terms, payments, attendance } = data
  const pendingPayments = payments.filter((p: any) => p.status === 'PENDING')
  const totalAbsences   = attendance.reduce((s: number, t: any) => s + t.absent, 0)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/parent" className="hover:text-purple-600">Tableau de bord</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">{profile.first_name} {profile.last_name}</span>
      </div>

      {/* Navigation onglets */}
      <ChildTabs studentId={studentId} />

      {/* En-tête élève */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center
                        text-purple-700 font-bold text-xl flex-shrink-0">
          {profile.first_name[0]}{profile.last_name[0]}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {profile.first_name} {profile.last_name}
          </h1>
          <p className="text-sm text-gray-500">
            {profile.class_name ? `${profile.class_name} · ` : ''}
            {profile.year_name ?? ''}
            {profile.student_number ? ` · N° ${profile.student_number}` : ''}
          </p>
        </div>
      </div>

      {/* Alertes */}
      {pendingPayments.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-yellow-800">
              {pendingPayments.length} paiement{pendingPayments.length > 1 ? 's' : ''} en attente
            </p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Total dû : {formatCurrency(pendingPayments.reduce((s: number, p: any) => s + p.amount, 0))}
            </p>
          </div>
        </div>
      )}
      {totalAbsences > 5 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <span className="font-semibold">{totalAbsences} absences</span> enregistrées cette année.
          Veuillez contacter l&apos;administration.
        </div>
      )}

      {/* Notes par trimestre */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Moyennes générales</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Évolution de la moyenne générale par trimestre</p>
        </div>
        {terms.length > 0 && (
          <div className="px-5 pt-4">
            <GradeTrendChart terms={terms.map((t: any) => ({ name: t.name, average: t.average }))} />
          </div>
        )}
        <div className="divide-y divide-gray-50">
          {terms.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">Aucun trimestre configuré.</p>
          ) : terms.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center
                                text-purple-700 text-xs font-bold">
                  T{t.term_order}
                </div>
                <span className="text-sm font-medium text-gray-900">{t.name}</span>
              </div>
              {t.average !== null ? (
                <span className={`text-sm font-bold ${t.average >= 10 ? 'text-green-700' : 'text-red-700'}`}>
                  {t.average.toFixed(2)} / 20
                </span>
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Présences */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Présences par trimestre</h2>
        </div>
        {attendance.length > 0 && (
          <div className="px-5 pt-4">
            <AttendanceTrendChart terms={attendance.map((t: any) => ({
              name:   t.term_name,
              present: Math.max((t.total ?? 0) - (t.absent ?? 0) - (t.late ?? 0), 0),
              late:    t.late ?? 0,
              absent:  t.absent ?? 0,
            }))} />
          </div>
        )}
        <div className="divide-y divide-gray-50">
          {attendance.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">Aucune donnée de présence.</p>
          ) : attendance.map((t: any) => {
            const total = t.total ?? 0
            const rate  = total > 0 ? Math.round(((total - t.absent) / total) * 100) : null
            return (
              <div key={t.term_order} className="px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">{t.term_name}</span>
                  {rate !== null && (
                    <span className={`text-xs font-semibold ${rate >= 80 ? 'text-green-600' : 'text-orange-600'}`}>
                      {rate}% présence
                    </span>
                  )}
                </div>
                {total > 0 && rate !== null && (
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div className={`h-full rounded-full ${rate >= 80 ? 'bg-green-500' : 'bg-orange-400'}`}
                      style={{ width: `${rate}%` }} />
                  </div>
                )}
                <div className="flex gap-4 text-xs text-gray-500">
                  {t.absent > 0    && <span className="text-red-600 font-medium">{t.absent} abs.</span>}
                  {t.late > 0      && <span className="text-orange-600">{t.late} retards</span>}
                  {t.unjustified > 0 && <span className="text-red-800 font-semibold">{t.unjustified} non justif.</span>}
                  {t.absent === 0 && t.late === 0 && <span className="text-green-600">Aucune absence</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Paiements */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Historique des paiements</h2>
        </div>
        {payments.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Aucun paiement enregistré.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Frais</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Montant</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Échéance</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Payé le</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.fee_name}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS[p.status]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS[p.status]?.label ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                    {p.due_date ? formatDate(p.due_date) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                    {p.paid_at ? formatDate(p.paid_at) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.status === 'PENDING' && (
                      <PayOnlineButton
                        paymentId={p.id}
                        studentId={studentId}
                        amount={p.amount}
                        feeName={p.fee_name}
                        paymentAvailable={paymentAvailable}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
