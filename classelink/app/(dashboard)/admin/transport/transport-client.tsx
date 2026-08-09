'use client'

import { useState } from 'react'
import { DriversTab } from './drivers-tab'
import { BusesTab } from './buses-tab'
import { RoutesTab } from './routes-tab'
import { StudentsTab } from './students-tab'

const TABS = [
  { key: 'routes',  label: 'Itinéraires' },
  { key: 'drivers', label: 'Chauffeurs' },
  { key: 'buses',   label: 'Bus' },
  { key: 'students', label: 'Élèves' },
] as const

type TabKey = (typeof TABS)[number]['key']

interface Props {
  initialDrivers: any[]
  initialBuses: any[]
  initialRoutes: any[]
  initialStudents: any[]
}

export function TransportClient({ initialDrivers, initialBuses, initialRoutes, initialStudents }: Props) {
  const [tab, setTab] = useState<TabKey>('routes')
  const [drivers, setDrivers] = useState(initialDrivers)
  const [buses, setBuses] = useState(initialBuses)
  const [routes, setRoutes] = useState(initialRoutes)
  const [students, setStudents] = useState(initialStudents)

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'routes' && (
        <RoutesTab routes={routes} setRoutes={setRoutes} drivers={drivers} buses={buses} />
      )}
      {tab === 'drivers' && (
        <DriversTab drivers={drivers} setDrivers={setDrivers} />
      )}
      {tab === 'buses' && (
        <BusesTab buses={buses} setBuses={setBuses} />
      )}
      {tab === 'students' && (
        <StudentsTab students={students} setStudents={setStudents} routes={routes} />
      )}
    </div>
  )
}
