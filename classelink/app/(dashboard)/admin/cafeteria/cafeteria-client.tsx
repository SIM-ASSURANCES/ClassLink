'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { upsertMenu, updateSubscriptionStatus } from '@/actions/cafeteria'
import type { ActionResult } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Menu {
  id: string
  week_start: string | Date
  day_of_week: number
  meal_type: string
  description: string
  price: number | null
}

interface Subscription {
  id: string
  student_id: string
  first_name: string
  last_name: string
  class_name: string | null
  meal_type: string
  start_date: string | Date
  status: string
  amount: number | null
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const DAYS: Record<number, string> = {
  1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi',
}

const MEAL_LABELS: Record<string, string> = {
  LUNCH:  'Déjeuner',
  SNACK:  'Goûter',
  DINNER: 'Dîner',
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  ACTIVE:    { label: 'Actif',    cls: 'bg-green-100 text-green-700 border-green-200' },
  SUSPENDED: { label: 'Suspendu', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  CANCELLED: { label: 'Annulé',  cls: 'bg-red-100 text-red-700 border-red-200' },
}

function formatDate(d: string | Date | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getISOWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

// ─── Menu Modal ──────────────────────────────────────────────────────────────

interface MenuModalProps {
  open: boolean
  onClose: () => void
  weekStart: string
  dayOfWeek?: number
  mealType?: string
  existingMenu?: Menu | null
}

export function MenuModal({ open, onClose, weekStart, dayOfWeek, mealType, existingMenu }: MenuModalProps) {
  const [state, formAction, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    upsertMenu,
    null
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset()
      onClose()
    }
  }, [state, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {existingMenu ? 'Modifier le menu' : 'Nouveau menu'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form ref={formRef} action={formAction} className="px-6 py-5 space-y-4">
          {state && !state.success && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {state.error}
            </p>
          )}

          <input type="hidden" name="weekStart" value={weekStart} />

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="mm-day">
              Jour de la semaine
            </label>
            <select
              id="mm-day"
              name="dayOfWeek"
              required
              defaultValue={dayOfWeek ?? 1}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(DAYS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="mm-mealType">
              Type de repas
            </label>
            <select
              id="mm-mealType"
              name="mealType"
              required
              defaultValue={mealType ?? 'LUNCH'}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="LUNCH">Déjeuner</option>
              <option value="SNACK">Goûter</option>
              <option value="DINNER">Dîner</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="mm-description">
              Description du menu <span className="text-red-500">*</span>
            </label>
            <textarea
              id="mm-description"
              name="description"
              rows={3}
              required
              defaultValue={existingMenu?.description ?? ''}
              placeholder="Riz au gras, poulet, salade, dessert…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="mm-price">
              Prix (FCFA)
            </label>
            <input
              id="mm-price"
              name="price"
              type="number"
              min={0}
              step={50}
              defaultValue={existingMenu?.price ?? 0}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600
                         hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium
                         hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Subscription Modal ───────────────────────────────────────────────────────

interface SubModalProps {
  open: boolean
  onClose: () => void
}

async function subscribeAction(
  prevState: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const { subscribeStudent } = await import('@/actions/cafeteria')
  const studentId = formData.get('studentId') as string
  const mealType  = formData.get('mealType')  as string
  const startDate = formData.get('startDate') as string
  const amount    = parseFloat(formData.get('amount') as string ?? '0')
  return subscribeStudent(studentId, mealType, startDate, amount)
}

export function SubscribeModal({ open, onClose }: SubModalProps) {
  const [state, formAction, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    subscribeAction,
    null
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset()
      onClose()
    }
  }, [state, onClose])

  if (!open) return null

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Abonner un élève</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form ref={formRef} action={formAction} className="px-6 py-5 space-y-4">
          {state && !state.success && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {state.error}
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="sub-studentId">
              N° élève (matricule) <span className="text-red-500">*</span>
            </label>
            <input
              id="sub-studentId"
              name="studentId"
              type="text"
              required
              placeholder="Ex. EL-26-123456"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="sub-mealType">
              Type de repas
            </label>
            <select
              id="sub-mealType"
              name="mealType"
              required
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="LUNCH">Déjeuner</option>
              <option value="SNACK">Goûter</option>
              <option value="LUNCH_SNACK">Déjeuner + Goûter</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="sub-startDate">
              Date de début <span className="text-red-500">*</span>
            </label>
            <input
              id="sub-startDate"
              name="startDate"
              type="date"
              required
              defaultValue={today}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="sub-amount">
              Montant mensuel (FCFA)
            </label>
            <input
              id="sub-amount"
              name="amount"
              type="number"
              min={0}
              step={500}
              defaultValue={0}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600
                         hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium
                         hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {pending ? 'Enregistrement…' : 'Abonner'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main CafeteriaClient component ──────────────────────────────────────────

interface CafeteriaClientProps {
  menus: Menu[]
  subscriptions: Subscription[]
  activeTab: string
  weekStart: string
}

export function CafeteriaClient({ menus, subscriptions, activeTab, weekStart }: CafeteriaClientProps) {
  const [menuModal, setMenuModal] = useState<{
    open: boolean; day?: number; mealType?: string; existing?: Menu | null
  }>({ open: false })
  const [subModalOpen, setSubModalOpen] = useState(false)
  const [updatingSubId, setUpdatingSubId] = useState<string | null>(null)

  // Navigation semaines
  const currentWeekStart = new Date(weekStart)
  const prevWeek = new Date(currentWeekStart)
  prevWeek.setDate(prevWeek.getDate() - 7)
  const nextWeek = new Date(currentWeekStart)
  nextWeek.setDate(nextWeek.getDate() + 7)

  function getMenu(day: number, mealType: string): Menu | undefined {
    return menus.find(m => m.day_of_week === day && m.meal_type === mealType)
  }

  async function handleSubStatus(subId: string, status: string) {
    setUpdatingSubId(subId)
    await updateSubscriptionStatus(subId, status)
    setUpdatingSubId(null)
  }

  const tabs = [
    { key: 'menus',  label: 'Menus de la semaine' },
    { key: 'subs',   label: 'Abonnements' },
  ]

  return (
    <>
      {/* Navigation onglets */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <a
              key={tab.key}
              href={`?tab=${tab.key}&week=${weekStart}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition
                ${activeTab === tab.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
            >
              {tab.label}
            </a>
          ))}
        </div>

        {activeTab === 'subs' && (
          <button
            onClick={() => setSubModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white
                       text-sm font-medium hover:bg-blue-700 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Abonner un élève
          </button>
        )}
      </div>

      {/* Onglet Menus */}
      {activeTab === 'menus' && (
        <div className="space-y-4">
          {/* Navigation semaine */}
          <div className="flex items-center gap-3">
            <a
              href={`?tab=menus&week=${prevWeek.toISOString().split('T')[0]}`}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-500"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <p className="text-sm font-semibold text-gray-700">
              Semaine du {new Date(weekStart).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
            <a
              href={`?tab=menus&week=${nextWeek.toISOString().split('T')[0]}`}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-500"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {/* Grille des jours */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(DAYS).map(([dayNum, dayName]) => {
              const day = parseInt(dayNum, 10)
              const lunch = getMenu(day, 'LUNCH')
              const snack = getMenu(day, 'SNACK')
              return (
                <div key={day} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-800 text-white px-4 py-2.5 flex items-center justify-between">
                    <p className="text-sm font-bold">{dayName}</p>
                  </div>
                  <div className="p-3 space-y-2">
                    {/* Déjeuner */}
                    <div className="bg-orange-50 rounded-lg p-2.5 border border-orange-100">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-orange-700">Déjeuner</p>
                        <button
                          onClick={() => setMenuModal({ open: true, day, mealType: 'LUNCH', existing: lunch ?? null })}
                          className="text-xs text-orange-600 hover:text-orange-800 font-medium underline"
                        >
                          {lunch ? 'Modifier' : 'Ajouter'}
                        </button>
                      </div>
                      {lunch ? (
                        <>
                          <p className="text-xs text-gray-700">{lunch.description}</p>
                          {lunch.price && lunch.price > 0 && (
                            <p className="text-xs text-gray-400 mt-1 font-mono">{Number(lunch.price).toLocaleString('fr-FR')} FCFA</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Menu non défini</p>
                      )}
                    </div>

                    {/* Goûter */}
                    <div className="bg-teal-50 rounded-lg p-2.5 border border-teal-100">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-teal-700">Goûter</p>
                        <button
                          onClick={() => setMenuModal({ open: true, day, mealType: 'SNACK', existing: snack ?? null })}
                          className="text-xs text-teal-600 hover:text-teal-800 font-medium underline"
                        >
                          {snack ? 'Modifier' : 'Ajouter'}
                        </button>
                      </div>
                      {snack ? (
                        <>
                          <p className="text-xs text-gray-700">{snack.description}</p>
                          {snack.price && snack.price > 0 && (
                            <p className="text-xs text-gray-400 mt-1 font-mono">{Number(snack.price).toLocaleString('fr-FR')} FCFA</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Menu non défini</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Onglet Abonnements */}
      {activeTab === 'subs' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {subscriptions.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <p className="text-gray-500 font-medium">Aucun abonnement</p>
              <p className="text-sm text-gray-400 mt-1">Commencez par abonner un élève à la cantine.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Élève', 'Classe', 'Type repas', 'Début', 'Statut', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((sub) => {
                  const statusCfg = STATUS_CFG[sub.status] ?? { label: sub.status, cls: 'bg-gray-100 text-gray-600 border-gray-200' }
                  return (
                    <tr key={sub.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {sub.last_name?.toUpperCase()} {sub.first_name}
                        </p>
                        {sub.amount !== null && sub.amount > 0 && (
                          <p className="text-xs text-gray-400 font-mono">{Number(sub.amount).toLocaleString('fr-FR')} FCFA/mois</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{sub.class_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {MEAL_LABELS[sub.meal_type] ?? sub.meal_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(sub.start_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.cls}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {sub.status === 'ACTIVE' ? (
                            <button
                              onClick={() => handleSubStatus(sub.id, 'SUSPENDED')}
                              disabled={updatingSubId === sub.id}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-orange-600
                                         border border-orange-200 hover:bg-orange-50 disabled:opacity-50 transition"
                            >
                              {updatingSubId === sub.id ? '…' : 'Suspendre'}
                            </button>
                          ) : sub.status === 'SUSPENDED' ? (
                            <button
                              onClick={() => handleSubStatus(sub.id, 'ACTIVE')}
                              disabled={updatingSubId === sub.id}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-600
                                         border border-green-200 hover:bg-green-50 disabled:opacity-50 transition"
                            >
                              {updatingSubId === sub.id ? '…' : 'Réactiver'}
                            </button>
                          ) : null}
                          <button
                            onClick={() => handleSubStatus(sub.id, 'CANCELLED')}
                            disabled={updatingSubId === sub.id || sub.status === 'CANCELLED'}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600
                                       border border-red-200 hover:bg-red-50 disabled:opacity-40 transition"
                          >
                            Annuler
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modaux */}
      <MenuModal
        open={menuModal.open}
        onClose={() => setMenuModal(prev => ({ ...prev, open: false }))}
        weekStart={weekStart}
        dayOfWeek={menuModal.day}
        mealType={menuModal.mealType}
        existingMenu={menuModal.existing}
      />
      <SubscribeModal open={subModalOpen} onClose={() => setSubModalOpen(false)} />
    </>
  )
}
