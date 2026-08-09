'use client'

import { SidebarLink } from './sidebar-link'
import { SidebarShell } from './sidebar-shell'
import { CollapseToggle } from './collapse-toggle'
import { logoutAction } from '@/actions/auth'
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed'

const CATEGORY_ORDER = ['Gestion', 'Facturation', 'Système']

const NAV = [
  {
    label: 'Tableau de bord',
    href: '/super-admin',
    exact: true,
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Établissements',
    href: '/super-admin/schools',
    category: 'Gestion',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    label: 'Plans tarifaires',
    href: '/super-admin/plans',
    category: 'Facturation',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    label: 'Abonnements',
    href: '/super-admin/subscriptions',
    category: 'Facturation',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    label: 'Espace parents',
    href: '/super-admin/parents',
    category: 'Gestion',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 3v-2a4 4 0 00-3-3.87" />
      </svg>
    ),
  },
  {
    label: 'Monitoring',
    href: '/super-admin/monitoring',
    category: 'Système',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    label: 'Équipe',
    href: '/super-admin/team',
    category: 'Système',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
]

export function SuperAdminSidebar() {
  const { collapsed, toggle } = useSidebarCollapsed()

  const generalNav = NAV.filter((item: any) => !item.category)
  const groupedNav = CATEGORY_ORDER
    .map(category => ({ category, items: NAV.filter((item: any) => item.category === category) }))
    .filter(group => group.items.length > 0)

  return (
    <SidebarShell className={`${collapsed ? 'w-16' : 'w-64'} flex-shrink-0 border-r border-gray-200 bg-white transition-all duration-200`}>
      {/* Logo */}
      <div className={`h-16 flex items-center border-b border-gray-200 ${collapsed ? 'justify-center px-0' : 'px-5'}`}>
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="MyClassLink" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
          {!collapsed && (
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight">MyClassLink</p>
              <p className="text-[10px] text-blue-600 font-medium uppercase tracking-wide">Super Admin</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="space-y-0.5">
          {generalNav.map(item => (
            <SidebarLink key={item.href} {...item} collapsed={collapsed} />
          ))}
        </div>
        {groupedNav.map(group => (
          <div key={group.category} className={collapsed ? 'pt-2 border-t border-gray-100 mt-2' : 'pt-3'}>
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {group.category}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <SidebarLink key={item.href} {...item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Réduire + Déconnexion */}
      <div className="p-3 border-t border-gray-200 space-y-0.5">
        <CollapseToggle collapsed={collapsed} onToggle={toggle} />
        <form action={logoutAction}>
          <button
            type="submit"
            title={collapsed ? 'Déconnexion' : undefined}
            className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium
                       text-red-600 hover:bg-red-50 transition-colors
                       ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!collapsed && 'Déconnexion'}
          </button>
        </form>
      </div>
    </SidebarShell>
  )
}
