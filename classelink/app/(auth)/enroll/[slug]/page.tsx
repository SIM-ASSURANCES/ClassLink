import { notFound } from 'next/navigation'
import { publicPrisma } from '@/lib/db/public'
import { getTenantPrisma } from '@/lib/db/tenant'
import { isEnrollmentOpen, loadEnrollmentSettings } from '@/lib/enrollment/config'
import { SchoolThemeFont, schoolThemeStyle } from '@/components/layout/school-theme'
import { EnrollForm } from './enroll-form'

interface Props {
  params: Promise<{ slug: string }>
}

export const metadata = { title: 'Inscription en ligne' }

export default async function EnrollPage({ params }: Props) {
  const { slug } = await params

  const school = await (publicPrisma as any).school.findFirst({
    where: { slug, status: { in: ['ACTIVE', 'TRIAL'] } },
    select: { name: true, city: true, slug: true, logoUrl: true, phone: true, email: true, schemaName: true },
  })
  if (!school) notFound()

  const db = getTenantPrisma(school.schemaName) as any
  const settings = await loadEnrollmentSettings(db)

  // Identité visuelle de l'école (réglée dans Paramètres) + coordonnées de contact.
  const brandingRows: any[] = await db.$queryRaw`
    SELECT school_name, logo_url, slogan, primary_color, secondary_color, font_family, phone, email
    FROM school_settings LIMIT 1
  `
  const branding = brandingRows[0] ?? {}
  const logo = branding.logo_url ?? school.logoUrl ?? null
  const name = branding.school_name ?? school.name
  const contactPhone = branding.phone ?? school.phone
  const contactEmail = branding.email ?? school.email

  const open = isEnrollmentOpen(settings)

  // Niveaux réellement proposés par l'école (l'admin en choisit un sous-ensemble).
  const levels: { id: string; name: string }[] =
    open && settings.fields.level !== 'hidden' && settings.offeredLevelIds.length > 0
      ? await db.$queryRaw`
          SELECT id, name FROM levels WHERE id = ANY(${settings.offeredLevelIds}::text[]) ORDER BY level_order
        `
      : []

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center p-4"
      style={schoolThemeStyle({
        primaryColor: branding.primary_color, secondaryColor: branding.secondary_color, fontFamily: branding.font_family,
      })}
    >
      <SchoolThemeFont fontFamily={branding.font_family} />
      <div className="w-full max-w-2xl">

        {/* En-tête */}
        <div className="text-center mb-8">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={name} className="w-16 h-16 rounded-2xl object-contain mx-auto mb-4 bg-white border border-gray-200" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
          {(school.city || branding.slogan) && (
            <p className="text-gray-500 text-sm">{branding.slogan ?? school.city}</p>
          )}
          <p className="text-primary font-medium mt-2">
            {settings.welcomeTitle ?? 'Demande d\'inscription en ligne'}
          </p>
        </div>

        {open ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="bg-primary px-6 py-4">
              <h2 className="text-white font-semibold">Formulaire de candidature</h2>
              <p className="text-white/80 text-sm mt-0.5">
                {settings.welcomeMessage ?? 'Remplissez les champs requis. Nous vous répondrons dans les meilleurs délais.'}
              </p>
            </div>
            <EnrollForm
              slug={slug}
              fields={settings.fields}
              documents={settings.documents}
              levels={levels}
              requireConditions={settings.requireConditions}
              conditionsText={settings.conditionsText}
            />
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900">Les inscriptions en ligne sont closes</h2>
            <p className="text-sm text-gray-500 mt-2">
              {settings.opensAt && new Date(settings.opensAt) > new Date()
                ? `Elles ouvriront le ${new Date(settings.opensAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.`
                : 'Pour toute demande d\'inscription, contactez directement l\'établissement.'}
            </p>
            {(contactPhone || contactEmail) && (
              <p className="text-sm text-gray-700 mt-4">
                {contactPhone && <span className="block">Tél. : {contactPhone}</span>}
                {contactEmail && <span className="block">Email : {contactEmail}</span>}
              </p>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          Propulsé par <span className="font-semibold text-primary">MyClassLink</span>
        </p>
      </div>
    </div>
  )
}
