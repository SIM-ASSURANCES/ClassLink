'use client'

import { useActionState, useRef, useState } from 'react'
import Link from 'next/link'
import { saveSchoolSettings, savePaymentConfig, saveServicePrices } from '@/actions/settings'
import type { ActionResult } from '@/types'

interface Props {
  settings: any
  subscription: any
  schoolSlug?: string | null
}

const FONT_OPTIONS = [
  { value: '',           label: 'Par défaut (Inter)' },
  { value: 'Poppins',    label: 'Poppins' },
  { value: 'Roboto',     label: 'Roboto' },
  { value: 'Open Sans',  label: 'Open Sans' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Inter',      label: 'Inter' },
]

export function SettingsForm({ settings, subscription, schoolSlug }: Props) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    saveSchoolSettings,
    null
  )
  const [payState, payAction, payPending] = useActionState<ActionResult | null, FormData>(
    savePaymentConfig,
    null
  )
  const [pricesState, pricesAction, pricesPending] = useActionState<ActionResult | null, FormData>(
    saveServicePrices,
    null
  )
  const [copied, setCopied] = useState(false)

  // ── Identité visuelle (aperçu en direct) ──────────────────────────────────
  const [logoUrl, setLogoUrl]       = useState<string>(settings.logo_url ?? '')
  const [slogan, setSlogan]         = useState<string>(settings.slogan ?? '')
  const [primary, setPrimary]       = useState<string>(settings.primary_color ?? '#1800ad')
  const [secondary, setSecondary]   = useState<string>(settings.secondary_color ?? '#ffe965')
  const [font, setFont]             = useState<string>(settings.font_family ?? '')
  const [logoError, setLogoError]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Moyen de paiement ─────────────────────────────────────────────────────
  const [provider, setProvider] = useState<string>(settings.payment_provider ?? '')

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLogoError(null)
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 300_000) {
      setLogoError('Image trop volumineuse (max 300 Ko).')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => setLogoUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  function copySlug() {
    if (!schoolSlug) return
    navigator.clipboard.writeText(schoolSlug).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const planLabel: Record<string, string> = {
    starter:      'Starter',
    basic:        'Basic',
    professional: 'Professionnel',
    enterprise:   'Entreprise',
  }

  return (
    <div className="space-y-6">
      {/* Feedback global */}
      {state && !state.success && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Paramètres enregistrés avec succès.
        </div>
      )}

      <form action={action} className="space-y-6">
        {/* ── Informations générales ─────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">Informations générales</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom de l&apos;établissement <span className="text-red-500">*</span>
              </label>
              <input
                name="school_name"
                defaultValue={settings.school_name ?? ''}
                placeholder="Lycée Moderne de Bouaké"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
              <input
                name="address"
                defaultValue={settings.address ?? ''}
                placeholder="Rue des Écoles, Cocody, Abidjan"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                <input
                  name="phone"
                  defaultValue={settings.phone ?? ''}
                  placeholder="+225 27 00 00 00 00"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  name="email"
                  type="email"
                  defaultValue={settings.email ?? ''}
                  placeholder="contact@lycee.ci"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
              <input
                name="city"
                defaultValue={settings.city ?? ''}
                placeholder="Abidjan"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* ── Identité visuelle ─────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Identité visuelle</h3>
          <p className="text-xs text-gray-400 mb-5">
            Personnalisez l&apos;apparence de tous les espaces de votre établissement (admin, parents, élèves, enseignants).
          </p>

          {/* Aperçu en direct */}
          <div
            className="mb-5 rounded-xl border border-gray-200 overflow-hidden"
            style={{ fontFamily: font ? `'${font}', system-ui, sans-serif` : undefined }}
          >
            <div className="flex items-center gap-3 px-4 py-3" style={{ background: primary }}>
              {logoUrl
                ? <img src={logoUrl} alt="Logo" className="w-9 h-9 rounded-lg object-cover bg-white" />
                : <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-white text-xs font-bold">
                    {(settings.school_name ?? 'EC').slice(0, 2).toUpperCase()}
                  </div>
              }
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{settings.school_name ?? 'Votre établissement'}</p>
                {slogan && <p className="text-[11px] text-white/80 truncate">{slogan}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 bg-white">
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: primary }}>
                Bouton principal
              </span>
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: secondary }}>
                Accent
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Logo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo de l&apos;établissement</label>
              <div className="flex items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={onLogoChange}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4
                             file:rounded-lg file:border-0 file:text-sm file:font-medium
                             file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {logoUrl && (
                  <button type="button" onClick={() => { setLogoUrl(''); if (fileRef.current) fileRef.current.value = '' }}
                    className="text-xs text-red-600 hover:underline flex-shrink-0">Retirer</button>
                )}
              </div>
              {logoError && <p className="mt-1 text-xs text-red-600">{logoError}</p>}
              <p className="mt-1 text-xs text-gray-400">PNG, JPG, WebP ou SVG — 300 Ko maximum.</p>
              <input type="hidden" name="logo_url" value={logoUrl} />
            </div>

            {/* Slogan */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slogan</label>
              <input
                name="slogan"
                value={slogan}
                onChange={e => setSlogan(e.target.value)}
                placeholder="L'excellence au quotidien"
                maxLength={80}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Police */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Police d&apos;écriture</label>
              <select
                name="font_family"
                value={font}
                onChange={e => setFont(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 bg-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>

            {/* Couleurs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Couleur principale</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={primary} onChange={e => setPrimary(e.target.value)}
                    className="h-10 w-12 rounded border border-gray-300 cursor-pointer" />
                  <input
                    name="primary_color"
                    value={primary}
                    onChange={e => setPrimary(e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm font-mono rounded-lg border border-gray-300
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Couleur secondaire</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={secondary} onChange={e => setSecondary(e.target.value)}
                    className="h-10 w-12 rounded border border-gray-300 cursor-pointer" />
                  <input
                    name="secondary_color"
                    value={secondary}
                    onChange={e => setSecondary(e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm font-mono rounded-lg border border-gray-300
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Direction ─────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">Direction</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom du directeur / principal
              </label>
              <input
                name="principal_name"
                defaultValue={settings.principal_name ?? ''}
                placeholder="M. Konan Beugré"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Ce nom apparaît sur les bulletins et leur export PDF.
              </p>
            </div>
          </div>
        </section>

        {/* ── Notifications ─────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">Notifications</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="sms_enabled"
                defaultChecked={settings.sms_enabled ?? false}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Activer les notifications SMS</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="email_enabled"
                defaultChecked={settings.email_enabled ?? true}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Activer les notifications email</span>
            </label>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Clé API SMS (Africa&apos;s Talking)
              </label>
              <input
                name="sms_api_key"
                type="password"
                defaultValue={settings.sms_api_key ?? ''}
                placeholder="••••••••••••••••"
                autoComplete="off"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Laissez vide pour conserver la clé existante.
              </p>
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 px-4 bg-primary hover:opacity-90 disabled:opacity-60
                     text-white text-sm font-semibold rounded-xl transition"
        >
          {pending ? 'Enregistrement…' : 'Enregistrer les paramètres'}
        </button>
      </form>

      {/* ── Moyen de paiement de l'établissement ────────────────────── */}
      {payState && !payState.success && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {payState.error}
        </div>
      )}
      {payState?.success && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Configuration de paiement enregistrée.
        </div>
      )}

      <form action={payAction}>
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Moyen de paiement</h3>
            <p className="text-xs text-gray-400">
              Encaissez les frais de scolarité directement sur le compte de votre établissement.
              Tant qu'aucun fournisseur n'est activé, le paiement en ligne reste indisponible pour les parents.
            </p>
          </div>

          {/* Fournisseur */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur de paiement</label>
            <select
              name="payment_provider"
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Aucun (paiement en ligne désactivé)</option>
              <option value="GENIUSPAY">GeniusPay</option>
              <option value="CINETPAY">CinetPay</option>
            </select>
          </div>

          {!provider && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs text-amber-800">
                Aucun fournisseur activé : les parents verront un bouton de paiement grisé et devront régler
                les frais de scolarité par un autre moyen (espèces, virement...).
              </p>
            </div>
          )}

          {provider && (
            <>
              {/* Activation */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="payment_enabled"
                  defaultChecked={settings.payment_enabled ?? false}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Activer la collecte sur ce compte</span>
              </label>

              {/* Clé API */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clé API</label>
                <input
                  name="payment_api_key"
                  type="password"
                  autoComplete="off"
                  placeholder={settings.payment_api_key_preview ?? 'Clé API du marchand'}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* GeniusPay : clé secrète */}
              {provider === 'GENIUSPAY' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Clé secrète API</label>
                  <input
                    name="payment_api_secret"
                    type="password"
                    autoComplete="off"
                    placeholder={settings.payment_api_secret_preview ?? 'Clé secrète (sk_…)'}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* CinetPay : site_id */}
              {provider === 'CINETPAY' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Identifiant du site (Site ID)</label>
                  <input
                    name="payment_site_id"
                    type="password"
                    autoComplete="off"
                    placeholder={settings.payment_site_id_preview ?? 'Votre Site ID CinetPay'}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Secret webhook */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {provider === 'CINETPAY' ? 'Clé secrète (vérification webhook)' : 'Secret webhook'}
                </label>
                <input
                  name="payment_webhook_secret"
                  type="password"
                  autoComplete="off"
                  placeholder={settings.payment_webhook_secret_preview ?? 'Secret de vérification des notifications'}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <p className="text-xs text-gray-400">
                Laissez un champ vide pour conserver la valeur déjà enregistrée. Les clés sont chiffrées avant stockage.
              </p>

              {/* Encart webhook */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-amber-800 mb-1">URL de notification (webhook)</p>
                <p className="text-xs text-amber-700 mb-2">
                  {provider === 'GENIUSPAY'
                    ? 'Dans votre tableau de bord GeniusPay, configurez l\'URL de webhook suivante :'
                    : 'CinetPay utilise automatiquement cette URL de notification :'}
                </p>
                <code className="block text-xs font-mono bg-white border border-amber-200 rounded px-2 py-1.5 text-amber-900 break-all">
                  {(process.env.NEXT_PUBLIC_APP_URL ?? '')}/api/webhooks/{provider === 'CINETPAY' ? 'cinetpay' : 'geniuspay'}
                </code>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={payPending}
            className="w-full py-3 px-4 bg-primary hover:opacity-90 disabled:opacity-60
                       text-white text-sm font-semibold rounded-xl transition"
          >
            {payPending ? 'Enregistrement…' : 'Enregistrer le moyen de paiement'}
          </button>
        </section>
      </form>

      {/* ── Tarifs des services payants (transport, cantine) ────────── */}
      <form action={pricesAction}>
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Tarifs des services payants</h3>
            <p className="text-xs text-gray-400">
              Une fois un tarif renseigné, les parents peuvent s&apos;abonner et payer directement en ligne
              (via le moyen de paiement ci-dessus) sans passer par l&apos;administration.
            </p>
          </div>

          {pricesState && !pricesState.success && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {pricesState.error}
            </p>
          )}
          {pricesState?.success && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              Tarifs enregistrés.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Transport scolaire — prix mensuel (FCFA)
            </label>
            <input
              name="transport_monthly_price"
              type="number" min={0} step={100}
              defaultValue={settings.transport_monthly_price ?? ''}
              placeholder="Laisser vide pour désactiver le paiement en ligne"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cantine — Déjeuner (FCFA/mois)</label>
              <input
                name="cafeteria_price_lunch"
                type="number" min={0} step={100}
                defaultValue={settings.cafeteria_price_lunch ?? ''}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cantine — Goûter (FCFA/mois)</label>
              <input
                name="cafeteria_price_snack"
                type="number" min={0} step={100}
                defaultValue={settings.cafeteria_price_snack ?? ''}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cantine — Déjeuner + Goûter (FCFA/mois)</label>
              <input
                name="cafeteria_price_lunch_snack"
                type="number" min={0} step={100}
                defaultValue={settings.cafeteria_price_lunch_snack ?? ''}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={pricesPending}
            className="w-full py-3 px-4 bg-primary hover:opacity-90 disabled:opacity-60
                       text-white text-sm font-semibold rounded-xl transition"
          >
            {pricesPending ? 'Enregistrement…' : 'Enregistrer les tarifs'}
          </button>
        </section>
      </form>

      {/* ── Personnel & accès ───────────────────────────────────────── */}
      <Link
        href="/admin/settings/staff"
        className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-6 hover:border-primary/40 transition group"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Personnel &amp; accès</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Créez des comptes pour le personnel (proviseur, censeur, surveillant, intendant…) et choisissez leurs fonctionnalités selon le poste.
          </p>
        </div>
        <svg className="w-5 h-5 text-gray-400 group-hover:text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* ── Connexion à l'app mobile ────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-blue-200 p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Connexion à l&apos;app mobile MyClassLink</h3>
            <p className="text-xs text-gray-500 mt-0.5">Informations à communiquer aux élèves et parents</p>
          </div>
        </div>

        {/* Code établissement */}
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs font-medium text-blue-700 mb-2">Code établissement</p>
          <div className="flex items-center gap-3">
            <span className="flex-1 font-mono text-lg font-bold text-blue-900 tracking-wider">
              {schoolSlug ?? '—'}
            </span>
            {schoolSlug && (
              <button
                type="button"
                onClick={copySlug}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition
                           bg-blue-600 hover:bg-blue-700 text-white"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copié
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copier
                  </>
                )}
              </button>
            )}
          </div>
          <p className="text-xs text-blue-600 mt-2">
            Ce code identifie votre établissement dans l&apos;application mobile.
          </p>
        </div>

        {/* Instructions */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-3">Guide de connexion pour élèves et parents</p>
          <ol className="space-y-3">
            {[
              {
                num: '1',
                title: "Télécharger l'app MyClassLink",
                desc: "Chaque élève ou parent télécharge l'application MyClassLink sur son smartphone Android.",
              },
              {
                num: '2',
                title: 'Entrer le code établissement',
                desc: `Sur l'écran de connexion, saisir le code : ${schoolSlug ? `"${schoolSlug}"` : 'votre code établissement'}.`,
              },
              {
                num: '3',
                title: 'Se connecter avec ses identifiants',
                desc: "Utiliser l'adresse email et le mot de passe fournis par l'administration. Le mot de passe peut être réinitialisé depuis cette interface.",
              },
            ].map(step => (
              <li key={step.num} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold
                                 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {step.num}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{step.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Fonctionnalités */}
        <div className="border-t border-blue-100 pt-4">
          <p className="text-xs font-semibold text-gray-700 mb-2">Fonctionnalités disponibles dans l&apos;app</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: '📋', label: 'Bulletins & notes' },
              { icon: '📅', label: 'Absences & présences' },
              { icon: '💳', label: 'Paiements & frais' },
              { icon: '🔔', label: 'Notifications push' },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-2 text-xs text-gray-600">
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Carte abonnement ────────────────────────────────────────── */}
      {subscription && (
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Informations du compte</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <div>
              <dt className="text-gray-500">Plan actuel</dt>
              <dd className="font-medium text-gray-900 mt-0.5">
                {planLabel[subscription.plan_slug] ?? subscription.plan_name ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Statut</dt>
              <dd className="mt-0.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  subscription.status === 'ACTIVE'
                    ? 'bg-green-100 text-green-700'
                    : subscription.status === 'TRIAL'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {subscription.status === 'ACTIVE'  ? 'Actif'
                   : subscription.status === 'TRIAL' ? 'Période d\'essai'
                   : subscription.status}
                </span>
              </dd>
            </div>
            {subscription.max_students != null && (
              <div>
                <dt className="text-gray-500">Limite élèves</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{subscription.max_students}</dd>
              </div>
            )}
            {subscription.max_teachers != null && (
              <div>
                <dt className="text-gray-500">Limite enseignants</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{subscription.max_teachers}</dd>
              </div>
            )}
            {subscription.current_period_end && (
              <div>
                <dt className="text-gray-500">Renouvellement</dt>
                <dd className="font-medium text-gray-900 mt-0.5">
                  {new Date(subscription.current_period_end).toLocaleDateString('fr-FR', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </div>
  )
}
