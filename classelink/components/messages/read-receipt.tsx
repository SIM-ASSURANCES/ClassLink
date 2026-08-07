/** Accusé de lecture façon messagerie mobile : un ✓ gris (envoyé), deux ✓✓ bleus (lu). */
export function ReadReceipt({ read }: { read: boolean }) {
  return (
    <svg viewBox="0 0 20 12" className={`w-5 h-3 ${read ? 'text-blue-500' : 'text-gray-300'}`} fill="none">
      <path d="M1 6l3 3 5-6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      {read && (
        <path d="M7 6l3 3 8-9" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}
