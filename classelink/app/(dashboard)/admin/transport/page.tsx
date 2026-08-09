import { getDrivers, getBuses, getRoutes, getStudentsForAssignment } from '@/actions/transport'
import { PageHeader } from '@/components/ui/page-header'
import { TransportClient } from './transport-client'

export default async function AdminTransportPage() {
  const [drivers, buses, routes, students] = await Promise.all([
    getDrivers(),
    getBuses(),
    getRoutes(),
    getStudentsForAssignment(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transport scolaire"
        description="Chauffeurs, bus, itinéraires et affectation des élèves au ramassage."
      />
      <TransportClient
        initialDrivers={drivers.success ? (drivers.data ?? []) : []}
        initialBuses={buses.success ? (buses.data ?? []) : []}
        initialRoutes={routes.success ? (routes.data ?? []) : []}
        initialStudents={students.success ? (students.data ?? []) : []}
      />
    </div>
  )
}
