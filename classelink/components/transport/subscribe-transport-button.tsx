'use client'

import { useState, useTransition } from 'react'
import { initiateTransportSubscriptionPayment } from '@/actions/transport'

export function SubscribeTransportButton({ studentId, price }: { studentId: string; price: number }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await initiateTransportSubscriptionPayment(studentId)
      if (!result.success) { setError(result.error ?? 'Erreur'); return }
      window.location.href = result.data!.paymentUrl
    })
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60
                   text-white text-sm font-semibold transition"
      >
        {pending ? 'Redirection vers le paiement…' : `S'abonner en ligne — ${price.toLocaleString('fr-FR')} FCFA/mois`}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
