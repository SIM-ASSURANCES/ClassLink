'use client'

import { useState, useTransition } from 'react'
import { initiateCafeteriaSubscriptionPayment } from '@/actions/cafeteria'

const MEAL_LABELS: Record<string, string> = {
  LUNCH: 'Déjeuner', SNACK: 'Goûter', LUNCH_SNACK: 'Déjeuner + Goûter',
}

interface Prices { LUNCH: number | null; SNACK: number | null; LUNCH_SNACK: number | null }

export function SubscribeCafeteriaButton({ studentId, prices }: { studentId: string; prices: Prices }) {
  const available = (Object.keys(prices) as (keyof Prices)[]).filter(k => prices[k] != null)
  const [mealType, setMealType] = useState<string>(available[0] ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (available.length === 0) return null

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await initiateCafeteriaSubscriptionPayment(studentId, mealType)
      if (!result.success) { setError(result.error ?? 'Erreur'); return }
      window.location.href = result.data!.paymentUrl
    })
  }

  return (
    <div className="mt-3 flex flex-col sm:flex-row items-center gap-2">
      <select
        value={mealType}
        onChange={e => setMealType(e.target.value)}
        className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
      >
        {available.map(k => (
          <option key={k} value={k}>
            {MEAL_LABELS[k]} — {prices[k]!.toLocaleString('fr-FR')} FCFA/mois
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60
                   text-white text-sm font-semibold transition"
      >
        {pending ? 'Redirection…' : "S'abonner en ligne"}
      </button>
      {error && <p className="text-xs text-red-600 w-full text-center sm:text-left">{error}</p>}
    </div>
  )
}
