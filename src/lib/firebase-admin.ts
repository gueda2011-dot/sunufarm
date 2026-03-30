import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getMessaging } from "firebase-admin/messaging"
import { getServerEnv } from "@/src/lib/env"

function getFirebaseAdminConfig() {
  const env = getServerEnv()

  return {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY
      ?.replace(/\\n/g, "\n")   // literal \n → real newline (format Vercel)
      ?.replace(/\r\n/g, "\n")  // Windows CRLF → LF
      ?.replace(/\r/g, "\n"),   // CR seul → LF
  }
}

export function isFirebaseAdminConfigured() {
  const config = getFirebaseAdminConfig()

  return Boolean(
    config.projectId &&
    config.clientEmail &&
    config.privateKey,
  )
}

export function getFirebaseAdminApp() {
  const config = getFirebaseAdminConfig()

  if (!config.projectId || !config.clientEmail || !config.privateKey) {
    throw new Error(
      "Firebase Admin n'est pas configure. Ajoutez FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.",
    )
  }

  const existingApp = getApps()[0]
  if (existingApp) return existingApp

  return initializeApp({
    credential: cert({
      projectId: config.projectId,
      clientEmail: config.clientEmail,
      privateKey: config.privateKey,
    }),
  })
}

export function getFirebaseAdminMessaging() {
  return getMessaging(getFirebaseAdminApp())
}
