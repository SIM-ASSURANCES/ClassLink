'use client'

import { useState, useTransition } from 'react'
import { setParentFeatureOverride, bulkSetParentFeatureOverride } from '@/actions/super-admin'
import { PARENT_FEATURES } from '@/lib/parent-feature-flags'

type Override = 'LOCK' | 'UNLOCK' | null

interface Props {
  overrides: Record<string, Override>
}

const STATE_STYLES: Record<string, { label: string; dot: string; text: string }> = {
  auto:   { label: 'Auto (suit l’abonnement)', dot: 'bg-gray-300',   text: 'text-gray-500' },
  UNLOCK: { label: 'Déverrouillé (forcé)',          dot: 'bg-green-500', text: 'text-green-700' },
  LOCK:   { label: 'Verrouillé (forcé)',            dot: 'bg-red-500',   text: 'text-red-700' },
}

export function ParentFeaturesClient({ overrides: initialOverrides }: Props) {
  const [overrides, setOverrides] = useState<Record<string, Override>>(initialOverrides)
  const [isPending, startTransition] = useTransition()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const notify = (type: 'ok' | 'err', text: string) => {
    setFlash({ type, text })
    setTimeout(() => setFlash(null), 4000)
  }

  const setOne = (key: string, override: Override) => {
    setPendingKey(key)
    startTransition(async () => {
      const res = await setParentFeatureOverride(key, override)
      if (res.success) {
        setOverrides(prev => ({ ...prev, [key]: override }))
        notify('ok', 'Mis à jour instantanément.')
      } else {
        notify('err', res.error ?? 'Erreur')
      }
      setPendingKey(null)
    })
  }

  const bulk = (override: Override, label: string) => {
    if (override !== null && !confirm(`${label} pour TOUTES les fonctionnalités de l'espace parent, sur toute la plateforme ?`)) return
    setPendingKey('__bulk__')
    startTransition(async () => {
      const res = await bulkSetParentFeatureOverride(override)
      if (res.success) {
        const next: Record<string, Override> = {}
        for (const f of PARENT_FEATURES) next[f.key] = override
        setOverrides(next)
        notify('ok', `${label} appliqué instantanément.`)
      } else {
        notify('err', res.error ?? 'Erreur')
      }
      setPendingKey(null)
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      {flash && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border
          ${flash.type === 'ok' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {flash.text}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-semibold text-gray-900">Fonctionnalités de l&apos;espace parent</h3>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => bulk('UNLOCK', 'Tout déverrouiller')}
            className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100 transition disabled:opacity-50"
          >
            Tout déverrouiller
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => bulk('LOCK', 'Tout verrouiller')}
            className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition disabled:opacity-50"
          >
            Tout verrouiller
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => bulk(null, 'Réinitialiser')}
            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition disabled:opacity-50"
          >
            Réinitialiser (auto)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PARENT_FEATURES.map(feature => {
          const override = overrides[feature.key] ?? null
          const state = override ?? 'auto'
          const style = STATE_STYLES[state]
          const busy = pendingKey === feature.key || pendingKey === '__bulk__'

          return (
            <div key={feature.key} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">{feature.label}</p>
                <span className={`flex items-center gap-1.5 text-[11px] font-medium ${style.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  {style.label}
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOne(feature.key, 'UNLOCK')}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition disabled:opacity-50
                    ${override === 'UNLOCK' ? 'bg-green-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-green-50 hover:text-green-700'}`}
                >
                  Déverrouiller
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOne(feature.key, null)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition disabled:opacity-50
                    ${override === null ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-200'}`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOne(feature.key, 'LOCK')}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition disabled:opacity-50
                    ${override === 'LOCK' ? 'bg-red-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-red-700'}`}
                >
                  Verrouiller
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
