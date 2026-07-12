import { getChildDetails, getLiaisonFeed, getChildIdCard } from '@/actions/parent'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ChildTabs } from '../child-tabs'
import { LiaisonFeed } from './liaison-feed'
import { ParentPaywall } from '@/components/ui/parent-paywall'

interface Props { params: Promise<{ studentId: string }> }

export const metadata = { title: 'Carnet de liaison' }

export default async function LiaisonPage({ params }: Props) {
  const { studentId } = await params
  const [details, feedResult, idCardResult] = await Promise.all([
    getChildDetails(studentId),
    getLiaisonFeed(studentId),
    getChildIdCard(studentId),
  ])
  if (!details) notFound()

  const { profile } = details
  const feed   = feedResult.success ? (feedResult.data ?? []) : []
  const idCard = idCardResult.success ? idCardResult.data : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/parent" className="hover:text-purple-600">Tableau de bord</Link>
        <span>›</span>
        <Link href={`/parent/children/${studentId}`} className="hover:text-purple-600">
          {profile.first_name} {profile.last_name}
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Carnet de liaison</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center
                        text-purple-700 font-bold text-lg flex-shrink-0">
          {profile.first_name[0]}{profile.last_name[0]}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile.first_name} {profile.last_name}</h1>
          <p className="text-sm text-gray-500">{profile.class_name} · Carnet de liaison numérique</p>
        </div>
      </div>

      <ChildTabs studentId={studentId} />

      <ParentPaywall featureName="Le carnet de liaison" featureKey="liaison">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Carte d'élève numérique (QR) */}
        {idCard && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center lg:col-span-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Carte d&apos;élève</p>
            <div className="mx-auto w-40 h-40 relative">
              <Image src={idCard.qrCode} alt={`QR code de ${idCard.firstName}`} fill className="object-contain" unoptimized />
            </div>
            <p className="text-sm font-semibold text-gray-900 mt-3">{idCard.firstName} {idCard.lastName}</p>
            <p className="text-xs text-gray-400">{idCard.className ?? '—'}</p>
            <p className="text-xs font-mono text-gray-500 mt-1 bg-gray-50 rounded-lg py-1">{idCard.studentNumber}</p>
          </div>
        )}

        {/* Flux chronologique */}
        <div className="lg:col-span-2">
          <LiaisonFeed items={feed} studentId={studentId} studentName={`${profile.first_name} ${profile.last_name}`} />
        </div>
      </div>
      </ParentPaywall>
    </div>
  )
}
