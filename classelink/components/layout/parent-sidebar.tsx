'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/actions/auth'
import { SidebarShell } from './sidebar-shell'
import { CollapseToggle } from './collapse-toggle'
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed'

const CATEGORY_ORDER = ['Suivi scolaire', 'Finances', 'Vie scolaire', 'Communication']

const NAV = [
  {
    href: '/parent',
    label: 'Tableau de bord',
    exact: true,
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    href: '/parent/children',
    label: 'Mes enfants',
    category: 'Suivi scolaire',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    children: [
      {
        href: '',
        label: 'Aperçu enfant',
        icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
      },
      {
        href: '/notes',
        label: 'Notes & Moyennes',
        icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
      },
      {
        href: '/devoirs',
        label: 'Devoirs',
        icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
      },
      {
        href: '/emploi-du-temps',
        label: 'Emploi du temps',
        icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
      },
      {
        href: '/bulletin',
        label: 'Bulletin',
        icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
      },
      {
        href: '/sanctions',
        label: 'Sanctions',
        icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
      },
      {
        href: '/agenda',
        label: 'Agenda',
        icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
      },
      {
        href: '/resume',
        label: 'Résumé hebdo',
        icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
      },
    ],
  },
  {
    href: '/parent/payments',
    label: 'Frais scolaires',
    category: 'Finances',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
  },
  {
    href: '/parent/cafeteria',
    label: 'Cantine',
    category: 'Vie scolaire',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3v5m4-5v5m-2-5v5m-2 0h4m-2 0v13M16 3v18m0-18c-2 2-2 6 0 8" /></svg>,
  },
  {
    href: '/parent/trips',
    label: 'Sorties',
    category: 'Vie scolaire',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  },
  {
    href: '/parent/absences',
    label: 'Justifier absences',
    category: 'Vie scolaire',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
  },
  {
    href: '/parent/messages',
    label: 'Messages',
    category: 'Communication',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>,
  },
  {
    href: '/parent/appointments',
    label: 'Rendez-vous',
    category: 'Communication',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zm7-6l2 2 4-4" /></svg>,
  },
]

export function ParentSidebar({ parentName, schoolName, logoUrl, slogan }: { parentName: string; schoolName?: string; logoUrl?: string | null; slogan?: string | null }) {
  const pathname = usePathname()
  const { collapsed, toggle } = useSidebarCollapsed()

  // Extraire studentId si on est dans /parent/children/[id]/...
  const childMatch = pathname.match(/^\/parent\/children\/([^/]+)/)
  const currentStudentId = childMatch?.[1] ?? null

  const renderItem = (item: any) => {
    const active = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + '/')
    const hasChildren = !!item.children
    const childrenOpen = hasChildren && active && !collapsed

    return (
      <div key={item.href}>
        <Link href={hasChildren ? `/parent/children` : item.href}
          title={collapsed ? item.label : undefined}
          className={`flex items-center gap-2.5 rounded-lg text-sm font-medium transition
            ${collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2'}
            ${active ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-100'}`}>
          {item.icon}
          {!collapsed && <span className="flex-1">{item.label}</span>}
          {hasChildren && !collapsed && (
            <svg className={`w-3.5 h-3.5 transition-transform ${childrenOpen ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </Link>

        {/* Sous-menu enfant actif */}
        {childrenOpen && currentStudentId && (
          <div className="mt-0.5 ml-3 pl-3 border-l-2 border-purple-100 dark:border-purple-500/20 space-y-0.5">
            {(item.children as any[]).map((sub: any) => {
              const subHref = `/parent/children/${currentStudentId}${sub.href}`
              const subActive = sub.href === ''
                ? pathname === `/parent/children/${currentStudentId}`
                : pathname.startsWith(subHref)
              return (
                <Link key={sub.href} href={subHref}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition
                    ${subActive ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                  {sub.icon}
                  {sub.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const generalNav = NAV.filter((item: any) => !item.category)
  const groupedNav = CATEGORY_ORDER
    .map(category => ({ category, items: NAV.filter((item: any) => item.category === category) }))
    .filter(group => group.items.length > 0)

  return (
    <SidebarShell className={`${collapsed ? 'w-16' : 'w-60'} flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-200`}>
      <div className={`py-4 border-b border-gray-100 dark:border-gray-800 ${collapsed ? 'px-2' : 'px-5'}`}>
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : 'mb-2'}`}>
          <img src={logoUrl || '/logo.png'} alt="Logo" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
          {!collapsed && schoolName && <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{schoolName}</span>}
        </div>
        {!collapsed && (
          <>
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">{slogan || 'Parent'}</p>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5 truncate">{parentName}</p>
          </>
        )}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="space-y-0.5">
          {generalNav.map(renderItem)}
        </div>
        {groupedNav.map(group => (
          <div key={group.category} className="pt-3">
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {group.category}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-3 pb-4 space-y-0.5">
        <CollapseToggle collapsed={collapsed} onToggle={toggle} />
        <form action={logoutAction}>
          <button type="submit"
            title={collapsed ? 'Déconnexion' : undefined}
            className={`w-full flex items-center gap-2.5 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 transition
              ${collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2'}`}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            {!collapsed && 'Déconnexion'}
          </button>
        </form>
      </div>
    </SidebarShell>
  )
}
