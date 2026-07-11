'use client'

import { useActionState, useEffect, useState } from 'react'
import { loginAction } from '@/actions/auth'
import type { ActionResult } from '@/types'
import Link from 'next/link'
import Image from 'next/image'

interface Props {
  error?: string
  callbackUrl?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked: 'Ce compte Google est déjà lié à un autre utilisateur.',
  SessionRequired: 'Vous devez être connecté pour accéder à cette page.',
}

export function LoginForm({ error, callbackUrl }: Props) {
  const [state, action, isPending] = useActionState<ActionResult | null, FormData>(
    loginAction,
    null
  )
  const [showPassword, setShowPassword] = useState(false)

  // Rechargement complet (plutôt qu'une navigation douce du routeur) pour
  // garantir que le middleware relit le cookie de session tout juste posé —
  // voir le commentaire dans actions/auth.ts::loginAction.
  useEffect(() => {
    if (state?.success) {
      window.location.href = callbackUrl ? decodeURIComponent(callbackUrl) : '/'
    }
  }, [state, callbackUrl])

  const errorMessage =
    (error && ERROR_MESSAGES[error]) ??
    (state && !state.success ? state.error : null)

  return (
    <div className="flex min-h-screen flex-col md:flex-row">

      {/* ═══ Moitié gauche : panneau bleu plein écran ═══ */}
      <div className="relative flex w-full flex-col justify-center overflow-hidden
                      bg-gradient-to-br from-blue-600 to-blue-800 p-10 text-white md:w-1/2 md:p-16">
        {/* Cercles décoratifs */}
        <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-20 -right-10 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute bottom-10 left-10 h-32 w-32 rounded-full bg-blue-400/20 blur-2xl" />

        <div className="relative mx-auto w-full max-w-md">
          <h1 className="text-4xl font-extrabold uppercase tracking-tight sm:text-5xl">Bienvenue</h1>
          <p className="mt-3 text-lg font-semibold uppercase tracking-wide text-blue-100">
            Votre établissement, connecté
          </p>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-blue-100/90">
            Notes, bulletins, présences, paiements Mobile Money et communication
            avec les familles. Connectez-vous pour accéder à votre espace ClasseLink
            et piloter toute la vie de votre école en un seul endroit.
          </p>

          <ul className="mt-7 space-y-2.5">
            {['Suivi en temps réel', 'Espace dédié par rôle', 'Accès sécurisé 24/7'].map(item => (
              <li key={item} className="flex items-center gap-2.5 text-sm text-blue-50">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ═══ Moitié droite : fond grisé, formulaire centré ═══ */}
      <div className="flex w-full items-center justify-center bg-gray-100 p-6 sm:p-10 md:w-1/2">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-6 inline-block">
            <Image
              src="/logo.png"
              alt="ClasseLink"
              width={677}
              height={369}
              priority
              className="h-11 w-auto"
            />
          </Link>

          <h2 className="text-3xl font-bold text-gray-900">Connexion</h2>
          <p className="mt-1.5 text-sm text-gray-500">
            Entrez vos identifiants pour accéder à votre espace
          </p>

          {errorMessage && (
            <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd" />
              </svg>
              {errorMessage}
            </div>
          )}

          <form action={action} className="mt-7 space-y-4">
            {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                Adresse email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="votre@email.ci"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm transition
                           placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-20 text-sm transition
                             placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-xs font-semibold uppercase tracking-wide text-blue-600 hover:text-blue-700"
                  tabIndex={-1}
                >
                  {showPassword ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="remember" className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                <input
                  id="remember"
                  name="remember"
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Se souvenir de moi
              </label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Mot de passe oublié ?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white
                         shadow-lg shadow-blue-600/20 transition hover:bg-blue-700
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                         disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Connexion en cours...
                </span>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Pas encore d&apos;établissement ?{' '}
            <Link href="/register" className="font-medium text-blue-600 hover:underline">
              Créer un compte
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-gray-400">
            Problème de connexion ?{' '}
            <a href="mailto:support@classelink.ci" className="text-blue-600 hover:underline">
              Contacter le support
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
