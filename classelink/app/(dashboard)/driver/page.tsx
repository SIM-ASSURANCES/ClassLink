import { getMyRoute } from '@/actions/transport'
import { DriverTripClient } from './driver-trip-client'

export default async function DriverPage() {
  const result = await getMyRoute()

  if (!result.success) {
    return <p className="text-sm text-red-600 bg-red-50 rounded-xl p-4">{result.error}</p>
  }
  if (!result.data) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
        <p className="text-sm text-gray-400">Aucun itinéraire ne vous est encore assigné.</p>
        <p className="text-xs text-gray-400 mt-1">Contactez l&apos;administration de l&apos;école.</p>
      </div>
    )
  }

  return <DriverTripClient route={result.data} />
}
