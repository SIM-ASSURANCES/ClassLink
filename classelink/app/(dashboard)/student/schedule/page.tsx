import { getStudentSchedule } from '@/actions/student'
import { ScheduleGrid } from '@/components/schedule/schedule-grid'

export default async function StudentSchedulePage() {
  const slots = await getStudentSchedule()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mon emploi du temps</h1>
          <p className="text-sm text-gray-500 mt-1">Vos cours de la semaine.</p>
        </div>
        <a
          href="/api/ics/schedule"
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600
                     bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          <span className="hidden sm:inline">Exporter (.ics)</span>
        </a>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <ScheduleGrid slots={slots as any[]} showTeacher />
      </div>
    </div>
  )
}
