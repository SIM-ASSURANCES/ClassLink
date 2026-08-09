'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { createRoute, deleteRoute, addStop, deleteStop } from '@/actions/transport'

const BusMap = dynamic(() => import('@/components/transport/bus-map').then(m => m.BusMap), {
  ssr: false,
  loading: () => <div className="h-80 rounded-xl bg-gray-100 animate-pulse" />,
})

interface Stop {
  id: string; stop_order: number; name: string; latitude: number; longitude: number
  morning_pickup_time: string | null; afternoon_dropoff_time: string | null
}
interface Route {
  id: string; name: string; bus_id: string | null; plate_number: string | null
  driver_id: string | null; driver_first_name: string | null; driver_last_name: string | null
  studentCount: number; stops: Stop[]
}

export function RoutesTab({ routes, setRoutes, drivers, buses }: {
  routes: Route[]; setRoutes: (r: Route[]) => void; drivers: any[]; buses: any[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [busId, setBusId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createRoute(name, busId || null, driverId || null)
      if (!result.success) { setError(result.error); return }
      const bus = buses.find(b => b.id === busId)
      const driver = drivers.find(d => d.id === driverId)
      setRoutes([...routes, {
        id: result.data!.id, name, bus_id: busId || null, plate_number: bus?.plate_number ?? null,
        driver_id: driverId || null, driver_first_name: driver?.first_name ?? null, driver_last_name: driver?.last_name ?? null,
        studentCount: 0, stops: [],
      }])
      setName(''); setBusId(''); setDriverId(''); setShowForm(false)
    })
  }

  function handleDeleteRoute(routeId: string) {
    if (!confirm('Supprimer cet itinéraire et tous ses arrêts ?')) return
    startTransition(async () => {
      await deleteRoute(routeId)
      setRoutes(routes.filter(r => r.id !== routeId))
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition">
          {showForm ? 'Annuler' : '+ Nouvel itinéraire'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom de l'itinéraire" required
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          <select value={busId} onChange={e => setBusId(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 text-sm">
            <option value="">Bus (optionnel)</option>
            {buses.map(b => <option key={b.id} value={b.id}>{b.plate_number}</option>)}
          </select>
          <select value={driverId} onChange={e => setDriverId(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 text-sm">
            <option value="">Chauffeur (optionnel)</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}
          </select>
          <button type="submit" disabled={pending}
            className="sm:col-span-3 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition">
            Créer l&apos;itinéraire
          </button>
          {error && <p className="sm:col-span-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </form>
      )}

      {routes.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-400">Aucun itinéraire créé.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map(route => (
            <div key={route.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === route.id ? null : route.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">{route.name}</p>
                  <p className="text-xs text-gray-400">
                    {route.plate_number ?? 'Aucun bus'} · {route.driver_first_name ? `${route.driver_first_name} ${route.driver_last_name}` : 'Aucun chauffeur'}
                    · {route.stops.length} arrêt{route.stops.length > 1 ? 's' : ''} · {route.studentCount} élève{route.studentCount > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span onClick={(e) => { e.stopPropagation(); handleDeleteRoute(route.id) }}
                    className="text-xs text-red-500 hover:text-red-700 cursor-pointer">Supprimer</span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded === route.id ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {expanded === route.id && (
                <RouteStopsEditor route={route} routes={routes} setRoutes={setRoutes} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RouteStopsEditor({ route, routes, setRoutes }: { route: Route; routes: Route[]; setRoutes: (r: Route[]) => void }) {
  const [pending, startTransition] = useTransition()
  const [pickedLatLng, setPickedLatLng] = useState<{ lat: number; lng: number } | null>(null)
  const [stopName, setStopName] = useState('')
  const [morningTime, setMorningTime] = useState('')
  const [afternoonTime, setAfternoonTime] = useState('')
  const [error, setError] = useState<string | null>(null)

  function updateRoute(updated: Route) {
    setRoutes(routes.map(r => r.id === updated.id ? updated : r))
  }

  function handleAddStop() {
    if (!pickedLatLng) { setError('Cliquez sur la carte pour placer l\'arrêt.'); return }
    if (!stopName.trim()) { setError('Nom de l\'arrêt requis.'); return }
    setError(null)
    startTransition(async () => {
      const result = await addStop(route.id, {
        name: stopName, latitude: pickedLatLng.lat, longitude: pickedLatLng.lng,
        morningPickupTime: morningTime || null, afternoonDropoffTime: afternoonTime || null,
      })
      if (!result.success) { setError(result.error); return }
      updateRoute({
        ...route,
        stops: [...route.stops, {
          id: result.data!.id, stop_order: route.stops.length + 1, name: stopName,
          latitude: pickedLatLng.lat, longitude: pickedLatLng.lng,
          morning_pickup_time: morningTime || null, afternoon_dropoff_time: afternoonTime || null,
        }],
      })
      setStopName(''); setMorningTime(''); setAfternoonTime(''); setPickedLatLng(null)
    })
  }

  function handleDeleteStop(stopId: string) {
    startTransition(async () => {
      await deleteStop(stopId)
      updateRoute({ ...route, stops: route.stops.filter(s => s.id !== stopId) })
    })
  }

  return (
    <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50">
      <p className="text-xs text-gray-500">Cliquez sur la carte pour placer un nouvel arrêt, puis complétez les infos ci-dessous.</p>
      <BusMap
        stops={route.stops.map(s => ({ id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude }))}
        busPosition={pickedLatLng ? { latitude: pickedLatLng.lat, longitude: pickedLatLng.lng } : null}
        onMapClick={(lat, lng) => setPickedLatLng({ lat, lng })}
        height={320}
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end bg-white rounded-xl border border-gray-200 p-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Nom de l&apos;arrêt</label>
          <input value={stopName} onChange={e => setStopName(e.target.value)} placeholder="Ex. Carrefour Riviera"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ramassage (matin)</label>
          <input type="time" value={morningTime} onChange={e => setMorningTime(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Dépose (soir)</label>
          <input type="time" value={afternoonTime} onChange={e => setAfternoonTime(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
        </div>
        <button onClick={handleAddStop} disabled={pending}
          className="sm:col-span-4 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold transition">
          {pickedLatLng ? `Ajouter l'arrêt (${pickedLatLng.lat.toFixed(4)}, ${pickedLatLng.lng.toFixed(4)})` : 'Cliquez sur la carte d\'abord'}
        </button>
        {error && <p className="sm:col-span-4 text-sm text-red-600">{error}</p>}
      </div>

      {route.stops.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {route.stops.map(stop => (
            <div key={stop.id} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">{stop.name}</p>
                <p className="text-xs text-gray-400">
                  {stop.morning_pickup_time ? `Ramassage ${stop.morning_pickup_time.slice(0, 5)}` : ''}
                  {stop.afternoon_dropoff_time ? ` · Dépose ${stop.afternoon_dropoff_time.slice(0, 5)}` : ''}
                </p>
              </div>
              <button onClick={() => handleDeleteStop(stop.id)} disabled={pending}
                className="text-xs text-red-500 hover:text-red-700">Retirer</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
