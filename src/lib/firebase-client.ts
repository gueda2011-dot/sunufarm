"use client"

import { getApp, getApps, initializeApp } from "firebase/app"
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
} from "firebase/messaging"
import { getStorage } from "firebase/storage"

const firebaseWebConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

export function isFirebaseWebPushConfigured() {
  return Boolean(
    firebaseWebConfig.apiKey &&
    firebaseWebConfig.projectId &&
    firebaseWebConfig.messagingSenderId &&
    firebaseWebConfig.appId &&
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
  )
}

function getFirebaseWebApp() {
  if (!isFirebaseWebPushConfigured()) {
    throw new Error("Firebase Web Push n'est pas configure.")
  }

  if (getApps().length > 0) {
    return getApp()
  }

  return initializeApp({
    apiKey: firebaseWebConfig.apiKey!,
    authDomain: firebaseWebConfig.authDomain,
    projectId: firebaseWebConfig.projectId!,
    storageBucket: firebaseWebConfig.storageBucket,
    messagingSenderId: firebaseWebConfig.messagingSenderId!,
    appId: firebaseWebConfig.appId!,
  })
}

export function getFirebaseStorageApp() {
  return getStorage(getFirebaseWebApp())
}

export async function isWebPushSupported() {
  if (typeof window === "undefined") return false
  if (!("Notification" in window)) return false
  if (!("serviceWorker" in navigator)) return false
  return isSupported()
}

export async function getWebPushToken(serviceWorkerRegistration: ServiceWorkerRegistration) {
  if (!(await isWebPushSupported())) {
    return null
  }

  const messaging = getMessaging(getFirebaseWebApp())

  return getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration,
  })
}

export async function subscribeToForegroundMessages(
  onPayload: (payload: MessagePayload) => void,
) {
  if (!(await isWebPushSupported())) {
    return () => undefined
  }

  const messaging = getMessaging(getFirebaseWebApp())
  return onMessage(messaging, onPayload)
}
