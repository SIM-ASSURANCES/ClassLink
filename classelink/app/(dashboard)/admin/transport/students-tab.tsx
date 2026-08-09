'use client'

import { useState, useTransition } from 'react'
import { assignStudentStop, removeStudentAssignment } from '@/actions/transport'

interface Student {
  id: string; first_name: string; last_name: string; class_name: string | null
  route_id: string | null; stop_id: string | null; route_name: string | null; stop_name: string | null
}
interface Route { id: string; name: string; stops: { id: string; name: string }[] }

export function StudentsTab({ students, setStudents, routes }: {
  students: Student[]; setStudents: (s: Student[]) => void; routes: Route[]
}) {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<Record<string, { routeId: string; stopId: string }>>({})

  const filtered = students.filter(s =>
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())
  )

  function handleAssign(studentId: string) {
    const sel = selection[studentId]
    if (!sel?.routeId || !sel?.stopId) return
    startTransition(async () => {
      const result = await assignStudentStop(studentId, sel.routeId, sel.stopId)
      if (!result.success) return
      const route = routes.find(r => r.id === sel.routeId)
      const stop = route?.stops.find(s => s.id === sel.stopId)
      setStudents(students.map(s => s.id === studentId
        ? { ...s, route_id: sel.routeId, stop_id: sel.stopId, route_name: route?.name ?? null, stop_name: stop?.name ?? null }
        : s))
    })
  }

  function handleRemove(studentId: string) {
    startTransition(async () => {
      await removeStudentAssignment(studentId)
      setStudents(students.map(s => s.id === studentId ? { ...s, route_id: null, stop_id: null, route_name: null, stop_name: null } : s))
    })
  }

  return (
    <div className="space-y-4">
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher un élève…"
        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm"
      />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
          {filtered.map(student => {
            const routeStops = routes.find(r => r.id === selection[student.id]?.routeId)?.stops ?? []
            return (
              <div key={student.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-medium text-gray-900">{student.first_name} {student.last_name}</p>
                  <p className="text-xs text-gray-400">{student.class_name ?? 'Classe non assignée'}</p>
                </div>

                {student.route_id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-medium">
                      {student.route_name} — {student.stop_name}
                    </span>
                    <button onClick={() => handleRemove(student.id)} disabled={pending}
                      className="text-xs text-red-500 hover:text-red-700">Retirer</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={selection[student.id]?.routeId ?? ''}
                      onChange={e => setSelection({ ...selection, [student.id]: { routeId: e.target.value, stopId: '' } })}
                      className="px-2 py-1.5 rounded-lg border border-gray-300 text-xs"
                    >
                      <option value="">Itinéraire</option>
                      {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <select
                      value={selection[student.id]?.stopId ?? ''}
                      onChange={e => setSelection({ ...selection, [student.id]: { routeId: selection[student.id]?.routeId ?? '', stopId: e.target.value } })}
                      disabled={!selection[student.id]?.routeId}
                      className="px-2 py-1.5 rounded-lg border border-gray-300 text-xs disabled:opacity-50"
                    >
                      <option value="">Arrêt</option>
                      {routeStops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button onClick={() => handleAssign(student.id)} disabled={pending || !selection[student.id]?.stopId}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium transition">
                      Affecter
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
