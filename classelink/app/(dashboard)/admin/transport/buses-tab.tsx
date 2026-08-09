'use client'

import { useState, useTransition } from 'react'
import { createBus, deleteBus } from '@/actions/transport'

interface Bus {
  id: string; plate_number: string; capacity: number | null
  route_id: string | null; route_name: string | null
}

export function BusesTab({ buses, setBuses }: { buses: Bus[]; setBuses: (b: Bus[]) => void }) {
  const [plate, setPlate] = useState('')
  const [capacity, setCapacity] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createBus(plate, capacity ? parseInt(capacity, 10) : null)
      if (!result.success) { setError(result.error); return }
      setBuses([...buses, { id: 'temp-' + Date.now(), plate_number: plate, capacity: capacity ? parseInt(capacity, 10) : null, route_id: null, route_name: null }])
      setPlate(''); setCapacity('')
    })
  }

  function handleDelete(busId: string) {
    if (!confirm('Retirer ce bus ?')) return
    startTransition(async () => {
      await deleteBus(busId)
      setBuses(buses.filter(b => b.id !== busId))
    })
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Immatriculation</label>
          <input value={plate} onChange={e => setPlate(e.target.value)} placeholder="CI-1234-AB" required
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm w-40" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Capacité</label>
          <input value={capacity} onChange={e => setCapacity(e.target.value)} type="number" min="1" placeholder="30"
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm w-24" />
        </div>
        <button type="submit" disabled={pending}
          className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition">
          Ajouter
        </button>
      </form>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {buses.length === 0 ? (
          <p className="px-5 py-10 text-sm text-gray-400 text-center">Aucun bus enregistré.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {buses.map(bus => (
              <div key={bus.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{bus.plate_number}</p>
                  <p className="text-xs text-gray-400">
                    {bus.capacity ? `${bus.capacity} places` : 'Capacité non renseignée'}
                    {bus.route_name ? ` · Itinéraire : ${bus.route_name}` : ''}
                  </p>
                </div>
                <button onClick={() => handleDelete(bus.id)} disabled={pending}
                  className="text-xs text-red-500 hover:text-red-700 transition">Retirer</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
