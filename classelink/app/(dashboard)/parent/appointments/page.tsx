import { getParentChildren } from '@/actions/parent'
import { getParentAppointments } from '@/actions/appointments'
import { ParentPaywall } from '@/components/ui/parent-paywall'
import { AppointmentsBooking } from './appointments-booking'

export default async function ParentAppointmentsPage() {
  const [children, apptResult] = await Promise.all([
    getParentChildren(),
    getParentAppointments(),
  ])
  const appointments = apptResult.success ? (apptResult.data ?? []) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rendez-vous</h1>
        <p className="text-sm text-gray-500 mt-1">
          Réservez un créneau avec un enseignant de vos enfants.
        </p>
      </div>

      <ParentPaywall featureName="Les rendez-vous enseignants" featureKey="appointments">
        <AppointmentsBooking children={children} initialAppointments={appointments} />
      </ParentPaywall>
    </div>
  )
}
