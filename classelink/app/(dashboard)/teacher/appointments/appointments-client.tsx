'use client'

import { useState, useTransition } from 'react'
import { createAvailabilitySlot, deleteAvailabilitySlot, cancelAppointment } from '@/actions/appointments'

interface Slot {
  id: string
  start_time: string
  end_time: string
  location: string | null
  appointment_id: string | null
  appointment_status: string | null
  reason: string | null
  parent_first_name: string | null
  parent_last_name: string | null
  student_first_name: string | null
  student_last_name: string | null
}

function formatRange(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  const dateLabel = s.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const timeLabel = `${s.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} – ${e.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  return { dateLabel, timeLabel }
}

export function AppointmentsClient({ slots }: { slots: Slot[] }) {
  const [pending, startTransition] = useTransition()
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleCreate() {
    setError(null)
    setSuccess(false)
    if (!date || !startTime || !endTime) {
      setError('Date et horaires requis.')
      return
    }
    startTransition(async () => {
      const result = await createAvailabilitySlot(`${date}T${startTime}`, `${date}T${endTime}`, location)
      if (!result.success) setError(result.error ?? 'Erreur')
      else {
        setSuccess(true)
        setStartTime('')
        setEndTime('')
        setLocation('')
        setTimeout(() => setSuccess(false), 3000)
      }
    })
  }

  function handleDelete(slotId: string) {
    startTransition(async () => { await deleteAvailabilitySlot(slotId) })
  }

  function handleCancel(appointmentId: string) {
    startTransition(async () => { await cancelAppointment(appointmentId) })
  }

  const now = Date.now()
  const upcoming = slots.filter(s => new Date(s.start_time).getTime() >= now)
  const past = slots.filter(s => new Date(s.start_time).getTime() < now)

  return (
    <div className="space-y-6">
      {/* Nouveau créneau */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Publier un créneau</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Début</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fin</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Lieu <span className="text-gray-400 font-normal">(optionnel)</span></label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Salle 12, visio…"
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40" />
          </div>
          <button onClick={handleCreate} disabled={pending}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
            Publier
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="mt-3 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">Créneau publié.</p>}
      </div>

      {/* À venir */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Créneaux à venir</h2>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Aucun créneau publié.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {upcoming.map(slot => {
              const { dateLabel, timeLabel } = formatRange(slot.start_time, slot.end_time)
              const booked = slot.appointment_id && slot.appointment_status === 'CONFIRMED'
              return (
                <div key={slot.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 capitalize">{dateLabel}</p>
                    <p className="text-xs text-gray-500">{timeLabel}{slot.location ? ` · ${slot.location}` : ''}</p>
                    {booked && (
                      <p className="text-xs text-purple-600 font-medium mt-1">
                        Réservé par {slot.parent_first_name} {slot.parent_last_name}
                        {slot.student_first_name ? ` (${slot.student_first_name} ${slot.student_last_name})` : ''}
                        {slot.reason ? ` — ${slot.reason}` : ''}
                      </p>
                    )}
                  </div>
                  {booked ? (
                    <button onClick={() => handleCancel(slot.appointment_id!)} disabled={pending}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition disabled:opacity-50">
                      Annuler le RDV
                    </button>
                  ) : (
                    <button onClick={() => handleDelete(slot.id)} disabled={pending}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 transition disabled:opacity-50">
                      Retirer
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Historique */}
      {past.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Historique</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {past.map(slot => {
              const { dateLabel, timeLabel } = formatRange(slot.start_time, slot.end_time)
              const booked = slot.appointment_id && slot.appointment_status === 'CONFIRMED'
              return (
                <div key={slot.id} className="px-5 py-3">
                  <p className="text-sm text-gray-600 capitalize">{dateLabel} · {timeLabel}</p>
                  {booked && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Avec {slot.parent_first_name} {slot.parent_last_name}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
