'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface TermAttendance {
  name: string
  present: number
  late: number
  absent: number
}

// Palette de statut fixe (present = bon, retard = alerte, absence = critique) —
// toujours accompagnée d'une icône/légende, jamais la couleur seule qui porte le sens.
const STATUS = {
  present: { color: '#0ca30c', label: 'Présences' },
  late:    { color: '#fab219', label: 'Retards' },
  absent:  { color: '#d03b3b', label: 'Absences' },
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-gray-900 dark:text-gray-100">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          {STATUS[p.dataKey as keyof typeof STATUS].label} : <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function LegendContent() {
  return (
    <div className="flex items-center justify-center gap-4 text-xs text-gray-600 dark:text-gray-300 pt-1">
      {Object.values(STATUS).map(s => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

/** Présences/retards/absences par trimestre — 3 séries de statut, légende + tooltip obligatoires. */
export function AttendanceTrendChart({ terms }: { terms: TermAttendance[] }) {
  const hasData = terms.some(t => t.present + t.late + t.absent > 0)

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400 dark:text-gray-500">
        Aucune donnée de présence pour l&apos;instant.
      </div>
    )
  }

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={terms} margin={{ top: 12, right: 16, bottom: 0, left: -16 }} barGap={2}>
          <CartesianGrid vertical={false} strokeDasharray="0" stroke="var(--border)" strokeOpacity={0.6} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
          <Legend content={<LegendContent />} />
          <Bar dataKey="present" name="Présences" fill={STATUS.present.color} radius={[4, 4, 0, 0]} maxBarSize={20} />
          <Bar dataKey="late" name="Retards" fill={STATUS.late.color} radius={[4, 4, 0, 0]} maxBarSize={20} />
          <Bar dataKey="absent" name="Absences" fill={STATUS.absent.color} radius={[4, 4, 0, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
