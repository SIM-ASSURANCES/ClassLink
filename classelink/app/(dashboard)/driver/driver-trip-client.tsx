'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { startTrip, endTrip, reportLocation } from '@/actions/transport'

const BusMap = dynamic(() => import('@/components/transport/bus-map').then(m => m.BusMap), {
  ssr: false,
  loading: () => <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />,
})

interface Stop { id: string; name: string; latitude: number; longitude: number; morning_pickup_time: string | null; afternoon_dropoff_time: string | null }
interface Trip { id: string; direction: 'MORNING' | 'AFTERNOON'; status: string; started_at: string; ended_at: string | null }
interface RouteData { routeId: string; routeName: string; plateNumber: string | null; stops: Stop[]; studentCount: number; todayTrips: Trip[] }

const REPORT_INTERVAL_MS = 15000

export function DriverTripClient({ route }: { route: RouteData }) {
  const activeTripFromServer = route.todayTrips.find(t => t.status === 'IN_PROGRESS') ?? null
  const [activeTrip, setActiveTrip] = useState<Trip | null>(activeTripFromServer)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)

  const watchIdRef = useRef<number | null>(null)
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tripIdRef = useRef<string | null>(activeTrip?.id ?? null)

  useEffect(() => {
    tripIdRef.current = activeTrip?.id ?? null
    if (activeTrip) {
      startWatching()
    } else {
      stopWatching()
    }
    return stopWatching
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip?.id])

  function startWatching() {
    if (!('geolocation' in navigator)) {
      setGeoError('La géolocalisation n\'est pas disponible sur cet appareil/navigateur.')
      return
    }
    setGeoError(null)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        lastPositionRef.current = p
        setPosition(p)
      },
      () => setGeoError('Localisation refusée ou indisponible — autorisez l\'accès à la position pour continuer.'),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
    intervalRef.current = setInterval(() => {
      const p = lastPositionRef.current
      const tripId = tripIdRef.current
      if (p && tripId) reportLocation(tripId, p.lat, p.lng)
    }, REPORT_INTERVAL_MS)
  }

  function stopWatching() {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
    watchIdRef.current = null
    intervalRef.current = null
  }

  async function handleStart(direction: 'MORNING' | 'AFTERNOON') {
    setPending(true); setError(null)
    const result = await startTrip(direction)
    setPending(false)
    if (!result.success) { setError(result.error); return }
    setActiveTrip({ id: result.data!.tripId, direction, status: 'IN_PROGRESS', started_at: new Date().toISOString(), ended_at: null })
  }

  async function handleEnd() {
    if (!activeTrip) return
    setPending(true); setError(null)
    const result = await endTrip(activeTrip.id)
    setPending(false)
    if (!result.success) { setError(result.error); return }
    setActiveTrip(null)
    setPosition(null)
  }

  const morningDone = route.todayTrips.some(t => t.direction === 'MORNING' && t.status === 'COMPLETED')
  const afternoonDone = route.todayTrips.some(t => t.direction === 'AFTERNOON' && t.status === 'COMPLETED')

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h1 className="text-lg font-bold text-gray-900">{route.routeName}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {route.plateNumber ?? 'Bus non renseigné'} · {route.studentCount} élève{route.studentCount > 1 ? 's' : ''} · {route.stops.length} arrêt{route.stops.length > 1 ? 's' : ''}
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {geoError && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{geoError}</p>}

      {activeTrip ? (
        <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-5 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-green-700">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <p className="font-semibold text-sm">
              Trajet {activeTrip.direction === 'MORNING' ? 'ramassage matin' : 'retour'} en cours
            </p>
          </div>
          <p className="text-xs text-green-600">Position envoyée automatiquement toutes les 15 secondes.</p>
          <button onClick={handleEnd} disabled={pending}
            className="w-full px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold transition">
            {pending ? 'Fin en cours…' : 'Terminer le trajet'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={() => handleStart('MORNING')} disabled={pending}
            className="px-4 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition">
            🌅 Démarrer le ramassage
            {morningDone && <span className="block text-xs font-normal opacity-80 mt-1">Déjà effectué aujourd&apos;hui — relancer ?</span>}
          </button>
          <button onClick={() => handleStart('AFTERNOON')} disabled={pending}
            className="px-4 py-4 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold transition">
            🏠 Démarrer le retour
            {afternoonDone && <span className="block text-xs font-normal opacity-80 mt-1">Déjà effectué aujourd&apos;hui — relancer ?</span>}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Itinéraire</p>
        <BusMap
          stops={route.stops.map(s => ({ id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude }))}
          busPosition={position ? { latitude: position.lat, longitude: position.lng } : null}
          height={260}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50">
        {route.stops.map(stop => (
          <div key={stop.id} className="px-4 py-3">
            <p className="text-sm font-medium text-gray-900">{stop.name}</p>
            <p className="text-xs text-gray-400">
              {stop.morning_pickup_time ? `Ramassage ${stop.morning_pickup_time.slice(0, 5)}` : ''}
              {stop.afternoon_dropoff_time ? ` · Dépose ${stop.afternoon_dropoff_time.slice(0, 5)}` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
