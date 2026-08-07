'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/actions/auth'
import { SidebarShell } from './sidebar-shell'
import { CollapseToggle } from './collapse-toggle'
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed'

type NavItem = {
  href: string
  label: string
  category?: string // undefined = section générale (en haut, sans titre)
  icon: React.ReactNode
}

const CATEGORY_ORDER = ['Pédagogie', 'Vie de classe', 'Communication', 'Pilotage']

const NAV: NavItem[] = [
  {
    href: '/teacher',
    label: 'Tableau de bord',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    href: '/teacher/grades',
    label: 'Saisie des notes',
    category: 'Pédagogie',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
  {
    href: '/teacher/attendance',
    label: 'Appel & Présences',
    category: 'Vie de classe',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: '/teacher/schedule',
    label: 'Emploi du temps',
    category: 'Vie de classe',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: '/teacher/assignments',
    label: 'Devoirs',
    category: 'Pédagogie',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: '/teacher/lessons',
    label: 'Cahier de texte',
    category: 'Pédagogie',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    href: '/teacher/messages',
    label: 'Messages',
    category: 'Communication',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    href: '/teacher/appointments',
    label: 'Rendez-vous',
    category: 'Communication',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zm7-6l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: '/teacher/assistant',
    label: 'Assistant IA',
    category: 'Pédagogie',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
  {
    href: '/teacher/resources',
    label: 'Ressources',
    category: 'Pédagogie',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: '/teacher/trips',
    label: 'Sorties',
    category: 'Vie de classe',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
  {
    href: '/teacher/quiz',
    label: 'Quiz & QCM',
    category: 'Pédagogie',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: '/teacher/analytics',
    label: 'Analytiques',
    category: 'Pilotage',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
]

interface Props {
  teacherName: string
  schoolName?: string
  logoUrl?: string | null
  slogan?: string | null
}

export function TeacherSidebar({ teacherName, schoolName, logoUrl, slogan }: Props) {
  const pathname = usePathname()
  const { collapsed, toggle } = useSidebarCollapsed()

  const renderLink = (item: NavItem) => {
    const active = item.href === '/teacher'
      ? pathname === '/teacher'
      : pathname.startsWith(item.href)
    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={`flex items-center gap-2.5 rounded-lg text-sm font-medium transition ${
          collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2'
        } ${
          active
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        {item.icon}
        {!collapsed && item.label}
      </Link>
    )
  }

  const generalNav = NAV.filter(item => !item.category)
  const groupedNav = CATEGORY_ORDER
    .map(category => ({ category, items: NAV.filter(item => item.category === category) }))
    .filter(group => group.items.length > 0)

  return (
    <SidebarShell className={`${collapsed ? 'w-16' : 'w-56'} flex-shrink-0 bg-white border-r border-gray-200 transition-all duration-200`}>
      {/* En-tête */}
      <div className={`border-b border-gray-100 ${collapsed ? 'px-2 py-4 text-center' : 'px-5 py-4'}`}>
        {collapsed ? (
          <img src={logoUrl || '/logo.png'} alt="Logo" className="w-7 h-7 rounded-lg object-cover mx-auto" />
        ) : (
          <>
            <img src={logoUrl || '/logo.png'} alt="Logo" className="w-7 h-7 rounded-lg object-cover mb-2" />
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">{slogan || 'Enseignant'}</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5 truncate">{teacherName}</p>
            {schoolName && (
              <p className="text-xs text-gray-400 truncate">{schoolName}</p>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="space-y-0.5">
          {generalNav.map(renderLink)}
        </div>
        {groupedNav.map(group => (
          <div key={group.category} className={collapsed ? 'pt-2 border-t border-gray-100 mt-2' : 'pt-3'}>
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {group.category}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(renderLink)}
            </div>
          </div>
        ))}
      </nav>

      {/* Réduire + Déconnexion */}
      <div className="px-3 pb-4 space-y-0.5">
        <CollapseToggle collapsed={collapsed} onToggle={toggle} />
        <form action={logoutAction}>
          <button
            type="submit"
            title={collapsed ? 'Déconnexion' : undefined}
            className={`w-full flex items-center gap-2.5 rounded-lg text-sm
                       font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition
                       ${collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2'}`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
