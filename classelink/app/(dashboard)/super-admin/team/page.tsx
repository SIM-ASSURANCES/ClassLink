import { auth } from '@/lib/auth'
import { getSuperAdminUsers } from '@/actions/super-admin'
import { PageHeader } from '@/components/ui/page-header'
import { TeamClient } from './team-client'

export default async function TeamPage() {
  const session = await auth()
  const result  = await getSuperAdminUsers()
  const users   = result.success ? (result.data ?? []) : []
  const me      = users.find(u => u.id === session?.user.id)
  const canManage = me?.permission === 'BOTH'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Équipe super admin"
        description="Ajoutez des collaborateurs et définissez leur niveau d'accès : lecture seule, édition, ou complet."
      />
      {result.success ? (
        <TeamClient users={users} currentUserId={session?.user.id ?? ''} canManage={canManage} />
      ) : (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {result.error}
        </p>
      )}
    </div>
  )
}
