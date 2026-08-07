import { getTodayCheckIns } from '@/actions/checkins'
import { PageHeader } from '@/components/ui/page-header'
import { CheckinClient } from './checkin-client'

export default async function CafeteriaCheckinPage() {
  const result = await getTodayCheckIns()
  const checkIns = result.success ? (result.data ?? []) : []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check-in cantine"
        description="Saisissez le matricule de l'élève (carte QR) pour pointer son entrée."
      />
      <CheckinClient initialCheckIns={checkIns} />
    </div>
  )
}
