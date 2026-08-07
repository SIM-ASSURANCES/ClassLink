'use client'

import { useEffect, useState, useTransition } from 'react'
import { getChildTeachers, getTeacherOpenSlots, bookAppointment, cancelAppointment, getParentAppointments } from '@/actions/appointments'

interface Child { id: string; first_name: string; last_name: string }
interface Teacher { teacher_id: string; first_name: string; last_name: string; subject_name: string }
interface Slot { id: string; start_time: string; end_time: string; location: string | null }
interface Appointment {
  id: string; status: string; reason: string | null
  start_time: string; end_time: string; location: string | null
  teacher_first_name: string; teacher_last_name: string
  student_first_name: string | null; student_last_name: string | null
}

function formatRange(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  const dateLabel = s.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const timeLabel = `${s.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} – ${e.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  return { dateLabel, timeLabel }
}

export function AppointmentsBooking({ children, initialAppointments }: { children: Child[]; initialAppointments: Appointment[] }) {
  const [pending, startTransition] = useTransition()
  const [studentId, setStudentId] = useState(children[0]?.id ?? '')
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [teacherId, setTeacherId] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [appointments, setAppointments] = useState(initialAppointments)
  const [loadingTeachers, setLoadingTeachers] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)

  useEffect(() => {
    if (!studentId) return
    setTeacherId(''); setSlots([]); setLoadingTeachers(true)
    getChildTeachers(studentId).then(r => {
      setTeachers(r.success ? (r.data ?? []) : [])
      setLoadingTeachers(false)
    })
  }, [studentId])

  useEffect(() => {
    if (!teacherId) { setSlots([]); return }
    setLoadingSlots(true)
    getTeacherOpenSlots(teacherId).then(r => {
      setSlots(r.success ? (r.data ?? []) : [])
      setLoadingSlots(false)
    })
  }, [teacherId])

  function handleBook(slotId: string) {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await bookAppointment(slotId, studentId, reason)
      if (!result.success) {
        setError(result.error ?? 'Erreur')
        return
      }
      setSuccess(true)
      setReason('')
      setSlots(prev => prev.filter(s => s.id !== slotId))
      const refreshed = await getParentAppointments()
      if (refreshed.success) setAppointments(refreshed.data ?? [])
      setTimeout(() => setSuccess(false), 3000)
    })
  }

  function handleCancel(appointmentId: string) {
    startTransition(async () => {
      await cancelAppointment(appointmentId)
      setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, status: 'CANCELLED' } : a))
    })
  }

  const upcoming = appointments.filter(a => a.status === 'CONFIRMED' && new Date(a.start_time).getTime() >= Date.now())
  const history = appointments.filter(a => a.status !== 'CONFIRMED' || new Date(a.start_time).getTime() < Date.now())

  if (children.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
        <p className="text-sm text-gray-400">Aucun enfant associé à votre compte.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Réservation */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Réserver un créneau</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Enfant</label>
            <select value={studentId} onChange={e => setStudentId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
              {children.map(c => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Enseignant</label>
            <select value={teacherId} onChange={e => setTeacherId(e.target.value)} disabled={loadingTeachers}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50">
              <option value="">{loadingTeachers ? 'Chargement…' : 'Choisir un enseignant'}</option>
              {teachers.map(t => (
                <option key={t.teacher_id} value={t.teacher_id}>
                  {t.first_name} {t.last_name} — {t.subject_name}
                </option>
              ))}
            </select>
            {!loadingTeachers && teacherId === '' && teachers.length === 0 && studentId && (
              <p className="text-xs text-gray-400 mt-1">Aucun enseignant trouvé pour cet enfant.</p>
            )}
          </div>
        </div>

        {teacherId && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Motif <span className="text-gray-400 font-normal">(optionnel)</span></label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Suivi scolaire, orientation…"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">Rendez-vous réservé.</p>}

        {teacherId && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Créneaux disponibles</p>
            {loadingSlots ? (
              <p className="text-sm text-gray-400">Chargement…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun créneau disponible pour cet enseignant actuellement.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {slots.map(slot => {
                  const { dateLabel, timeLabel } = formatRange(slot.start_time, slot.end_time)
                  return (
                    <button key={slot.id} onClick={() => handleBook(slot.id)} disabled={pending}
                      className="text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-purple-400 hover:bg-purple-50 transition disabled:opacity-50">
                      <p className="text-sm font-medium text-gray-900 capitalize">{dateLabel}</p>
                      <p className="text-xs text-gray-500">{timeLabel}{slot.location ? ` · ${slot.location}` : ''}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mes rendez-vous */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Mes rendez-vous à venir</h2>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Aucun rendez-vous à venir.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {upcoming.map(a => {
              const { dateLabel, timeLabel } = formatRange(a.start_time, a.end_time)
              return (
                <div key={a.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 capitalize">{dateLabel} · {timeLabel}</p>
                    <p className="text-xs text-gray-500">
                      {a.teacher_first_name} {a.teacher_last_name}
                      {a.student_first_name ? ` — ${a.student_first_name} ${a.student_last_name}` : ''}
                      {a.location ? ` · ${a.location}` : ''}
                    </p>
                    {a.reason && <p className="text-xs text-gray-400 italic mt-0.5">{a.reason}</p>}
                  </div>
                  <button onClick={() => handleCancel(a.id)} disabled={pending}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition disabled:opacity-50 flex-shrink-0">
                    Annuler
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Historique</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {history.map(a => {
              const { dateLabel, timeLabel } = formatRange(a.start_time, a.end_time)
              return (
                <div key={a.id} className="px-5 py-3">
                  <p className={`text-sm capitalize ${a.status === 'CANCELLED' ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                    {dateLabel} · {timeLabel}
                  </p>
                  <p className="text-xs text-gray-400">
                    {a.teacher_first_name} {a.teacher_last_name}
                    {a.status === 'CANCELLED' ? ' — annulé' : ''}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
