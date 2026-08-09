'use client'

import { useRef, useState, useTransition } from 'react'
import { createDriver, updateDriver, uploadDriverPhoto } from '@/actions/transport'

interface Driver {
  id: string; first_name: string; last_name: string; email: string
  phone: string | null; avatar_url: string | null; is_active: boolean
  route_id: string | null; route_name: string | null
}

export function DriversTab({ drivers, setDrivers }: { drivers: Driver[]; setDrivers: (d: Driver[]) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)

  function handleCreate(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createDriver(null, formData)
      if (!result.success) { setError(result.error); return }
      setTempPassword(result.data!.tempPassword)
      formRef.current?.reset()
      setDrivers([...drivers, {
        id: 'temp-' + Date.now(),
        first_name: formData.get('firstName') as string,
        last_name: formData.get('lastName') as string,
        email: formData.get('email') as string,
        phone: formData.get('phone') as string,
        avatar_url: null, is_active: true, route_id: null, route_name: null,
      }])
    })
  }

  function handlePhotoSelected(driverId: string, file: File) {
    setUploadingFor(driverId)
    const fd = new FormData()
    fd.set('photo', file)
    startTransition(async () => {
      const result = await uploadDriverPhoto(driverId, fd)
      setUploadingFor(null)
      if (result.success && result.data) {
        setDrivers(drivers.map(d => d.id === driverId ? { ...d, avatar_url: result.data!.url } : d))
      }
    })
  }

  function toggleActive(driver: Driver) {
    startTransition(async () => {
      await updateDriver(driver.id, {
        firstName: driver.first_name, lastName: driver.last_name,
        phone: driver.phone ?? '', isActive: !driver.is_active,
      })
      setDrivers(drivers.map(d => d.id === driver.id ? { ...d, is_active: !d.is_active } : d))
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition">
          {showForm ? 'Annuler' : '+ Nouveau chauffeur'}
        </button>
      </div>

      {showForm && (
        <form ref={formRef} action={handleCreate} className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input name="firstName" placeholder="Prénom" required className="px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          <input name="lastName" placeholder="Nom" required className="px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          <input name="email" type="email" placeholder="Email" required className="px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          <input name="phone" placeholder="Téléphone (actif)" required className="px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          <button type="submit" disabled={pending}
            className="sm:col-span-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition">
            {pending ? 'Création…' : 'Créer le compte chauffeur'}
          </button>
          {error && <p className="sm:col-span-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </form>
      )}

      {tempPassword && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 flex items-center justify-between">
          <span>Compte créé. Mot de passe temporaire : <strong className="font-mono">{tempPassword}</strong> (à communiquer au chauffeur, ne sera plus affiché).</span>
          <button onClick={() => setTempPassword(null)} className="text-green-600 hover:text-green-800">✕</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {drivers.length === 0 ? (
          <p className="px-5 py-10 text-sm text-gray-400 text-center">Aucun chauffeur enregistré.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {drivers.map(driver => (
              <div key={driver.id} className="flex items-center gap-4 px-5 py-4">
                <div className="relative flex-shrink-0">
                  {driver.avatar_url ? (
                    <img src={driver.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                      {driver.first_name[0]}{driver.last_name[0]}
                    </div>
                  )}
                  <button
                    onClick={() => { photoInputRef.current?.setAttribute('data-driver-id', driver.id); photoInputRef.current?.click() }}
                    className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gray-700 text-white text-[10px] flex items-center justify-center"
                    title="Changer la photo"
                  >
                    📷
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{driver.first_name} {driver.last_name}</p>
                  <p className="text-xs text-gray-400">{driver.email} · {driver.phone}</p>
                  {driver.route_name && <p className="text-xs text-purple-600 mt-0.5">Itinéraire : {driver.route_name}</p>}
                  {uploadingFor === driver.id && <p className="text-xs text-blue-500">Envoi de la photo…</p>}
                </div>
                <button onClick={() => toggleActive(driver)} disabled={pending}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    driver.is_active ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                  {driver.is_active ? 'Actif' : 'Désactivé'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          const driverId = photoInputRef.current?.getAttribute('data-driver-id')
          if (file && driverId) handlePhotoSelected(driverId, file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
