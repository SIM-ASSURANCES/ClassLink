'use client'

import { useActionState } from 'react'
import { submitEnrollmentApplication } from '@/actions/enrollment'
import { DOCUMENT_DEFS, type FieldMode } from '@/lib/enrollment/config'
import type { ActionResult } from '@/types'

interface Props {
  slug:              string
  fields:            Record<string, FieldMode>
  documents:         Record<string, FieldMode>
  levels:            { id: string; name: string }[]
  requireConditions: boolean
  conditionsText:    string | null
}

const INPUT = 'w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export function EnrollForm({ slug, fields, documents, levels, requireConditions, conditionsText }: Props) {
  const boundAction = submitEnrollmentApplication.bind(null, slug)
  const [state, formAction, pending] = useActionState<
    ActionResult<{ applicationId: string }> | null,
    FormData
  >(boundAction, null)

  // Un champ masqué n'est pas rendu ; un champ obligatoire reçoit `required` + un astérisque.
  const show = (key: string) => fields[key] !== 'hidden'
  const req  = (key: string) => fields[key] === 'required'
  const star = (key: string) => (req(key) ? ' *' : '')

  if (state?.success) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Candidature envoyée !</h3>
        <p className="text-gray-500 text-sm">
          Votre demande d&apos;inscription a bien été reçue. L&apos;établissement vous contactera
          prochainement pour vous communiquer la décision.
        </p>
        <p className="text-xs text-gray-400 mt-3">
          Référence : <span className="font-mono font-medium">{state.data?.applicationId?.slice(0, 8).toUpperCase()}</span>
        </p>
      </div>
    )
  }

  const visibleDocs = DOCUMENT_DEFS.filter(d => documents[d.key] !== 'hidden')

  return (
    <form action={formAction} className="p-6 space-y-5">
      {state && !state.success && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700" role="alert">
          {state.error}
        </div>
      )}

      {/* Piège à robots : invisible pour un humain, rempli par les scripts. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Ne pas remplir <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {/* Élève */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">Informations de l&apos;élève</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Prénom *</label>
            <input name="firstName" required maxLength={80} className={INPUT} placeholder="ex: Kouamé" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nom *</label>
            <input name="lastName" required maxLength={80} className={INPUT} placeholder="ex: YAPI" />
          </div>
          {show('dateOfBirth') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date de naissance{star('dateOfBirth')}</label>
              <input name="dateOfBirth" type="date" required={req('dateOfBirth')} className={INPUT} />
            </div>
          )}
          {show('gender') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sexe{star('gender')}</label>
              <select name="gender" required={req('gender')} className={`${INPUT} bg-white`}>
                <option value="">Choisir…</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
          )}
          {show('level') && levels.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Niveau souhaité{star('level')}</label>
              <select name="level" required={req('level')} className={`${INPUT} bg-white`}>
                <option value="">Choisir…</option>
                {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          {show('previousAverage') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Moyenne précédente /20{star('previousAverage')}</label>
              <input name="previousAverage" type="number" min="0" max="20" step="0.01"
                required={req('previousAverage')} className={INPUT} placeholder="ex: 13.50" />
            </div>
          )}
          {show('previousSchool') && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">École précédente{star('previousSchool')}</label>
              <input name="previousSchool" maxLength={120} required={req('previousSchool')} className={INPUT}
                placeholder="Nom de l'école précédente" />
            </div>
          )}
        </div>
      </div>

      {/* Parent */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">Informations du parent / tuteur</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">Nom complet du parent *</label>
            <input name="parentName" required maxLength={120} className={INPUT} placeholder="ex: YAPI Emmanuel" />
          </div>
          {show('parentRelation') && (
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Lien de parenté{star('parentRelation')}</label>
              <select name="parentRelation" required={req('parentRelation')} className={`${INPUT} bg-white`}>
                <option value="PARENT">Père / Mère</option>
                <option value="TUTEUR">Tuteur légal</option>
                <option value="GRAND_PARENT">Grand-parent</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>
          )}
          {show('parentPhone') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone{star('parentPhone')}</label>
              <input name="parentPhone" type="tel" maxLength={20} required={req('parentPhone')} className={INPUT}
                placeholder="+225 07 XX XX XX XX" />
            </div>
          )}
          {show('parentEmail') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email{star('parentEmail')}</label>
              <input name="parentEmail" type="email" maxLength={254} required={req('parentEmail')} className={INPUT}
                placeholder="email@exemple.com" />
            </div>
          )}
          {show('address') && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Adresse{star('address')}</label>
              <input name="address" maxLength={300} required={req('address')} className={INPUT} placeholder="Quartier, commune…" />
            </div>
          )}
        </div>
      </div>

      {/* Pièces jointes */}
      {visibleDocs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">Documents</h3>
          <div className="space-y-3">
            {visibleDocs.map(d => (
              <div key={d.key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {d.label}{documents[d.key] === 'required' ? ' *' : ''}
                </label>
                <input name={`doc_${d.key}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
                  required={documents[d.key] === 'required'}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700" />
              </div>
            ))}
            <p className="text-xs text-gray-400">PDF, JPEG, PNG ou WebP — 3 Mo maximum par fichier.</p>
          </div>
        </div>
      )}

      {show('notes') && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Message / informations complémentaires{star('notes')}</label>
          <textarea name="notes" rows={3} maxLength={1000} required={req('notes')}
            className={`${INPUT} resize-none`} placeholder="Toute information utile pour l'établissement…" />
        </div>
      )}

      {requireConditions && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          {conditionsText && (
            <p className="text-xs text-gray-600 whitespace-pre-line max-h-40 overflow-y-auto">{conditionsText}</p>
          )}
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" name="acceptConditions" required className="mt-0.5" />
            <span>J&apos;ai lu et j&apos;accepte les conditions d&apos;admission *</span>
          </label>
        </div>
      )}

      <button type="submit" disabled={pending}
        className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition">
        {pending ? 'Envoi en cours…' : 'Soumettre ma candidature'}
      </button>
    </form>
  )
}
