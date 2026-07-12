'use client'

import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'

interface ParentRow {
  id: string
  email: string
  firstName: string
  lastName: string
  isActive: boolean
  createdAt: string
  childrenCount: number
  subscriptionPaid: boolean
  schoolId: string
  schoolName: string
}

interface Props {
  parents: ParentRow[]
  error?: string
}

export function ParentsDirectoryClient({ parents, error }: Props) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return parents
    return parents.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.schoolName.toLowerCase().includes(q)
    )
  }, [parents, search])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-100 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Annuaire des parents</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {parents.length} parent{parents.length > 1 ? 's' : ''} sur toutes les écoles
          </p>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un nom, email, école..."
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none
                     focus:ring-2 focus:ring-blue-500 w-full sm:w-72"
        />
      </div>

      {error && (
        <div className="p-5 text-sm text-red-700 bg-red-50 border-b border-red-100">{error}</div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="Aucun parent"
          description={search ? 'Aucun résultat pour cette recherche.' : 'Aucun parent enregistré pour le moment.'}
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 3v-2a4 4 0 00-3-3.87" />
            </svg>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Parent</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">École</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Enfants</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Inscrit le</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Abonnement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => (
                <tr key={`${p.schoolId}-${p.id}`} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center
                                      text-purple-700 font-bold text-xs flex-shrink-0">
                        {p.firstName?.[0]?.toUpperCase()}{p.lastName?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{p.firstName} {p.lastName}</p>
                        <p className="text-xs text-gray-400">{p.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-gray-600 hidden md:table-cell">{p.schoolName}</td>
                  <td className="px-4 py-4 text-gray-600 hidden lg:table-cell">{p.childrenCount}</td>
                  <td className="px-4 py-4 text-gray-500 hidden lg:table-cell">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold
                      ${p.subscriptionPaid ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {p.subscriptionPaid ? 'Payé' : 'Non payé'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
