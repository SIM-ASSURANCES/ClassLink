import { getMonitoringData } from '@/actions/super-admin'
import { PageHeader } from '@/components/ui/page-header'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { MigrateTenantsButton } from './migrate-tenants-button'

/* ─── Helpers ─────────────────────────────────────────────────── */
const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  CREATE:   { label: 'Création',     cls: 'bg-green-100 text-green-700' },
  UPDATE:   { label: 'Modification', cls: 'bg-blue-100 text-blue-700' },
  DELETE:   { label: 'Suppression',  cls: 'bg-red-100 text-red-700' },
  SUSPEND:  { label: 'Suspension',   cls: 'bg-orange-100 text-orange-700' },
  ACTIVATE: { label: 'Activation',   cls: 'bg-emerald-100 text-emerald-700' },
  LOGIN:    { label: 'Connexion',    cls: 'bg-gray-100 text-gray-600' },
}

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_LABELS[action] ?? { label: action, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

/* ─── Barre de progression ────────────────────────────────────── */
function ProgressBar({ value, max, color = 'blue' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const colors: Record<string, string> = {
    blue:    'bg-blue-500',
    green:   'bg-green-500',
    orange:  'bg-orange-500',
    red:     'bg-red-500',
    purple:  'bg-purple-500',
    emerald: 'bg-emerald-500',
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colors[color] ?? 'bg-blue-500'} transition-all`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

/* ─── Page ────────────────────────────────────────────────────── */
export default async function MonitoringPage() {
  const data = await getMonitoringData()

  const maxRevenue = Math.max(...data.monthlyRevenue.map(m => m.amount), 1)

  const healthChecks = [
    {
      label: 'Base de données',
      ok: true,
      desc: 'Connexion Supabase active',
    },
    {
      label: 'Établissements actifs',
      ok: data.activeSchools === data.schoolCount
        ? true
        : data.activeSchools / Math.max(data.schoolCount, 1) > 0.5,
      desc: `${data.activeSchools} / ${data.schoolCount} établissements`,
    },
    {
      label: 'Taux de paiement',
      ok: data.paymentSuccessRate >= 80,
      desc: `${data.paymentSuccessRate}% de succès`,
    },
    {
      label: 'Comptes suspendus',
      ok: data.suspendedSchools === 0,
      desc: data.suspendedSchools === 0
        ? 'Aucun établissement suspendu'
        : `${data.suspendedSchools} suspension(s) active(s)`,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring"
        description="Santé de la plateforme et indicateurs en temps réel"
      />

      {/* ── Santé du système ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
            <h3 className="text-sm font-semibold text-gray-900">Santé du système</h3>
          </div>
          <MigrateTenantsButton />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-100">
          {healthChecks.map(h => (
            <div key={h.label} className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${h.ok ? 'bg-green-400' : 'bg-red-400'}`} />
                <p className="text-xs font-semibold text-gray-700">{h.label}</p>
              </div>
              <p className="text-xs text-gray-400">{h.desc}</p>
              <p className={`text-xs font-medium mt-1 ${h.ok ? 'text-green-600' : 'text-red-600'}`}>
                {h.ok ? '● Opérationnel' : '● Attention requise'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total établissements', value: data.schoolCount,       color: 'border-blue-200 bg-blue-50',    text: 'text-blue-700' },
          { label: 'Actifs',               value: data.activeSchools,     color: 'border-green-200 bg-green-50',   text: 'text-green-700' },
          { label: 'Essais gratuits',      value: data.trialSchools,      color: 'border-yellow-200 bg-yellow-50', text: 'text-yellow-700' },
          { label: 'Suspendus',            value: data.suspendedSchools,  color: 'border-orange-200 bg-orange-50', text: 'text-orange-700' },
          { label: 'Paiements réussis',    value: data.successPayments,   color: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-700' },
          { label: 'Paiements échoués',    value: data.failedPayments,    color: 'border-red-200 bg-red-50',       text: 'text-red-700' },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border ${k.color} p-4`}>
            <p className={`text-2xl font-bold ${k.text}`}>{k.value}</p>
            <p className={`text-xs font-medium mt-0.5 ${k.text} opacity-80`}>{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Revenus 6 mois ───────────────────────────────────── */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Revenus — 6 derniers mois</h3>
            <p className="text-sm font-bold text-green-700">{formatCurrency(data.totalRevenue)} total</p>
          </div>
          <div className="p-5">
            <div className="flex items-end justify-between gap-2 h-40">
              {data.monthlyRevenue.map(m => {
                const pct = maxRevenue > 0 ? (m.amount / maxRevenue) * 100 : 0
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <p className="text-xs text-gray-500 truncate font-medium">
                      {m.amount > 0 ? formatCurrency(m.amount) : '—'}
                    </p>
                    <div className="w-full flex items-end" style={{ height: '80px' }}>
                      <div
                        className="w-full rounded-t-md bg-blue-500 hover:bg-blue-600 transition-all cursor-default"
                        style={{ height: `${Math.max(pct, m.amount > 0 ? 4 : 0)}%` }}
                        title={`${m.month} : ${formatCurrency(m.amount)}`}
                      />
                    </div>
                    <p className="text-xs text-gray-400 truncate text-center w-full">{m.month}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Distribution par plan ────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Répartition par plan</h3>
          </div>
          <div className="p-5 space-y-4">
            {data.planDistribution.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucune donnée</p>
            ) : (
              data.planDistribution.map((p, i) => {
                const colors = ['blue', 'purple', 'emerald', 'orange', 'red']
                const color  = colors[i % colors.length]
                return (
                  <div key={p.name} className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-gray-700">{p.name}</p>
                      <span className="text-xs font-semibold text-gray-500">
                        {p.count} école{p.count > 1 ? 's' : ''}
                      </span>
                    </div>
                    <ProgressBar value={p.count} max={data.schoolCount} color={color} />
                  </div>
                )
              })
            )}
          </div>

          {/* Abonnements par statut */}
          <div className="px-5 pb-5 pt-2 border-t border-gray-100 mt-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Statuts abonnements
            </h4>
            <div className="space-y-2">
              {Object.entries({
                ACTIVE:    { label: 'Actifs',    color: 'emerald' },
                TRIALING:  { label: 'Essais',    color: 'yellow' },
                PAST_DUE:  { label: 'Impayés',   color: 'red' },
                CANCELLED: { label: 'Résiliés',  color: 'orange' },
              }).map(([key, cfg]) => {
                const count = data.subStatusMap[key] ?? 0
                const total = Object.values(data.subStatusMap).reduce((a, b) => a + b, 0)
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between">
                      <p className="text-xs text-gray-600">{cfg.label}</p>
                      <span className="text-xs font-semibold text-gray-500">{count}</span>
                    </div>
                    <ProgressBar value={count} max={Math.max(total, 1)} color={cfg.color} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Taux de succès paiements ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">Taux de succès paiements</p>
            <p className={`text-2xl font-bold ${data.paymentSuccessRate >= 80 ? 'text-green-600' : 'text-red-600'}`}>
              {data.paymentSuccessRate}%
            </p>
          </div>
          <ProgressBar value={data.paymentSuccessRate} max={100}
            color={data.paymentSuccessRate >= 80 ? 'green' : 'red'} />
          <p className="text-xs text-gray-400 mt-2">
            {data.successPayments} réussis · {data.failedPayments} échoués · {data.totalPayments} total
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-1">Revenu total plateforme</p>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(data.totalRevenue)}</p>
          <p className="text-xs text-gray-400 mt-1">Depuis le lancement (paiements confirmés)</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-1">Taux d'activation</p>
          <p className="text-3xl font-bold text-gray-900">
            {data.schoolCount > 0 ? Math.round((data.activeSchools / data.schoolCount) * 100) : 0}%
          </p>
          <div className="mt-2">
            <ProgressBar
              value={data.activeSchools}
              max={Math.max(data.schoolCount, 1)}
              color="blue"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {data.activeSchools} actifs sur {data.schoolCount} écoles
          </p>
        </div>
      </div>

      {/* ── Journal d'audit ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Journal d'audit — 25 dernières actions</h3>
        </div>

        {data.recentLogs.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">Aucune action enregistrée</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Action', 'Ressource', 'École', 'Date'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.recentLogs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {log.resource}
                        {log.resourceId ? ` #${log.resourceId.slice(0, 8)}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 text-xs">
                        {log.school?.name ?? <span className="text-gray-400 italic">Plateforme</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
