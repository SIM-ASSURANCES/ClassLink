'use client'

import { useState, useTransition } from 'react'
import { reviewApplication, type ReviewOutcome } from '@/actions/enrollment'
import type { EnrollableClass } from '@/actions/enrollment-settings'
import { formatDate } from '@/lib/utils'
import { ExportExcelButton } from '@/components/ui/export-excel-button'
import Link from 'next/link'
import type { PaginatedResult } from '@/types'

type Attachment = { key: string; label: string; name: string; size: number }

type Application = {
  attachments:      Attachment[] | null
  student_id:       string | null
  id:               string
  first_name:       string
  last_name:        string
  date_of_birth:    string | null
  gender:           string | null
  desired_level:    string | null
  previous_school:  string | null
  previous_average: number | null
  parent_name:      string
  parent_phone:     string
  parent_email:     string | null
  address:          string | null
  notes:            string | null
  status:           string
  review_notes:     string | null
  submitted_at:     string
  academic_year_name: string | null
  reviewer_first_name: string | null
  reviewer_last_name:  string | null
}

type Stats = { pending: number; accepted: number; rejected: number; waitlisted: number; total: number }

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  PENDING:    { label: 'En attente',  cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  ACCEPTED:   { label: 'Accepté',     cls: 'bg-green-100 text-green-700 border-green-200' },
  REJECTED:   { label: 'Refusé',      cls: 'bg-red-100 text-red-700 border-red-200' },
  WAITLISTED: { label: 'Liste att.', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
}

function ApplicationModal({ app, classes, onClose }: { app: Application; classes: EnrollableClass[]; onClose: () => void }) {
  const [decision, setDecision]   = useState<'ACCEPTED' | 'REJECTED' | 'WAITLISTED'>('ACCEPTED')
  const [notes, setNotes]         = useState('')
  const [classId, setClassId]     = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError]         = useState<string | null>(null)
  const [outcome, setOutcome]     = useState<ReviewOutcome | null>(null)
  const [done, setDone]           = useState(false)

  // Une candidature en liste d'attente peut encore être tranchée.
  const canDecide = app.status === 'PENDING' || app.status === 'WAITLISTED'

  const handleDecision = () => {
    setError(null)
    startTransition(async () => {
      const result = await reviewApplication(app.id, decision, notes, { classId: classId || null })
      if (!result.success) { setError(result.error ?? 'Erreur'); return }
      setOutcome(result.data ?? null)
      setDone(true)
      // Après une acceptation on laisse le temps de lire le matricule / l'état de l'invitation.
      setTimeout(onClose, decision === 'ACCEPTED' ? 6000 : 1500)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Dossier de candidature</h3>
            <p className="text-xs text-gray-400">{app.first_name} {app.last_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          {/* Élève */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Élève</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {[
                ['Prénom',       app.first_name],
                ['Nom',          app.last_name],
                ['Date naissance', app.date_of_birth ? formatDate(app.date_of_birth) : '—'],
                ['Sexe',         app.gender === 'M' ? 'Masculin' : app.gender === 'F' ? 'Féminin' : '—'],
                ['Niveau demandé', app.desired_level ?? '—'],
                ['École précédente', app.previous_school ?? '—'],
                ['Moyenne',      app.previous_average ? `${app.previous_average}/20` : '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-gray-400">{k}</p>
                  <p className="font-medium text-gray-800">{v}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Parent */}
          <section className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Parent / Tuteur</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {[
                ['Nom', app.parent_name],
                ['Téléphone', app.parent_phone],
                ['Email',     app.parent_email ?? '—'],
                ['Adresse',   app.address ?? '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-gray-400">{k}</p>
                  <p className="font-medium text-gray-800">{v}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Notes */}
          {app.notes && (
            <section className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Message du candidat</p>
              <p className="text-gray-700 bg-gray-50 rounded-lg p-3 text-xs">{app.notes}</p>
            </section>
          )}

          {/* Pièces jointes — ouvertes via une URL signée courte, jamais publique */}
          {app.attachments && app.attachments.length > 0 && (
            <section className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documents joints</p>
              <ul className="space-y-1">
                {app.attachments.map((a, i) => (
                  <li key={a.key}>
                    <a href={`/api/admin/enrollments/${app.id}/files/${i}`} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs">
                      📎 {a.label} — {a.name} ({Math.max(1, Math.round(a.size / 1024))} Ko)
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {app.status === 'ACCEPTED' && app.student_id && (
            <p className="border-t border-gray-100 pt-4 text-xs">
              <Link href={`/admin/students/${app.student_id}`} className="text-blue-600 hover:underline">
                Voir la fiche de l&apos;élève créé →
              </Link>
            </p>
          )}

          {/* Décision — seulement si la candidature n'est pas encore tranchée */}
          {canDecide && !done && (
            <section className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Prendre une décision</p>
              <div className="flex gap-2 mb-3">
                {(['ACCEPTED', 'WAITLISTED', 'REJECTED'] as const).map(d => (
                  <button key={d}
                    onClick={() => setDecision(d)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition
                      ${decision === d
                        ? d === 'ACCEPTED' ? 'bg-green-600 text-white border-green-600'
                          : d === 'REJECTED' ? 'bg-red-600 text-white border-red-600'
                          : 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {STATUS_CFG[d].label}
                  </button>
                ))}
              </div>
              {decision === 'ACCEPTED' && (
                <div className="mb-3">
                  <label className="block text-xs text-gray-500 mb-1">
                    Classe d&apos;affectation (facultative — l&apos;élève et son parent seront créés à la validation)
                  </label>
                  <select value={classId} onChange={e => setClassId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Sans classe pour le moment</option>
                    {classes.map(c => {
                      const full = c.capacity != null && c.enrolled >= c.capacity
                      return (
                        <option key={c.id} value={c.id} disabled={full}>
                          {c.level} — {c.name} ({c.enrolled}/{c.capacity ?? '∞'}{full ? ', complète' : ''})
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}
              {error && (
                <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Commentaire pour le parent (optionnel)…"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex gap-2 mt-3">
                <button onClick={onClose}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
                  Annuler
                </button>
                <button onClick={handleDecision} disabled={isPending}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
                  {isPending ? 'Enregistrement…' : 'Confirmer'}
                </button>
              </div>
            </section>
          )}
          {done && (
            <div className="text-center text-sm py-2 space-y-1">
              <p className="text-green-600 font-medium">✓ Décision enregistrée</p>
              {outcome?.studentNumber && (
                <p className="text-gray-700">
                  Élève créé — matricule <span className="font-mono font-semibold">{outcome.studentNumber}</span>
                </p>
              )}
              {outcome?.invitation === 'sent' && (
                <p className="text-xs text-gray-500">Un email d&apos;activation a été envoyé au parent.</p>
              )}
              {outcome?.invitation === 'not_sent' && (
                <p className="text-xs text-amber-600">
                  L&apos;email d&apos;activation n&apos;a pas pu être envoyé : utilisez « Réinitialiser le mot de passe » depuis la fiche du parent.
                </p>
              )}
              {outcome?.invitation === 'skipped' && (
                <p className="text-xs text-amber-600">
                  Aucun email parent renseigné : aucun accès n&apos;a été envoyé. Créez-le depuis la fiche du parent.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function EnrollmentsClient({
  result, stats, currentFilters, classes,
}: {
  result:         PaginatedResult<Application>
  stats:          Stats
  currentFilters: { status?: string; search?: string; page?: string }
  classes:        EnrollableClass[]
}) {
  const [selected, setSelected] = useState<Application | null>(null)

  const buildQuery = (overrides: Record<string, string | undefined>) => {
    const merged = { ...currentFilters, ...overrides }
    const qs = Object.entries(merged).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')
    return qs ? `?${qs}` : ''
  }

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'En attente', value: stats.pending,    cls: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
          { label: 'Acceptés',   value: stats.accepted,   cls: 'text-green-700 bg-green-50 border-green-200' },
          { label: 'Refusés',    value: stats.rejected,   cls: 'text-red-700 bg-red-50 border-red-200' },
          { label: 'Liste att.', value: stats.waitlisted, cls: 'text-blue-700 bg-blue-50 border-blue-200' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.cls}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium mt-0.5 opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <form method="GET" className="flex flex-wrap gap-3">
        <input name="search" defaultValue={currentFilters.search}
          placeholder="Rechercher un élève ou parent…"
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64" />
        <select name="status" defaultValue={currentFilters.status ?? ''}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tous les statuts</option>
          <option value="PENDING">En attente</option>
          <option value="ACCEPTED">Acceptés</option>
          <option value="REJECTED">Refusés</option>
          <option value="WAITLISTED">Liste d'attente</option>
        </select>
        <button type="submit"
          className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition">
          Filtrer
        </button>
        <ExportExcelButton
          rows={result.data.map(a => ({
            'Prénom': a.first_name,
            'Nom': a.last_name,
            'Niveau demandé': a.desired_level ?? '',
            'Parent': a.parent_name,
            'Téléphone parent': a.parent_phone,
            'Email parent': a.parent_email ?? '',
            'Statut': STATUS_CFG[a.status]?.label ?? a.status,
            'Soumis le': formatDate(a.submitted_at),
          }))}
          filename="inscriptions.xlsx"
          sheetName="Inscriptions"
          label="Exporter la page"
        />
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {result.data.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="font-medium">Aucune candidature trouvée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Candidat', 'Niveau', 'Parent / Contact', 'Reçue le', 'Statut', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.data.map(app => {
                  const cfg = STATUS_CFG[app.status] ?? STATUS_CFG.PENDING
                  return (
                    <tr key={app.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{app.last_name} {app.first_name}</p>
                        {app.previous_average && (
                          <p className="text-xs text-gray-400">Moy. précédente : {app.previous_average}/20</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{app.desired_level ?? '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 text-xs">{app.parent_name}</p>
                        <p className="text-xs text-gray-400">{app.parent_phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(app.submitted_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelected(app)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 transition">
                          Consulter
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {result.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {result.page} / {result.totalPages}</p>
            <div className="flex gap-2">
              {result.page > 1 && (
                <Link href={buildQuery({ page: String(result.page - 1) })}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium hover:bg-gray-50">← Précédent</Link>
              )}
              {result.page < result.totalPages && (
                <Link href={buildQuery({ page: String(result.page + 1) })}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium hover:bg-gray-50">Suivant →</Link>
              )}
            </div>
          </div>
        )}
      </div>

      {selected && <ApplicationModal app={selected} classes={classes} onClose={() => setSelected(null)} />}
    </>
  )
}
