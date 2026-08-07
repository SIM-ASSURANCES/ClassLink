import { auth } from '@/lib/auth'
import { logoutAction } from '@/actions/auth'
import { getNotifications } from '@/actions/notifications'
import { getInitials } from '@/lib/utils'
import { SidebarToggle } from './sidebar-toggle'
import { NotificationBell } from './notification-bell'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import Link from 'next/link'

interface Props {
  title?: string
}

export async function DashboardHeader({ title }: Props) {
  const session = await auth()
  const user = session?.user
  const feed = await getNotifications()

  return (
    <header className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
      <SidebarToggle className="-ml-1 mr-1" />

      {title && (
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h1>
      )}

      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        <ThemeToggle />

        {/* Notifications */}
        <NotificationBell initialItems={feed.items} initialUnread={feed.unread} />

        {/* Avatar + menu utilisateur */}
        {user && (
          <div className="relative group">
            {/* Trigger */}
            <button className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-gray-50 dark:hover:bg-white/10 transition">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold overflow-hidden flex-shrink-0">
                {user.image
                  ? <img src={user.image} alt="" className="w-8 h-8 rounded-full object-cover" />
                  : getInitials(
                      (user as any).firstName ?? user.name?.split(' ')[0] ?? 'U',
                      (user as any).lastName ?? user.name?.split(' ')[1] ?? ''
                    )
                }
              </div>
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">
                  {user.name ?? `${(user as any).firstName} ${(user as any).lastName}`}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{user.email}</p>
              </div>
              <svg className="w-4 h-4 text-gray-400 hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            {/* Dropdown menu */}
            <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg
                            opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <div className="p-2 space-y-0.5">
                <Link
                  href="/account/security"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300
                             hover:bg-gray-50 dark:hover:bg-white/10 transition"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                  </svg>
                  Sécurité du compte
                </Link>
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 p-2">
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-red-600
                               hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                    </svg>
                    Se déconnecter
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
