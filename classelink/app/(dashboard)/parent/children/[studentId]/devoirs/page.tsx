import { getChildDetails, getChildAssignments } from '@/actions/parent'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChildTabs } from '../child-tabs'
import { ParentPaywall } from '@/components/ui/parent-paywall'

interface Props { params: Promise<{ studentId: string }> }

const SUB_STATUS: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'Rendu ✓',    cls: 'bg-green-100 text-green-700' },
  GRADED:    { label: 'Noté ✓',     cls: 'bg-emerald-100 text-emerald-700' },
  LATE:      { label: 'Retard',     cls: 'bg-orange-100 text-orange-700' },
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

export default async function ChildDevoirsPage({ params }: Props) {
  const { studentId } = await params
  const [details, assignments] = await Promise.all([
    getChildDetails(studentId),
    getChildAssignments(studentId),
  ])
  if (!details || assignments === null) notFound()

  const { profile } = details

  // Séparer : à rendre vs rendus/évalués
  const pending   = assignments.filter((a: any) => !a.submission_id && !isOverdue(a.due_date))
  const overdue   = assignments.filter((a: any) => !a.submission_id && isOverdue(a.due_date))
  const submitted = assignments.filter((a: any) => !!a.submission_id)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/parent" className="hover:text-purple-600">Tableau de bord</Link>
        <span>›</span>
        <Link href={`/parent/children/${studentId}`} className="hover:text-purple-600">
          {profile.first_name} {profile.last_name}
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Devoirs</span>
      </div>

      {/* En-tête */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center
                        text-purple-700 font-bold text-lg flex-shrink-0">
          {profile.first_name[0]}{profile.last_name[0]}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile.first_name} {profile.last_name}</h1>
          <p className="text-sm text-gray-500">{profile.class_name} · Devoirs & Exercices</p>
        </div>
      </div>

      <ChildTabs studentId={studentId} />

      <ParentPaywall featureName="Les devoirs & exercices" featureKey="assignments">
      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{pending.length}</p>
          <p className="text-xs text-blue-500 mt-0.5">À rendre</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{overdue.length}</p>
          <p className="text-xs text-red-500 mt-0.5">En retard</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{submitted.length}</p>
          <p className="text-xs text-green-500 mt-0.5">Rendus</p>
        </div>
      </div>

      {/* En retard */}
      {overdue.length > 0 && (
        <Section title="⚠️ En retard" borderCls="border-red-200">
          {overdue.map((a: any) => <AssignmentCard key={a.id} a={a} status="overdue" />)}
        </Section>
      )}

      {/* À rendre */}
      {pending.length > 0 && (
        <Section title="À rendre" borderCls="border-blue-200">
          {pending.map((a: any) => <AssignmentCard key={a.id} a={a} status="pending" />)}
        </Section>
      )}

      {/* Rendus / évalués */}
      {submitted.length > 0 && (
        <Section title="Rendus & évalués" borderCls="border-gray-200">
          {submitted.map((a: any) => <AssignmentCard key={a.id} a={a} status="submitted" />)}
        </Section>
      )}

      {assignments.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-14 text-center">
          <p className="text-gray-400 text-sm">Aucun devoir enregistré pour cette classe.</p>
        </div>
      )}
      </ParentPaywall>
    </div>
  )
}

function Section({ title, borderCls, children }: {
  title: string; borderCls: string; children: React.ReactNode
}) {
  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${borderCls}`}>
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      </div>
      <div className="divide-y divide-gray-50">{children}</div>
    </div>
  )
}

function AssignmentCard({ a, status }: { a: any; status: 'pending' | 'overdue' | 'submitted' }) {
  const subCfg = SUB_STATUS[a.submission_status] ?? null

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-700">
              Devoir
            </span>
            <span className="text-xs font-medium text-indigo-600">
              {a.subject_name}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
          {a.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.description}</p>
          )}

          {/* Feedback si évalué */}
          {status === 'submitted' && a.feedback && (
            <div className="mt-2 px-3 py-2 bg-purple-50 rounded-lg border border-purple-100">
              <p className="text-xs font-semibold text-purple-700 mb-0.5">Retour du professeur</p>
              <p className="text-xs text-purple-600">{a.feedback}</p>
            </div>
          )}
        </div>

        {/* Méta droite */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {/* Date limite */}
          {a.due_date && (
            <span className={`text-xs font-medium ${status === 'overdue' ? 'text-red-600' : 'text-gray-400'}`}>
              {new Date(a.due_date).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </span>
          )}

          {/* Note si rendu évalué */}
          {status === 'submitted' && a.score !== null && a.score !== undefined && (
            <span className={`text-sm font-bold ${
              parseFloat(a.score) >= 10 ? 'text-green-700' : 'text-red-700'
            }`}>
              {parseFloat(a.score).toFixed(1)} / {a.max_score ?? 20}
            </span>
          )}

          {/* Badge statut */}
          {status === 'submitted' && subCfg && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${subCfg.cls}`}>
              {subCfg.label}
            </span>
          )}
          {status === 'overdue' && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
              En retard
            </span>
          )}
          {status === 'pending' && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              À rendre
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
