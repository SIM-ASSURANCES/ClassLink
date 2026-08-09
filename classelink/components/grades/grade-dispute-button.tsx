'use client'

import { useEffect, useState, useTransition } from 'react'
import { disputeGrade } from '@/actions/grade-disputes'

const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  OPEN:      { label: 'Réclamation envoyée', cls: 'bg-amber-100 text-amber-700' },
  RESOLVED:  { label: 'Réclamation traitée',  cls: 'bg-green-100 text-green-700' },
  DISMISSED: { label: 'Réclamation rejetée',  cls: 'bg-gray-100 text-gray-500' },
}

interface Dispute { id: string; status: string }

export function GradeDisputeButton({
  gradeId,
  createdAt,
  dispute,
}: {
  gradeId: string
  createdAt: string | Date
  dispute: Dispute | null
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [localDispute, setLocalDispute] = useState(dispute)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [now, setNow] = useState<number | null>(null)

  // Évite un mismatch d'hydratation SSR/CSR (Date.now() diffère entre le
  // rendu serveur et le premier rendu client) — la fenêtre 24h n'est évaluée
  // qu'après le montage.
  useEffect(() => setNow(Date.now()), [])

  if (localDispute) {
    const cfg = STATUS_CFG[localDispute.status] ?? { label: localDispute.status, cls: 'bg-gray-100 text-gray-500' }
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span>
    )
  }

  if (now === null) return null
  const withinWindow = now - new Date(createdAt).getTime() < DISPUTE_WINDOW_MS
  if (!withinWindow) return null

  function submit() {
    if (!reason.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await disputeGrade(gradeId, reason.trim())
      if (!result.success) { setError(result.error ?? 'Erreur'); return }
      setLocalDispute({ id: 'pending', status: 'OPEN' })
      setOpen(false)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-red-500 underline decoration-dotted"
      >
        Contester
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">Contester cette note</h3>
            <p className="text-xs text-gray-500 mb-4">
              Expliquez le motif — un administrateur examinera votre réclamation.
            </p>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
            )}
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Motif de la contestation…"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
                Annuler
              </button>
              <button type="button" onClick={submit} disabled={pending || !reason.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60">
                {pending ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
