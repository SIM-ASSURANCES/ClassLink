import { getTeacherAvailabilitySlots } from '@/actions/appointments'
import { AppointmentsClient } from './appointments-client'

export default async function TeacherAppointmentsPage() {
  const result = await getTeacherAvailabilitySlots()
  const slots = result.success ? (result.data ?? []) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rendez-vous</h1>
        <p className="text-sm text-gray-500 mt-1">
          Publiez des créneaux de disponibilité pour les parents et gérez vos rendez-vous.
        </p>
      </div>

      {!result.success && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {result.error}
        </div>
      )}

      <AppointmentsClient slots={slots} />
    </div>
  )
}
