'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import {
  createSuperAdminUser,
  updateSuperAdminPermission,
  toggleSuperAdminActive,
} from '@/actions/super-admin'

type SuperAdmin = {
  id:          string
  email:       string
  firstName:   string
  lastName:    string
  isActive:    boolean
  permission:  'READ' | 'EDIT' | 'BOTH'
  createdBy:   string | null
  lastLoginAt: string | Date | null
  createdAt:   string | Date
}

const PERMISSION_LABEL: Record<string, string> = {
  READ:  'Lecture seule',
  EDIT:  'Édition',
  BOTH:  'Accès complet',
}

const PERMISSION_BADGE: Record<string, string> = {
  READ: 'bg-gray-100 text-gray-600',
  EDIT: 'bg-amber-100 text-amber-700',
  BOTH: 'bg-green-100 text-green-700',
}

/* ─── Modal d'ajout ───────────────────────────────────────────── */
function AddAdminModal({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(createSuperAdminUser, null)

  useEffect(() => {
    if (state?.success) onClose()
  }, [state, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Ajouter un collaborateur</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>

        <form action={formAction} className="p-6 space-y-4">
          {state && !state.success && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {state.error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Prénom *</label>
              <input name="firstName" required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nom *</label>
              <input name="lastName" required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
              <input name="email" type="email" required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Mot de passe *</label>
              <input name="password" type="password" required minLength={8}
                placeholder="8 caractères minimum"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Niveau d'accès *</label>
              <select name="permission" defaultValue="READ" required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="READ">Lecture seule — consulte sans modifier</option>
                <option value="EDIT">Édition — peut modifier écoles, plans, abonnements</option>
                <option value="BOTH">Accès complet — peut aussi gérer l'équipe</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
              Annuler
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {pending ? 'Création…' : 'Créer le compte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Main client component ───────────────────────────────────── */
export function TeamClient({
  users,
  currentUserId,
  canManage,
}: {
  users: SuperAdmin[]
  currentUserId: string
  canManage: boolean
}) {
  const [modalOpen, setModalOpen]    = useState(false)
  const [isPending, startTransition] = useTransition()
  const [actionMsg, setActionMsg]    = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const flash = (res: { success: boolean; error?: string }, ok: string) => {
    setActionMsg(res.success ? { type: 'ok', text: ok } : { type: 'err', text: res.error ?? 'Erreur' })
    setTimeout(() => setActionMsg(null), 4000)
  }

  const handlePermissionChange = (admin: SuperAdmin, permission: 'READ' | 'EDIT' | 'BOTH') => {
    if (permission === admin.permission) return
    startTransition(async () => {
      const res = await updateSuperAdminPermission(admin.id, permission)
      flash(res, `Accès de ${admin.firstName} ${admin.lastName} mis à jour.`)
    })
  }

  const handleToggle = (admin: SuperAdmin) => {
    const verb = admin.isActive ? 'désactiver' : 'réactiver'
    if (!confirm(`Voulez-vous ${verb} le compte de ${admin.firstName} ${admin.lastName} ?`)) return
    startTransition(async () => {
      const res = await toggleSuperAdminActive(admin.id, !admin.isActive)
      flash(res, `Compte ${admin.isActive ? 'désactivé' : 'réactivé'}.`)
    })
  }

  return (
    <>
      {actionMsg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border
          ${actionMsg.type === 'ok'
            ? 'bg-green-50 text-green-800 border-green-200'
            : 'bg-red-50 text-red-800 border-red-200'}`}>
          {actionMsg.text}
        </div>
      )}

      {!canManage && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          Seuls les administrateurs à <strong>accès complet</strong> peuvent ajouter ou gérer les collaborateurs.
          Vous consultez la liste en lecture seule.
        </div>
      )}

      {canManage && (
        <div className="flex justify-end">
          <button onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white
                       text-sm font-medium hover:bg-blue-700 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un collaborateur
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Collaborateur', 'Email', 'Accès', 'Statut', 'Ajouté par', 'Dernière connexion', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(admin => {
                const isSelf = admin.id === currentUserId
                return (
                  <tr key={admin.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {admin.firstName} {admin.lastName}
                      {isSelf && <span className="ml-2 text-xs text-gray-400 font-normal">(vous)</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{admin.email}</td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <select
                          value={admin.permission}
                          disabled={isPending}
                          onChange={e => handlePermissionChange(admin, e.target.value as 'READ' | 'EDIT' | 'BOTH')}
                          className="px-2 py-1 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="READ">Lecture seule</option>
                          <option value="EDIT">Édition</option>
                          <option value="BOTH">Accès complet</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PERMISSION_BADGE[admin.permission]}`}>
                          {PERMISSION_LABEL[admin.permission]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                        ${admin.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {admin.isActive ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{admin.createdBy ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString('fr-FR') : 'Jamais'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && !isSelf && (
                        <button onClick={() => handleToggle(admin)} disabled={isPending}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition
                            ${admin.isActive
                              ? 'border border-orange-300 text-orange-700 hover:bg-orange-50'
                              : 'border border-green-300 text-green-700 hover:bg-green-50'}`}>
                          {admin.isActive ? 'Désactiver' : 'Réactiver'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && <AddAdminModal onClose={() => setModalOpen(false)} />}
    </>
  )
}
