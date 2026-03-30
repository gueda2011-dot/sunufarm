import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getMessaging } from "firebase-admin/messaging"
import { getServerEnv } from "@/src/lib/env"
import { logger } from "@/src/lib/logger"

function normalizePrivateKey(raw: string): string {
  // Handle all common Vercel/Windows encoding variants
  return raw
    .replace(/\\\\n/g, "\n")  // double-escaped \\n → newline
    .replace(/\\n/g, "\n")    // literal \n → newline
    .replace(/\\r\\n/g, "\n") // literal \r\n → newline
    .replace(/\\r/g, "")      // standalone literal \r → remove
    .replace(/\r\n/g, "\n")   // actual CRLF → LF
    .replace(/\r/g, "\n")     // actual CR → LF
}

function getFirebaseAdminConfig() {
  const env = getServerEnv()

  const rawKey = env.FIREBASE_PRIVATE_KEY
  const privateKey = rawKey ? normalizePrivateKey(rawKey) : undefined

  if (rawKey && !privateKey?.includes("-----BEGIN")) {
    logger.warn("firebase.private_key_format_suspicious", {
      rawLength: rawKey.length,
      hasLiteralNewline: rawKey.includes("\\n"),
      hasRealNewline: rawKey.includes("\n"),
      first40: rawKey.slice(0, 40),
    })
  }

  return {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey,
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
