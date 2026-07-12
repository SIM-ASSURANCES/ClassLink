import { getParentFeatureFlags, getAllParents } from '@/actions/super-admin'
import { PageHeader } from '@/components/ui/page-header'
import { ParentFeaturesClient } from './parent-features-client'
import { ParentsDirectoryClient } from './parents-directory-client'

export default async function SuperAdminParentsPage() {
  const [flagsResult, parentsResult] = await Promise.all([
    getParentFeatureFlags(),
    getAllParents(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Espace parents"
        description="Verrouillez ou déverrouillez les fonctionnalités de l'espace parent sur toute la plateforme, et consultez l'annuaire de tous les parents."
      />

      <ParentFeaturesClient overrides={flagsResult.success ? (flagsResult.data ?? {}) : {}} />

      <ParentsDirectoryClient
        parents={parentsResult.success ? (parentsResult.data ?? []) : []}
        error={!parentsResult.success ? parentsResult.error : undefined}
      />
    </div>
  )
}
