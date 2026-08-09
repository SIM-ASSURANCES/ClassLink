'use client'

import { useState, useRef, useEffect } from 'react'
import type { ActionResult } from '@/types'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
}

/** Rend `**texte**` en gras — seule mise en forme que l'assistant IA utilise. */
function renderWithBold(content: string) {
  const parts = content.split(/(\*\*[^*]+?\*\*)/g)
  return parts.map((part, i) => {
    const match = part.match(/^\*\*([^*]+?)\*\*$/)
    return match ? <strong key={i}>{match[1]}</strong> : <span key={i}>{part}</span>
  })
}

interface Props {
  askFn: (question: string, history: { role: 'user' | 'assistant'; content: string }[]) => Promise<ActionResult<string>>
  emptyStateText: string
  suggestions: string[]
}

/** Panneau de chat IA générique — réutilisé par les assistants enseignant et administratif. */
export function AiChatPanel({ askFn, emptyStateText, suggestions }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(question: string) {
    if (!question.trim() || loading) return
    setInput('')
    const history = messages
      .filter(m => !m.isError)
      .map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    const result = await askFn(question, history)

    if (result.success && result.data) {
      setMessages(prev => [...prev, { role: 'assistant', content: result.data as string }])
    } else if (!result.success) {
      setMessages(prev => [...prev, { role: 'assistant', content: result.error ?? 'Erreur.', isError: true }])
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ height: '60vh' }}>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </span>
            <p className="text-sm text-gray-400 max-w-xs">{emptyStateText}</p>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs text-left px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-violet-300 hover:bg-violet-50 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
              m.role === 'user'
                ? 'bg-blue-600 text-white'
                : m.isError
                  ? 'bg-orange-50 text-orange-700 border border-orange-200'
                  : 'bg-gray-100 text-gray-800'
            }`}>
              {renderWithBold(m.content)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-2.5 text-sm text-gray-400">
              L&apos;assistant réfléchit…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send(input) }}
        className="border-t border-gray-100 p-3 flex gap-2"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Posez votre question..."
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold
                     hover:bg-blue-700 disabled:opacity-50 transition"
        >
          Envoyer
        </button>
      </form>
    </div>
  )
}
