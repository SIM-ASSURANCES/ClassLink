import { auth } from '@/lib/auth/edge-config'
import { NextRequest, NextResponse } from 'next/server'

// Routes publiques (pas besoin d'auth)
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/two-factor',
  '/api/auth',
  '/api/webhooks',
  '/_next',
  '/favicon.ico',
  '/icons',
  '/manifest.json',
  '/sw.js',
  '/enroll',
]

// Routes réservées au Super Admin
const SUPER_ADMIN_PATHS = ['/super-admin']

// Redirection par rôle
const ROLE_DEFAULT_PATHS: Record<string, string> = {
  SUPER_ADMIN: '/super-admin',
  ADMIN:       '/admin',
  CENSOR:      '/admin',
  ACCOUNTANT:  '/admin',
  TEACHER:     '/teacher',
  STUDENT:     '/student',
  PARENT:      '/parent',
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p))
}

function isSuperAdminPath(pathname: string): boolean {
  return SUPER_ADMIN_PATHS.some(p => pathname.startsWith(p))
}

/**
 * Vérifie le cookie 2FA `${userId}:${expiresAt}.${hmacHex}` de façon COMPLÈTE,
 * signature HMAC-SHA256 incluse, en Web Crypto pour rester compatible Edge.
 * Le module `lib/auth/two-fa-cookie` utilise le `crypto` Node et ne peut pas
 * tourner ici : on réimplémente donc la vérification cryptographique côté Edge,
 * avec le même secret (`AUTH_SECRET`) et le même format que la signature.
 */
async function verify2FACookieEdge(value: string, userId: string): Promise<boolean> {
  try {
    const secret = process.env.AUTH_SECRET
    if (!secret) return false

    const lastDot = value.lastIndexOf('.')
    if (lastDot === -1) return false
    const payload = value.slice(0, lastDot)
    const sig = value.slice(lastDot + 1)

    const [uid, expiresAtStr] = payload.split(':')
    if (uid !== userId) return false
    const expiresAt = parseInt(expiresAtStr, 10)
    if (isNaN(expiresAt) || Date.now() > expiresAt) return false

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const expected = Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Comparaison à temps constant
    if (expected.length !== sig.length) return false
    let diff = 0
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
    }
    return diff === 0
  } catch {
    return false
  }
}

export default auth(async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hostname = request.headers.get('host') ?? ''
  const session = (request as any).auth

  // Page d'accueil publique : visiteurs → landing, connectés → leur espace
  if (pathname === '/') {
    if (session?.user) {
      const role = session.user.role as string
      const dest = ROLE_DEFAULT_PATHS[role] ?? '/admin'
      return NextResponse.redirect(new URL(dest, request.url))
    }
    return NextResponse.next()
  }

  // Laisser passer les routes publiques
  if (isPublicPath(pathname)) {
    // Si déjà connecté et tente d'accéder au login, rediriger vers le dashboard
    if (pathname === '/login' && session?.user) {
      const role = session.user.role as string
      const dest = ROLE_DEFAULT_PATHS[role] ?? '/admin'
      return NextResponse.redirect(new URL(dest, request.url))
    }
    return NextResponse.next()
  }

  // Pas connecté → login
  if (!session?.user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', encodeURIComponent(pathname))
    return NextResponse.redirect(loginUrl)
  }

  // 2FA obligatoire : si activé et cookie de vérification absent/invalide → /two-factor
  // La signature HMAC du cookie est désormais vérifiée intégralement (cf.
  // verify2FACookieEdge) — une simple validation structurelle était contournable.
  if (session.user.twoFactorEnabled && pathname !== '/two-factor') {
    const twoFaVerified = request.cookies.get('2fa_verified')?.value
    const is2FAValid = twoFaVerified
      ? await verify2FACookieEdge(twoFaVerified, session.user.id)
      : false
    if (!is2FAValid) {
      return NextResponse.redirect(new URL('/two-factor', request.url))
    }
  }

  // Super Admin : uniquement /super-admin
  if (isSuperAdminPath(pathname)) {
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return NextResponse.next()
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('x-hostname', hostname)
  return response
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
