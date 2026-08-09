import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Landing } from '@/components/marketing/landing'

export const runtime = 'nodejs'

const REDIRECT_MAP: Record<string, string> = {
  SUPER_ADMIN: '/super-admin',
  ADMIN: '/admin',
  CENSOR: '/admin/attendance',
  ACCOUNTANT: '/accountant/payments',
  STAFF: '/admin',
  TEACHER: '/teacher',
  PARENT: '/parent',
  STUDENT: '/student',
  DRIVER: '/driver',
}

export default async function RootPage() {
  const session = await auth()

  if (session?.user) {
    const role = (session.user as any).role as string
    redirect(REDIRECT_MAP[role] ?? '/login')
  }

  return <Landing isAuthenticated={false} dashboardHref="/login" />
}
