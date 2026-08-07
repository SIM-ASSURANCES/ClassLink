import { getMessage } from '@/actions/messages'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ParentPaywall } from '@/components/ui/parent-paywall'
import { ReadReceipt } from '@/components/messages/read-receipt'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ParentMessageDetailPage({ params }: Props) {
  const { id } = await params
  const msg = await getMessage(id)

  if (!msg) notFound()

  const replySubject = msg.subject?.startsWith('Re: ') ? msg.subject : `Re: ${msg.subject}`
  const replyUrl = `/parent/messages/compose?recipient_id=${msg.sender_id}&subject=${encodeURIComponent(replySubject)}`

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/parent/messages" className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← Retour
        </Link>
      </div>

      <ParentPaywall featureName="La messagerie" featureKey="messages">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h1 className="text-lg font-semibold text-gray-900">{msg.subject}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
            <span>
              De : <span className="font-medium text-gray-700">{msg.sender_first_name} {msg.sender_last_name}</span>
            </span>
            <span>
              À : <span className="font-medium text-gray-700">{msg.recipient_first_name} {msg.recipient_last_name}</span>
            </span>
            <span>
              {new Date(msg.created_at).toLocaleString('fr-FR', {
                day: '2-digit', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
            {msg.is_sender && (
              <span className="flex items-center gap-1.5">
                <ReadReceipt read={!!msg.read_at} />
                {msg.read_at ? 'Lu' : 'Envoyé'}
              </span>
            )}
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{msg.body}</p>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <Link
            href={replyUrl}
            className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            Répondre
          </Link>
          <Link
            href="/parent/messages"
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            Retour à la liste
          </Link>
        </div>
      </div>
      </ParentPaywall>
    </div>
  )
}
