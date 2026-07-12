import { getContacts } from '@/actions/messages'
import { ComposeForm } from '@/components/messages/compose-form'
import Link from 'next/link'
import { ParentPaywall } from '@/components/ui/parent-paywall'

export const metadata = { title: 'Nouveau message' }

interface Props {
  searchParams: Promise<{ recipient_id?: string; subject?: string }>
}

export default async function ParentComposeMessagePage({ searchParams }: Props) {
  const { recipient_id, subject } = await searchParams
  const contacts = await getContacts()

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/parent/messages" className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← Retour
        </Link>
      </div>

      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Nouveau message</h1>
        </div>

        <ParentPaywall featureName="La messagerie" featureKey="messages">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <ComposeForm
            contacts={contacts}
            defaultRecipientId={recipient_id}
            defaultSubject={subject}
          />
        </div>
        </ParentPaywall>
      </div>
    </div>
  )
}
