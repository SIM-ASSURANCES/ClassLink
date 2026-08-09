'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { getChildTransportInfo } from '@/actions/transport'

const BusMap = dynamic(() => import('@/components/transport/bus-map').then(m => m.BusMap), {
  ssr: false,
  loading: () => <div className="h-72 rounded-xl bg-gray-100 animate-pulse" />,
})

interface Driver { firstName: string; lastName: string; phone: string | null; photoUrl: string | null }
interface Stop {
  name: string; latitude: number; longitude: number
  morningPickupTime: string | null; afternoonDropoffTime: string | null
}
interface ActiveTrip { id: string; direction: 'MORNING' | 'AFTERNOON'; startedAt: string }
interface TransportData {
  routeName: string; plateNumber: string | null; stop: Stop; driver: Driver | null
  activeTrip: ActiveTrip | null
  lastLocation: { latitude: number; longitude: number; recorded_at: string } | null
}

const POLL_INTERVAL_MS = 15000

export function TransportLiveView({ studentId, initialData }: { studentId: string; initialData: TransportData }) {
  const [data, setData] = useState(initialData)

  useEffect(() => {
    if (!data.activeTrip) return
    const interval = setInterval(async () => {
      const result = await getChildTransportInfo(studentId)
      if (result.success && result.data) setData(result.data)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [studentId, data.activeTrip])

  const { stop, driver, activeTrip, lastLocation, routeName, plateNumber } = data

  return (
    <div className="space-y-5">
      {activeTrip ? (
        <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-4 flex items-center gap-3">
          <span className="relative flex h-3 w-3 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <div>
            <p className="text-sm font-semibold text-green-800">
              Trajet {activeTrip.direction === 'MORNING' ? 'de ramassage' : 'retour'} en cours
            </p>
            <p className="text-xs text-green-600">
              {lastLocation ? `Position mise à jour à ${new Date(lastLocation.recorded_at).toLocaleTimeString('fr-FR')}` : 'En attente de la première position…'}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm text-gray-500">
          Aucun trajet en cours actuellement.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {routeName} {plateNumber ? `· ${plateNumber}` : ''}
        </p>
        <BusMap
          stops={[{ id: 'stop', name: stop.name, latitude: stop.latitude, longitude: stop.longitude, highlight: true }]}
          busPosition={lastLocation ? { latitude: lastLocation.latitude, longitude: lastLocation.longitude } : null}
          height={288}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Arrêt & horaires</p>
          <p className="text-sm font-semibold text-gray-900">{stop.name}</p>
          <div className="mt-2 space-y-1 text-sm text-gray-600">
            {stop.morningPickupTime && (
              <p>🌅 Ramassage le matin : <strong>{stop.morningPickupTime.slice(0, 5)}</strong></p>
            )}
            {stop.afternoonDropoffTime && (
              <p>🏠 Dépose le soir : <strong>{stop.afternoonDropoffTime.slice(0, 5)}</strong></p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Chauffeur</p>
          {driver ? (
            <div className="flex items-center gap-3">
              {driver.photoUrl ? (
                <img src={driver.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg flex-shrink-0">
                  {driver.firstName[0]}{driver.lastName[0]}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900">{driver.firstName} {driver.lastName}</p>
                {driver.phone && (
                  <a href={`tel:${driver.phone}`} className="text-sm text-purple-600 hover:underline">{driver.phone}</a>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Aucun chauffeur assigné pour l&apos;instant.</p>
          )}
        </div>
      </div>
    </div>
  )
}
