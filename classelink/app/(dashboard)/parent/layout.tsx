import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantPrisma } from '@/lib/db/tenant'
import { ParentSidebar } from '@/components/layout/parent-sidebar'
import { SidebarProvider } from '@/components/layout/sidebar-context'
import { DashboardHeader } from '@/components/layout/dashboard-header'
import { SchoolThemeFont, schoolThemeStyle } from '@/components/layout/school-theme'

export const runtime = 'nodejs'

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const user = session?.user as any
  if (!user || user.role !== 'PARENT') redirect('/login')

  let schoolName = ''
  let theme: any = {}
  try {
    const db = getTenantPrisma(user.schemaName) as any
    const rows: any[] = await db.$queryRaw`
      SELECT school_name, logo_url, slogan, primary_color, secondary_color, font_family
      FROM school_settings LIMIT 1
    `
    schoolName = rows[0]?.school_name ?? ''
    theme = rows[0] ?? {}
  } catch { /* ok */ }

  const parentName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()

  return (
    <SidebarProvider>
      <SchoolThemeFont fontFamily={theme.font_family} />
      <div
        className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden"
        style={schoolThemeStyle({
          primaryColor:   theme.primary_color,
          secondaryColor: theme.secondary_color,
          fontFamily:     theme.font_family,
        })}
      >
        <ParentSidebar parentName={parentName} schoolName={schoolName} logoUrl={theme.logo_url} slogan={theme.slogan} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <DashboardHeader title={schoolName || parentName} />
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
