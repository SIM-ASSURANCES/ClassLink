'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createApiKey, revokeApiKey } from '@/actions/enrollment-api-keys'

interface ApiKeyRow {
  id: string
  name: string
  key_prefix: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
  revoked_at: string | null
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export function ApiKeysPanel({ keys, slug }: { keys: ApiKeyRow[]; slug: string | null }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://votre-domaine'
  const exampleKey = slug ? `mcl_${slug}.VOTRE_CLE_SECRETE` : 'mcl_ecole.VOTRE_CLE_SECRETE'

  const create = () => {
    setError(null)
    startTransition(async () => {
      const res = await createApiKey(name)
      if (!res.success) { setError(res.error); return }
      if (!res.data) return
      setNewKey(res.data.fullKey)
      setName('')
      router.refresh()
    })
  }

  const revoke = (k: ApiKeyRow) => {
    if (!confirm(`Révoquer la clé « ${k.name} » ? Les applications qui l'utilisent cesseront de fonctionner immédiatement.`)) return
    startTransition(async () => {
      const res = await revokeApiKey(k.id)
      if (!res.success) setError(res.error ?? 'Erreur')
      router.refresh()
    })
  }

  const copy = async () => {
    if (!newKey) return
    try { await navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* indisponible */ }
  }

  return (
    <div className="space-y-6">
      {/* Nouvelle clé : affichée une seule fois */}
      {newKey && (
        <section className="bg-green-50 border border-green-300 rounded-xl p-5 space-y-3">
          <p className="text-sm font-semibold text-green-900">Clé créée — copiez-la maintenant</p>
          <p className="text-xs text-green-800">
            Elle ne sera <strong>plus jamais affichée</strong> : seule une empreinte est conservée. Si vous la perdez, révoquez-la et créez-en une nouvelle.
          </p>
          <div className="flex gap-2">
            <input readOnly value={newKey} onFocus={e => e.currentTarget.select()}
              className="flex-1 px-3 py-2 rounded-lg border border-green-300 bg-white font-mono text-xs" />
            <button type="button" onClick={copy}
              className="px-4 py-2 rounded-lg bg-green-700 text-white text-xs font-semibold hover:bg-green-800">
              {copied ? 'Copié ✓' : 'Copier'}
            </button>
          </div>
          <button type="button" onClick={() => setNewKey(null)} className="text-xs text-green-800 underline">
            J&apos;ai copié la clé, masquer
          </button>
        </section>
      )}

      {/* Création */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Clés d&apos;API</h3>
        <p className="text-xs text-gray-500">
          Une clé permet à une autre application d&apos;inscrire directement des élèves dans votre établissement. Créez une clé par application
          (5 maximum) pour pouvoir en révoquer une sans toucher aux autres.
        </p>
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60}
            placeholder="Nom de l'application (ex. Logiciel de scolarité)"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="button" onClick={create} disabled={pending || name.trim().length < 2}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            Créer une clé
          </button>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        {keys.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Aucune clé pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Nom', 'Clé', 'Créée le', 'Dernière utilisation', 'Statut', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {keys.map(k => (
                  <tr key={k.id}>
                    <td className="px-3 py-2 font-medium text-gray-900">{k.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{k.key_prefix}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{fmt(k.created_at)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{fmt(k.last_used_at)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        k.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {k.is_active ? 'Active' : 'Révoquée'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {k.is_active && (
                        <button type="button" onClick={() => revoke(k)} disabled={pending}
                          className="text-xs text-red-600 hover:underline">Révoquer</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Documentation */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Documentation</h3>
        <p className="text-xs text-gray-500">
          Toutes les requêtes portent l&apos;en-tête <code className="bg-gray-100 px-1 rounded">Authorization: Bearer &lt;clé&gt;</code>.
          Limite : 120 requêtes par minute et par clé.
        </p>

        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1">1. Lister les classes (pour obtenir les <code>classId</code>)</p>
          <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-x-auto">{`curl ${baseUrl}/api/v1/classes \\
  -H "Authorization: Bearer ${exampleKey}"`}</pre>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1">2. Inscrire un élève</p>
          <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-x-auto">{`curl -X POST ${baseUrl}/api/v1/students \\
  -H "Authorization: Bearer ${exampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "externalId": "ERP-10542",
    "student": { "firstName": "Kouamé", "lastName": "YAPI",
                 "dateOfBirth": "2013-04-21", "gender": "M" },
    "parent":  { "firstName": "Emmanuel", "lastName": "YAPI",
                 "email": "parent@exemple.com", "phone": "+2250700000000" },
    "className": "6ème A"
  }'`}</pre>
          <ul className="text-xs text-gray-600 list-disc pl-5 mt-2 space-y-1">
            <li><strong>201</strong> : élève créé · <strong>200</strong> : <code>externalId</code> déjà reçu (aucun doublon créé).</li>
            <li>Le parent reçoit un email pour définir son mot de passe (aucun mot de passe en clair n&apos;est échangé). Un parent déjà connu (même email) est réutilisé : idéal pour les fratries.</li>
            <li>Classe facultative : sans <code>classId</code>/<code>className</code>, l&apos;élève est créé « à placer ».</li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1">3. Inscrire jusqu&apos;à 100 élèves d&apos;un coup</p>
          <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-x-auto">{`POST ${baseUrl}/api/v1/students/batch
{ "students": [ { …comme ci-dessus… }, { … } ] }
→ 200 { "summary": { "total", "created", "existing", "errors" }, "results": [ … ] }`}</pre>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1">Codes d&apos;erreur</p>
          <p className="text-xs text-gray-600">
            <code>401</code> clé invalide · <code>403 PLAN_LIMIT_REACHED</code> limite d&apos;élèves du plan atteinte ·{' '}
            <code>409 CLASS_FULL</code> classe pleine · <code>409 DUPLICATE</code> email déjà utilisé par un autre compte ·{' '}
            <code>422</code> données invalides · <code>429</code> trop de requêtes.
          </p>
        </div>
      </section>
    </div>
  )
}
