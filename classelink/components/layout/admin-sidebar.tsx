'use client'

import { SidebarLink } from './sidebar-link'
import { SidebarShell } from './sidebar-shell'
import { CollapseToggle } from './collapse-toggle'
import { logoutAction } from '@/actions/auth'
import { featureForPath, hasFeature } from '@/lib/plan/features'
import { moduleForPath } from '@/lib/permissions/modules'
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed'

type Role = 'ADMIN' | 'CENSOR' | 'ACCOUNTANT' | 'TEACHER' | 'STAFF'

type Category =
  | 'Scolarité'
  | 'Personnes'
  | 'Pédagogie'
  | 'Vie scolaire'
  | 'Finances'
  | 'Communication'
  | 'Système'

interface NavItem {
  label: string
  href: string
  exact?: boolean
  roles?: Role[] // undefined = accessible à tous les rôles admin
  category?: Category // undefined = section générale (en haut, sans titre)
  icon: React.ReactNode
}

// Ordre d'affichage des catégories dans le menu
const CATEGORY_ORDER: Category[] = [
  'Scolarité',
  'Personnes',
  'Pédagogie',
  'Vie scolaire',
  'Finances',
  'Communication',
  'Système',
]

const NAV: NavItem[] = [
  {
    label: 'Tableau de bord',
    href: '/admin',
    exact: true,
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Années scolaires',
    href: '/admin/academic-years',
    category: 'Scolarité',
    roles: ['ADMIN'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: 'Classes',
    href: '/admin/classes',
    category: 'Scolarité',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    label: 'Matières',
    href: '/admin/subjects',
    category: 'Scolarité',
    roles: ['ADMIN'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    label: 'Enseignants',
    href: '/admin/teachers',
    category: 'Personnes',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    label: 'Élèves',
    href: '/admin/students',
    category: 'Personnes',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    label: 'Parents',
    href: '/admin/parents',
    category: 'Personnes',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Présences',
    href: '/admin/attendance',
    category: 'Vie scolaire',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: 'Présence enseignants',
    href: '/admin/teacher-attendance',
    category: 'Vie scolaire',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    label: 'Notes & Moyennes',
    href: '/admin/grades',
    category: 'Pédagogie',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    label: 'Paiements',
    href: '/admin/payments',
    roles: ['ADMIN', 'ACCOUNTANT'],
    category: 'Finances',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: 'Frais scolaires',
    href: '/admin/fees',
    category: 'Finances',
    roles: ['ADMIN', 'ACCOUNTANT'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    label: 'Emploi du temps',
    href: '/admin/schedule',
    category: 'Scolarité',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: 'Assistant IA',
    href: '/admin/assistant',
    category: 'Communication',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
  {
    label: 'Supervision IA',
    href: '/admin/ai-supervision',
    category: 'Communication',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
  {
    label: 'Annonces',
    href: '/admin/announcements',
    category: 'Communication',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
  {
    label: 'Sanctions',
    href: '/admin/sanctions',
    category: 'Vie scolaire',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    label: 'Analytics',
    href: '/admin/analytics',
    category: 'Finances',
    roles: ['ADMIN', 'CENSOR', 'ACCOUNTANT'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    label: 'Rapport financier',
    href: '/admin/payments/report',
    category: 'Finances',
    roles: ['ADMIN', 'ACCOUNTANT'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    label: 'Conseil de classe',
    href: '/admin/councils',
    category: 'Scolarité',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    label: 'Inscriptions',
    href: '/admin/enrollments',
    category: 'Scolarité',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
  },
  {
    label: 'Bibliothèque',
    href: '/admin/library',
    category: 'Pédagogie',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    label: 'Cantine',
    href: '/admin/cafeteria',
    category: 'Vie scolaire',
    roles: ['ADMIN'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M6 3v5m4-5v5m-2-5v5m-2 0h4m-2 0v13M16 3v18m0-18c-2 2-2 6 0 8" />
      </svg>
    ),
  },
  {
    label: 'Ressources',
    href: '/admin/resources',
    category: 'Pédagogie',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    label: 'Sorties',
    href: '/admin/trips',
    category: 'Vie scolaire',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
  {
    label: 'Transport',
    href: '/admin/transport',
    category: 'Vie scolaire',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 17h8m-8 0a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 104 0 2 2 0 00-4 0zM5 17V8a2 2 0 012-2h10a2 2 0 012 2v9M5 17h14M5 11h14" />
      </svg>
    ),
  },
  {
    label: 'Alertes',
    href: '/admin/alerts',
    category: 'Vie scolaire',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    label: 'Messages',
    href: '/admin/messages',
    category: 'Communication',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    label: 'Récompenses',
    href: '/admin/rewards',
    category: 'Vie scolaire',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
  },
  {
    label: 'Convocations',
    href: '/admin/convocations',
    category: 'Vie scolaire',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: 'Bourses',
    href: '/admin/scholarships',
    category: 'Finances',
    roles: ['ADMIN', 'ACCOUNTANT'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: 'Agenda',
    href: '/admin/agenda',
    category: 'Scolarité',
    roles: ['ADMIN', 'CENSOR'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: 'Paramètres',
    href: '/admin/settings',
    category: 'Système',
    roles: ['ADMIN'],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administration',
  CENSOR: 'Censure',
  ACCOUNTANT: 'Comptabilité',
  TEACHER: 'Enseignant',
  STAFF: 'Personnel',
}

export function AdminSidebar({
  schoolName,
  role = 'ADMIN',
  planSlug = null,
  logoUrl = null,
  slogan = null,
  allowedModules = [],
}: {
  schoolName?: string
  role?: string
  planSlug?: string | null
  logoUrl?: string | null
  slogan?: string | null
  allowedModules?: string[]
}) {
  const userRole = (role as Role) || 'ADMIN'
  const { collapsed, toggle } = useSidebarCollapsed()

  const visibleNav = NAV.filter(item => {
    // Filtre par forfait (commun à tous)
    const feat = featureForPath(item.href)
    if (feat && !hasFeature(planSlug, feat)) return false

    // Personnel : uniquement le tableau de bord + ses modules autorisés
    if (userRole === 'STAFF') {
      if (item.exact && item.href === '/admin') return true
      const mod = moduleForPath(item.href)
      return !!mod && allowedModules.includes(mod)
    }

    // Rôles pleins : filtre par rôle de l'item
    if (item.roles && !item.roles.includes(userRole)) return false
    return true
  })

  // Entrées générales (sans catégorie) affichées en premier, sans titre
  const generalNav = visibleNav.filter(item => !item.category)
  // Regroupe les entrées restantes par catégorie, en respectant CATEGORY_ORDER
  const groupedNav = CATEGORY_ORDER
    .map(category => ({
      category,
      items: visibleNav.filter(item => item.category === category),
    }))
    .filter(group => group.items.length > 0)

  return (
    <SidebarShell className={`${collapsed ? 'w-16' : 'w-64'} flex-shrink-0 border-r border-gray-200 bg-white transition-all duration-200`}>
      <div className={`h-16 flex items-center border-b border-gray-200 ${collapsed ? 'justify-center px-0' : 'px-5'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={logoUrl || '/logo.png'} alt="Logo" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-tight truncate">
                {schoolName ?? 'MyClassLink'}
              </p>
              <p className="text-[10px] text-primary font-medium uppercase tracking-wide truncate">
                {slogan || ROLE_LABELS[userRole] || 'Administration'}
              </p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Entrées générales (Tableau de bord…) */}
        <div className="space-y-0.5">
          {generalNav.map(item => (
            <SidebarLink key={item.href} {...item} collapsed={collapsed} />
          ))}
        </div>

        {/* Sections regroupées par catégorie */}
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
