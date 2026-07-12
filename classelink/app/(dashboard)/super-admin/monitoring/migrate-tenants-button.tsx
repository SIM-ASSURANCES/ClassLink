'use client'

import { useState, useTransition } from 'react'
import { migrateAllTenants } from '@/actions/super-admin'

/**
 * Réapplique prisma/tenant-schema.sql (idempotent — CREATE TABLE IF NOT
 * EXISTS) à toutes les écoles. Utile quand une nouvelle table/colonne a été
 * ajoutée au schéma tenant après que des écoles existantes ont déjà été
 * provisionnées : n'efface aucune donnée, comble seulement ce qui manque.
 */
export function MigrateTenantsButton() {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const run = () => {
    if (!confirm(
      'Réappliquer le schéma de base de données à TOUTES les écoles ?\n\n' +
      'Sans danger : ça complète les tables/colonnes manquantes sans jamais effacer de données existantes.'
    )) return

    startTransition(async () => {
      const res = await migrateAllTenants()
      if (!res.success) {
        setResult({ type: 'err', text: res.error })
      } else if (!res.data) {
        setResult({ type: 'err', text: 'Erreur' })
      } else {
        const { migrated, failed } = res.data
        setResult({
          type: failed.length === 0 ? 'ok' : 'err',
          text: failed.length === 0
            ? `${migrated} école(s) synchronisée(s) avec succès.`
            : `${migrated} synchronisée(s), échec pour : ${failed.join(', ')}`,
        })
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold
                   hover:bg-blue-100 transition disabled:opacity-50"
      >
        {isPending ? 'Synchronisation…' : 'Synchroniser le schéma de toutes les écoles'}
      </button>
      {result && (
        <p className={`text-xs max-w-xs text-right ${result.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
          {result.text}
        </p>
      )}
    </div>
  )
}
