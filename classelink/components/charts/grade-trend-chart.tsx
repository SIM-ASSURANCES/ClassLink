'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot } from 'recharts'

interface TermAverage {
  name: string
  average: number | null
}

const BRAND = '#1800AD' // couleur de marque MyClassLink — série unique, pas de légende nécessaire

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const value = payload[0].value
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-gray-900 dark:text-gray-100">{label}</p>
      <p className="text-gray-600 dark:text-gray-300 mt-0.5">
        Moyenne : <span className="font-bold" style={{ color: BRAND }}>{value?.toFixed(2) ?? '—'} / 20</span>
      </p>
    </div>
  )
}

function EndDot(props: any) {
  const { cx, cy, index, dataLength, value } = props
  if (value === null || value === undefined) return null
  const isLast = index === dataLength - 1
  return (
    <Dot cx={cx} cy={cy} r={isLast ? 5 : 4} fill={BRAND} stroke="var(--background)" strokeWidth={2} />
  )
}

/** Évolution de la moyenne générale par trimestre — série unique (pas de légende, le titre du bloc suffit). */
export function GradeTrendChart({ terms }: { terms: TermAverage[] }) {
  const data = terms.map(t => ({ name: t.name, average: t.average }))
  const hasData = data.some(d => d.average !== null)

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400 dark:text-gray-500">
        Pas encore assez de notes pour afficher une tendance.
      </div>
    )
  }

  const last = [...data].reverse().find(d => d.average !== null)

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} strokeDasharray="0" stroke="var(--border)" strokeOpacity={0.6} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 20]}
            ticks={[0, 10, 20]}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border)' }} />
          <Line
            type="monotone"
            dataKey="average"
            stroke={BRAND}
            strokeWidth={2}
            dot={(props: any) => <EndDot key={props.index} {...props} dataLength={data.length} />}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {last && (
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 -mt-2">
          Dernière moyenne connue : <span className="font-semibold" style={{ color: BRAND }}>{last.average?.toFixed(2)} / 20</span>
        </p>
      )}
    </div>
  )
}
