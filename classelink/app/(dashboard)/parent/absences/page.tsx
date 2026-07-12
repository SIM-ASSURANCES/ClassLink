import { getParentChildren } from '@/actions/parent'
import { getChildAbsencesForJustification } from '@/actions/parent'
import { PageHeader } from '@/components/ui/page-header'
import { JustifyForm } from './justify-form'
import { ParentPaywall } from '@/components/ui/parent-paywall'

export default async function ParentAbsencesPage() {
  const children = await getParentChildren()

  return (
    <div>
      <PageHeader
        title="Justifier les absences"
        description="Soumettez des justificatifs pour les absences non justifiées de vos enfants"
      />

      <ParentPaywall featureName="La justification des absences" featureKey="attendance">
      {children.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400 italic">Aucun enfant associé à votre compte.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {children.map((child: any) => (
            <ChildAbsencesSection key={child.id} child={child} />
          ))}
        </div>
      )}
      </ParentPaywall>
    </div>
  )
}

async function ChildAbsencesSection({ child }: { child: any }) {
  const absences = await getChildAbsencesForJustification(child.id)

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
          {child.first_name?.[0]?.toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">
            {child.last_name} {child.first_name}
          </p>
          {child.class_name && (
            <p className="text-xs text-gray-400">{child.class_name}</p>
          )}
        </div>
        <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
          absences.length > 0
            ? 'bg-red-100 text-red-700'
            : 'bg-green-100 text-green-700'
        }`}>
          {absences.length > 0
            ? `${absences.length} absence(s) à justifier`
            : 'Aucune absence non justifiée'}
        </span>
      </div>

      {absences.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-green-700 font-medium">
            Aucune absence non justifiée. Tout est en ordre.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {absences.map((absence: any) => (
            <div key={absence.id} className="px-5 py-4 flex items-start gap-4">
              <div className="flex-shrink-0 pt-0.5">
                <div className="w-2 h-2 rounded-full bg-red-400 mt-1.5"></div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  Absent(e) le{' '}
                  <strong>{new Date(absence.date).toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })}</strong>
                </p>
                {absence.justification && (
                  <p className="text-xs text-gray-500 mt-0.5 italic">
                    Justification existante : {absence.justification}
                  </p>
                )}
              </div>
              <div className="flex-shrink-0 w-72">
                <JustifyForm
                  attendanceId={absence.id}
                  date={new Date(absence.date).toLocaleDateString('fr-FR')}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
