import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { logoutAction } from '@/actions/auth'

export const runtime = 'nodejs'

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const user = session?.user as any
  if (!user || user.role !== 'DRIVER') redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="w-7 h-7 rounded-lg object-cover" />
          <span className="text-sm font-bold text-gray-900">MyClassLink Chauffeur</span>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="text-xs text-gray-500 hover:text-red-600 transition">Déconnexion</button>
        </form>
      </header>
      <main className="max-w-lg mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
