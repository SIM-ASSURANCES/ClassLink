import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

let app: App | null = null

function getFirebaseApp(): App | null {
  const projectId   = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) return null

  if (app) return app
  if (getApps().length > 0) {
    app = getApps()[0]
    return app
  }

  app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      // Les .env stockent le saut de ligne littéral `\n` — il faut le reconvertir.
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  })
  return app
}

export function isPushEnabled(): boolean {
  return getFirebaseApp() !== null
}

interface PushPayload {
  tokens: string[]
  title: string
  body: string
  data?: Record<string, string>
}

/**
 * Envoie une notification push à une liste de tokens FCM.
 * Retourne le nombre d'envois réussis/échoués — n'écarte jamais silencieusement
 * les tokens invalides côté appelant (voir `pruneInvalidTokens` dans notifications/service.ts).
 */
export async function sendPushNotification(payload: PushPayload): Promise<{
  successCount: number
  failureCount: number
  invalidTokens: string[]
}> {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp || payload.tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] }
  }

  const messaging = getMessaging(firebaseApp)
  const response = await messaging.sendEachForMulticast({
    tokens: payload.tokens,
    notification: { title: payload.title, body: payload.body },
    data: payload.data,
    android: { priority: 'high' },
  })

  const invalidTokens: string[] = []
  response.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        invalidTokens.push(payload.tokens[i])
      }
    }
  })

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens,
  }
}

/**
 * Envoie un push silencieux (data-only, sans bannière visible) à une liste de
 * tokens FCM — utilisé pour déclencher un rafraîchissement instantané côté
 * app mobile (ex. changement d'un verrou de fonctionnalité parent) sans
 * notifier l'utilisateur d'un événement.
 */
export async function sendDataPush(tokens: string[], data: Record<string, string>): Promise<{
  successCount: number
  failureCount: number
  invalidTokens: string[]
}> {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp || tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] }
  }

  const messaging = getMessaging(firebaseApp)
  const response = await messaging.sendEachForMulticast({
    tokens,
    data,
    android: { priority: 'high' },
  })

  const invalidTokens: string[] = []
  response.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        invalidTokens.push(tokens[i])
      }
    }
  })

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens,
  }
}
