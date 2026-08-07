import Link from 'next/link'
import { ReadReceipt } from './read-receipt'

interface MessageListProps {
  messages: any[]
  type: 'inbox' | 'sent'
  basePath: string
}

function formatDate(dateStr: string | Date | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days} jours`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase()
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700',
  CENSOR: 'bg-orange-100 text-orange-700',
  TEACHER: 'bg-blue-100 text-blue-700',
  PARENT: 'bg-purple-100 text-purple-700',
  STUDENT: 'bg-green-100 text-green-700',
}

export function MessageList({ messages, type, basePath }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        {type === 'inbox' ? 'Votre boîte de réception est vide.' : 'Aucun message envoyé.'}
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {messages.map((msg: any) => {
        const isUnread = type === 'inbox' && !msg.read_at
        const firstName = type === 'inbox' ? msg.sender_first_name : msg.recipient_first_name
        const lastName = type === 'inbox' ? msg.sender_last_name : msg.recipient_last_name
        const role = type === 'inbox' ? msg.sender_role : msg.recipient_role
        const colorClass = ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-700'

        return (
          <Link
            key={msg.id}
            href={`${basePath}/${msg.id}`}
            className={`flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition ${isUnread ? 'bg-blue-50/40' : ''}`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${colorClass}`}>
              {initials(firstName ?? '', lastName ?? '')}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                  {firstName} {lastName}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(msg.created_at)}</span>
              </div>
              <p className={`text-sm truncate mt-0.5 ${isUnread ? 'font-medium text-gray-800' : 'text-gray-600'}`}>
                {msg.subject}
              </p>
              <p className="text-xs text-gray-400 truncate mt-0.5">
                {msg.body?.slice(0, 100)}
              </p>
            </div>

            {isUnread && (
              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
            )}
            {type === 'sent' && (
              <div className="flex-shrink-0 mt-2" title={msg.read_at ? 'Lu' : 'Envoyé, non lu'}>
                <ReadReceipt read={!!msg.read_at} />
              </div>
            )}
          </Link>
        )
      })}
    </div>
  )
}
