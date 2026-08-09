'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import {
  assignStudentStop,
  removeStudentAssignment,
  subscribeStudentTransport,
  updateBusSubscriptionStatus,
} from '@/actions/transport'
import type { ActionResult } from '@/types'

interface Student {
  id: string; first_name: string; last_name: string; class_name: string | null
  route_id: string | null; stop_id: string | null; route_name: string | null; stop_name: string | null
  subscription_id: string | null; subscription_status: string | null; subscription_amount: number | null
}
interface Route { id: string; name: string; stops: { id: string; name: string }[] }

const SUB_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  ACTIVE:    { label: 'Abonné',     cls: 'bg-green-100 text-green-700' },
  SUSPENDED: { label: 'Suspendu',   cls: 'bg-orange-100 text-orange-700' },
  CANCELLED: { label: 'Annulé',     cls: 'bg-red-100 text-red-700' },
}

/* ─── Modal d'abonnement ──────────────────────────────────────── */
async function subscribeAction(
  prevState: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const studentId = formData.get('studentId') as string
  const startDate = formData.get('startDate') as string
  const amount    = parseFloat(formData.get('amount') as string ?? '0')
  return subscribeStudentTransport(studentId, startDate, amount)
}

function SubscribeModal({
  student,
  onClose,
  onSubscribed,
}: {
  student: Student
  onClose: () => void
  onSubscribed: (subscriptionId: string) => void
}) {
  const [state, formAction, pending] = useActionState(subscribeAction, null)
  const formRef = useRef<HTMLFormElement>(null)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (state?.success && state.data) onSubscribed(state.data.id)
  }, [state, onSubscribed])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">
            Abonner {student.first_name} {student.last_name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>

        <form ref={formRef} action={formAction} className="p-6 space-y-4">
          <input type="hidden" name="studentId" value={student.id} />

          {state && !state.success && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {state.error}
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date de début *</label>
            <input name="startDate" type="date" required defaultValue={today}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Montant mensuel (FCFA)</label>
            <input name="amount" type="number" min={0} step={500}
              defaultValue={student.subscription_amount ?? 0}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
              Annuler
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {pending ? 'Enregistrement…' : 'Abonner'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Main ────────────────────────────────────────────────────── */
export function StudentsTab({ students, setStudents, routes }: {
  students: Student[]; setStudents: (s: Student[]) => void; routes: Route[]
}) {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<Record<string, { routeId: string; stopId: string }>>({})
  const [subModalStudent, setSubModalStudent] = useState<Student | null>(null)

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

  function handleSubStatus(student: Student, status: string) {
    if (!student.subscription_id) return
    startTransition(async () => {
      const result = await updateBusSubscriptionStatus(student.subscription_id!, status)
      if (!result.success) return
      setStudents(students.map(s => s.id === student.id ? { ...s, subscription_status: status } : s))
    })
  }

  function handleSubscribed(subscriptionId: string) {
    if (!subModalStudent) return
    setStudents(students.map(s => s.id === subModalStudent.id
      ? { ...s, subscription_id: subscriptionId, subscription_status: 'ACTIVE' }
      : s))
    setSubModalStudent(null)
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
            const subCfg = student.subscription_status ? SUB_STATUS_CFG[student.subscription_status] : null

            return (
              <div key={student.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-medium text-gray-900">{student.first_name} {student.last_name}</p>
                  <p className="text-xs text-gray-400">{student.class_name ?? 'Classe non assignée'}</p>
                </div>

                {/* Affectation itinéraire/arrêt */}
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

                {/* Abonnement transport */}
                <div className="flex items-center gap-2">
                  {subCfg ? (
                    <>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${subCfg.cls}`}>
                        {subCfg.label}
                      </span>
                      {student.subscription_status === 'ACTIVE' ? (
                        <button onClick={() => handleSubStatus(student, 'SUSPENDED')} disabled={pending}
                          className="text-xs text-orange-600 hover:text-orange-800">Suspendre</button>
                      ) : (
                        <button onClick={() => handleSubStatus(student, 'ACTIVE')} disabled={pending}
                          className="text-xs text-green-600 hover:text-green-800">Réactiver</button>
                      )}
                    </>
                  ) : (
                    <button onClick={() => setSubModalStudent(student)} disabled={pending}
                      className="px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 text-xs font-medium transition">
                      Abonner
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {subModalStudent && (
        <SubscribeModal
          student={subModalStudent}
          onClose={() => setSubModalStudent(null)}
          onSubscribed={handleSubscribed}
        />
      )}
    </div>
  )
}
