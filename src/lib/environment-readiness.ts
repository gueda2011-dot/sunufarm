import type { ServerEnv } from "@/src/lib/env"

export interface EnvironmentReadiness {
  coreConfigReady: boolean
  directDatabaseConfigured: boolean
  appUrlConfigured: boolean
  cronReady: boolean
  emailReady: boolean
  emailPartiallyConfigured: boolean
  wavePaymentsReady: boolean
  paymentWebhooksReady: boolean
  aiReady: boolean
}

export function buildEnvironmentReadiness(env: ServerEnv): EnvironmentReadiness {
  const emailReady = Boolean(env.RESEND_API_KEY && env.MAIL_FROM)

  return {
    coreConfigReady: Boolean(
      env.SUNUFARM_DATABASE_URL &&
      env.AUTH_SECRET &&
      env.AUTH_URL,
    ),
    directDatabaseConfigured: Boolean(env.SUNUFARM_DIRECT_URL),
    appUrlConfigured: Boolean(env.NEXT_PUBLIC_APP_URL),
    cronReady: Boolean(env.CRON_SECRET),
    emailReady,
    emailPartiallyConfigured: Boolean(env.RESEND_API_KEY || env.MAIL_FROM) && !emailReady,
    wavePaymentsReady: Boolean(env.WAVE_API_KEY),
    paymentWebhooksReady: Boolean(env.WAVE_WEBHOOK_SECRET || env.PAYMENT_WEBHOOK_SECRET),
    aiReady: Boolean(env.OPENAI_API_KEY),
  }
}
