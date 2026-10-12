'use client'

import { useActionState, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { saveEnrollmentSettings, type EnrollmentSettingsView } from '@/actions/enrollment-settings'
import { DOCUMENT_DEFS, FIELD_DEFS, type FieldMode } from '@/lib/enrollment/config'
import type { ActionResult } from '@/types'

const MODE_LABELS: Record<FieldMode, string> = { required: 'Obligatoire', optional: 'Facultatif', hidden: 'Masqué' }
const INPUT = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

/** ISO → valeur d'un <input type="datetime-local"> (heure UTC, fuseau du serveur). */
const toLocalInput = (iso: string | null) => (iso ? iso.slice(0, 16) : '')

function ModeSelect({ name, value }: { name: string; value: FieldMode }) {
  return (
    <select name={name} defaultValue={value}
      className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
      {(Object.keys(MODE_LABELS) as FieldMode[]).map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
    </select>
  )
}

export function PublicPageSettings({ view }: { view: EnrollmentSettingsView }) {
  const { settings, levels, publicUrl } = view
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveEnrollmentSettings, null)
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    if (!publicUrl) return
    QRCode.toDataURL(publicUrl, { margin: 1, width: 180 }).then(setQr).catch(() => setQr(null))
  }, [publicUrl])

  const copy = async () => {
    if (!publicUrl) return
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* presse-papiers indisponible */ }
  }

  return (
    <div className="space-y-6">
      {/* Lien public */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col sm:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Lien de la page d&apos;inscription</h3>
          <p className="text-xs text-gray-500">
            Partagez ce lien (site de l&apos;école, WhatsApp, affiche avec le QR code) : les parents s&apos;inscrivent eux-mêmes.
          </p>
          {publicUrl ? (
            <div className="flex gap-2">
              <input readOnly value={publicUrl} className={`${INPUT} font-mono text-xs`} onFocus={e => e.currentTarget.select()} />
              <button type="button" onClick={copy}
                className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 whitespace-nowrap">
                {copied ? 'Copié ✓' : 'Copier'}
              </button>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-50 whitespace-nowrap">
                Ouvrir
              </a>
            </div>
          ) : (
            <p className="text-xs text-red-600">Code établissement introuvable.</p>
          )}
          {!settings.isOpen && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              La page est actuellement <strong>fermée</strong> : les visiteurs voient un message « inscriptions closes ».
              Cochez « Inscriptions ouvertes » ci-dessous puis enregistrez.
            </p>
          )}
        </div>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR code du lien d'inscription" className="w-[140px] h-[140px] rounded-lg border border-gray-200" />
        )}
      </section>

      <form action={action} className="space-y-6">
        {state && !state.success && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{state.error}</p>
        )}
        {state?.success && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">Configuration enregistrée.</p>
        )}

        {/* Ouverture */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Ouverture des inscriptions</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" name="is_open" defaultChecked={settings.isOpen} className="w-4 h-4 rounded border-gray-300" />
            <span className="text-sm text-gray-700">Inscriptions ouvertes</span>
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ouverture (facultatif, heure UTC)</label>
              <input type="datetime-local" name="opens_at" defaultValue={toLocalInput(settings.opensAt)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fermeture (facultatif, heure UTC)</label>
              <input type="datetime-local" name="closes_at" defaultValue={toLocalInput(settings.closesAt)} className={INPUT} />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" name="notify_admins" defaultChecked={settings.notifyAdmins} className="w-4 h-4 rounded border-gray-300" />
            <span className="text-sm text-gray-700">Prévenir l&apos;administration à chaque nouvelle candidature</span>
          </label>
        </section>

        {/* Textes */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Textes de la page</h3>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Titre d&apos;accueil</label>
            <input name="welcome_title" maxLength={120} defaultValue={settings.welcomeTitle ?? ''} className={INPUT}
              placeholder="Demande d'inscription en ligne" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Message d&apos;accueil</label>
            <textarea name="welcome_message" rows={2} maxLength={1000} defaultValue={settings.welcomeMessage ?? ''}
              className={`${INPUT} resize-none`} placeholder="Rentrée 2026-2027 : les dossiers sont étudiés sous 72 h." />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Conditions d&apos;admission</label>
            <textarea name="conditions_text" rows={4} maxLength={4000} defaultValue={settings.conditionsText ?? ''}
              className={`${INPUT} resize-none`} placeholder="Pièces à fournir, frais d'inscription, règlement…" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" name="require_conditions" defaultChecked={settings.requireConditions} className="w-4 h-4 rounded border-gray-300" />
            <span className="text-sm text-gray-700">Exiger l&apos;acceptation des conditions avant l&apos;envoi</span>
          </label>
        </section>

        {/* Niveaux */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Niveaux proposés</h3>
          <p className="text-xs text-gray-500">Seuls les niveaux cochés apparaissent dans la liste déroulante du formulaire.</p>
          {levels.length === 0 ? (
            <p className="text-xs text-gray-400">Aucun niveau défini : créez-en d&apos;abord dans « Classes ».</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {levels.map(l => (
                <label key={l.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm cursor-pointer">
                  <input type="checkbox" name="level" value={l.id} defaultChecked={settings.offeredLevelIds.includes(l.id)} />
                  {l.name}
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Champs */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Informations demandées</h3>
          <p className="text-xs text-gray-500">
            Prénom et nom de l&apos;élève et nom du parent sont toujours demandés. Le parent doit laisser au moins un téléphone ou un email.
          </p>
          <div className="divide-y divide-gray-100">
            {FIELD_DEFS.map(f => (
              <div key={f.key} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-700">
                  {f.label} <span className="text-xs text-gray-400">({f.group === 'student' ? 'élève' : 'parent'})</span>
                </span>
                <ModeSelect name={`field_${f.key}`} value={settings.fields[f.key]} />
              </div>
            ))}
          </div>
        </section>

        {/* Documents */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Pièces jointes</h3>
          <p className="text-xs text-gray-500">PDF, JPEG, PNG ou WebP, 3 Mo maximum par fichier. Visibles uniquement par l&apos;administration.</p>
          <div className="divide-y divide-gray-100">
            {DOCUMENT_DEFS.map(d => (
              <div key={d.key} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-700">{d.label}</span>
                <ModeSelect name={`doc_${d.key}`} value={settings.documents[d.key]} />
              </div>
            ))}
          </div>
        </section>

        <button type="submit" disabled={pending}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition">
          {pending ? 'Enregistrement…' : 'Enregistrer la configuration'}
        </button>
      </form>
    </div>
  )
}
