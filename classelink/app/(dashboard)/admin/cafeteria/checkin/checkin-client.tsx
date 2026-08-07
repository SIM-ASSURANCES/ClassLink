'use client'

import { useEffect, useRef, useState } from 'react'
import { recordCheckIn } from '@/actions/checkins'

interface CheckIn {
  id: string
  scanned_at: string
  first_name: string
  last_name: string
  class_name: string | null
  scanned_by_first: string
  scanned_by_last: string
}

interface Result {
  ok: boolean
  message: string
  firstName?: string
  lastName?: string
  className?: string | null
  subscriptionActive?: boolean
}

export function CheckinClient({ initialCheckIns }: { initialCheckIns: CheckIn[] }) {
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [history, setHistory] = useState(initialCheckIns)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const studentNumber = value.trim()
    if (!studentNumber || pending) return

    setPending(true)
    setResult(null)
    const res = await recordCheckIn(studentNumber)
    setPending(false)
    setValue('')
    inputRef.current?.focus()

    if (!res.success) {
      setResult({ ok: false, message: res.error })
      return
    }
    if (!res.data) {
      setResult({ ok: false, message: 'Élève introuvable.' })
      return
    }

    setResult({
      ok: true,
      message: res.data.subscriptionActive ? 'Accès autorisé' : 'Abonnement inactif',
      firstName: res.data.firstName,
      lastName: res.data.lastName,
      className: res.data.className,
      subscriptionActive: res.data.subscriptionActive,
    })
    setHistory(prev => [{
      id: `${Date.now()}`,
      scanned_at: new Date().toISOString(),
      first_name: res.data!.firstName,
      last_name: res.data!.lastName,
      class_name: res.data!.className,
      scanned_by_first: '', scanned_by_last: '',
    }, ...prev])
  }

  const cardColor = result === null
    ? 'bg-gray-50 border-gray-200'
    : result.ok && result.subscriptionActive
      ? 'bg-green-50 border-green-300'
      : result.ok
        ? 'bg-amber-50 border-amber-300'
        : 'bg-red-50 border-red-300'

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Scanner ou saisir le matricule élève…"
            disabled={pending}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={pending || !value.trim()}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition"
          >
            {pending ? 'Vérification…' : 'Valider'}
          </button>
        </form>

        <div className={`mt-5 rounded-2xl border-2 p-6 text-center transition ${cardColor}`}>
          {result === null ? (
            <p className="text-sm text-gray-400">En attente d&apos;un scan…</p>
          ) : (
            <>
              <div className="text-4xl mb-2">
                {result.ok && result.subscriptionActive ? '✅' : result.ok ? '⚠️' : '❌'}
              </div>
              <p className={`text-lg font-bold ${
                result.ok && result.subscriptionActive ? 'text-green-700' : result.ok ? 'text-amber-700' : 'text-red-700'
              }`}>
                {result.ok ? `${result.firstName} ${result.lastName}` : 'Élève introuvable'}
              </p>
              {result.ok && (
                <p className="text-sm text-gray-500 mt-1">
                  {result.className ?? 'Classe non assignée'} · {result.message}
                </p>
              )}
              {!result.ok && <p className="text-sm text-red-500 mt-1">{result.message}</p>}
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Check-ins d&apos;aujourd&apos;hui ({history.length})</h2>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Aucun check-in enregistré aujourd&apos;hui.</p>
        ) : (
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {history.map(h => (
              <div key={h.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{h.first_name} {h.last_name}</p>
                  <p className="text-xs text-gray-400">{h.class_name ?? 'Classe non assignée'}</p>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(h.scanned_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
