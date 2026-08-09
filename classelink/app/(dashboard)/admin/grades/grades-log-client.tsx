'use client'

import { useState, useTransition } from 'react'
import { resolveGradeDispute } from '@/actions/grade-disputes'

interface GradeRow {
  id: string
  value: number
  max_value: number
  coefficient: number
  type: string
  comment: string | null
  created_at: string
  subject_name: string
  student_first_name: string
  student_last_name: string
  class_name: string | null
  teacher_first_name: string | null
  teacher_last_name: string | null
  dispute_id: string | null
  dispute_status: string | null
  dispute_reason: string | null
  validated: boolean
}

const TYPE_LABELS: Record<string, string> = {
  DEVOIR: 'Devoir', INTERROGATION: 'Interrogation', COMPOSITION: 'Composition', EXAM: 'Examen',
}

const DISPUTE_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  OPEN:      { label: 'Réclamation ouverte', cls: 'bg-red-100 text-red-700' },
  RESOLVED:  { label: 'Réclamation traitée', cls: 'bg-green-100 text-green-700' },
  DISMISSED: { label: 'Réclamation rejetée', cls: 'bg-gray-100 text-gray-500' },
}

function hoursRemaining(createdAt: string): number {
  const elapsed = Date.now() - new Date(createdAt).getTime()
  return Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - elapsed) / (60 * 60 * 1000)))
}

function ResolveModal({ grade, onClose }: { grade: GradeRow; onClose: () => void }) {
  const [response, setResponse] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handle(status: 'RESOLVED' | 'DISMISSED') {
    setError(null)
    startTransition(async () => {
      const result = await resolveGradeDispute(grade.dispute_id!, status, response)
      if (!result.success) { setError(result.error ?? 'Erreur'); return }
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Réclamation</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-900">
              {grade.student_first_name} {grade.student_last_name} — {grade.subject_name} — {Number(grade.value).toFixed(2)}/{Number(grade.max_value).toFixed(0)}
            </p>
            <p className="text-gray-600 mt-1">{grade.dispute_reason}</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Réponse (optionnelle)</label>
            <textarea value={response} onChange={e => setResponse(e.target.value)} rows={3}
              placeholder="Note corrigée après vérification…"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="flex gap-3">
            <button onClick={() => handle('DISMISSED')} disabled={pending}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">
              Rejeter
            </button>
            <button onClick={() => handle('RESOLVED')} disabled={pending}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {pending ? 'Enregistrement…' : 'Marquer comme traitée'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function GradesLogClient({ grades }: { grades: GradeRow[] }) {
  const [resolveTarget, setResolveTarget] = useState<GradeRow | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'DISPUTED'>('ALL')

  const filtered = grades.filter(g => {
    if (filter === 'PENDING') return !g.validated
    if (filter === 'DISPUTED') return !!g.dispute_id
    return true
  })

  return (
    <>
      <div className="flex gap-2">
        {[
          { key: 'ALL', label: `Toutes (${grades.length})` },
          { key: 'PENDING', label: `En attente (${grades.filter(g => !g.validated).length})` },
          { key: 'DISPUTED', label: `Réclamations (${grades.filter(g => g.dispute_id).length})` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key as typeof filter)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              filter === f.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Aucune note à afficher.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Élève', 'Classe', 'Matière', 'Enseignant', 'Note', 'Type', 'Saisie le', 'Statut', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(g => {
                  const disputeCfg = g.dispute_status ? DISPUTE_STATUS_CFG[g.dispute_status] : null
                  return (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {g.student_first_name} {g.student_last_name}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{g.class_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{g.subject_name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {g.teacher_first_name ? `${g.teacher_first_name} ${g.teacher_last_name}` : '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {Number(g.value).toFixed(2)}/{Number(g.max_value).toFixed(0)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{TYPE_LABELS[g.type] ?? g.type}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(g.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            g.validated ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {g.validated ? 'Validée' : `En attente (${hoursRemaining(g.created_at)}h)`}
                          </span>
                          {disputeCfg && (
                            <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded-full text-xs font-medium ${disputeCfg.cls}`}>
                              {disputeCfg.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {g.dispute_id && g.dispute_status === 'OPEN' && (
                          <button onClick={() => setResolveTarget(g)}
                            className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 text-xs font-medium transition">
                            Traiter
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resolveTarget && <ResolveModal grade={resolveTarget} onClose={() => setResolveTarget(null)} />}
    </>
  )
}
