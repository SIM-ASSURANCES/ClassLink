'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Icônes en divIcon (SVG inline) — évite le souci classique de Leaflet/Webpack
// où les images par défaut du marqueur (marker-icon.png) ne se résolvent pas
// correctement une fois empaquetées par Next.js.
const stopIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#6B7280;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

const activeStopIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#7C3AED;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const busIcon = L.divIcon({
  className: '',
  html: `<div style="width:34px;height:34px;border-radius:50%;background:#1800AD;border:3px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:16px">🚌</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
})

export interface StopMarker {
  id: string
  name: string
  latitude: number
  longitude: number
  highlight?: boolean
}

interface Props {
  stops: StopMarker[]
  busPosition?: { latitude: number; longitude: number } | null
  height?: number | string
  /** Si fourni, un clic sur la carte renvoie ses coordonnées (placement d'arrêt). */
  onMapClick?: (lat: number, lng: number) => void
}

function ClickHandler({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onMapClick?.(e.latlng.lat, e.latlng.lng),
  })
  return null
}

function FitBounds({ stops, busPosition }: Props) {
  const map = useMap()
  useEffect(() => {
    const points: [number, number][] = stops.map(s => [s.latitude, s.longitude])
    if (busPosition) points.push([busPosition.latitude, busPosition.longitude])
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 15)
    } else {
      map.fitBounds(points, { padding: [32, 32] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(stops), JSON.stringify(busPosition)])
  return null
}

/** Carte OpenStreetMap (Leaflet) des arrêts d'un itinéraire + position live du bus si fournie. */
export function BusMap({ stops, busPosition, height = 320, onMapClick }: Props) {
  const center: [number, number] = stops[0]
    ? [stops[0].latitude, stops[0].longitude]
    : [5.36, -4.01] // repli : Abidjan

  return (
    <div style={{ height, borderRadius: 12, overflow: 'hidden' }}>
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {stops.map(stop => (
          <Marker key={stop.id} position={[stop.latitude, stop.longitude]} icon={stop.highlight ? activeStopIcon : stopIcon}>
            <Popup>{stop.name}</Popup>
          </Marker>
        ))}
        {busPosition && (
          <Marker position={[busPosition.latitude, busPosition.longitude]} icon={busIcon}>
            <Popup>Position actuelle du car</Popup>
          </Marker>
        )}
        <FitBounds stops={stops} busPosition={busPosition} />
        <ClickHandler onMapClick={onMapClick} />
      </MapContainer>
    </div>
  )
}
