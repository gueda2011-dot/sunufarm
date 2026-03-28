import { describe, expect, it } from "vitest"
import type { ServerEnv } from "@/src/lib/env"
import { buildEnvironmentReadiness } from "@/src/lib/environment-readiness"

function createEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    NODE_ENV: "development",
    SUNUFARM_DATABASE_URL: "postgresql://postgres:secret@localhost:5432/sunufarm",
    SUNUFARM_DIRECT_URL: undefined,
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    AUTH_SECRET: "secret",
    AUTH_URL: "http://localhost:3000",
    RESEND_API_KEY: undefined,
    MAIL_FROM: undefined,
    CRON_SECRET: undefined,
    WAVE_API_KEY: undefined,
    WAVE_WEBHOOK_SECRET: undefined,
    PAYMENT_WEBHOOK_SECRET: undefined,
    OPENAI_API_KEY: undefined,
    VERCEL_ENV: undefined,
    VERCEL_URL: undefined,
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
    ...overrides,
  }
}

describe("environment-readiness", () => {
  it("detecte le socle minimal et les integrations actives", () => {
    const readiness = buildEnvironmentReadiness(createEnv({
      SUNUFARM_DIRECT_URL: "postgresql://postgres:secret@localhost:5432/sunufarm",
      CRON_SECRET: "cron-secret",
      RESEND_API_KEY: "re_test",
      MAIL_FROM: "SunuFarm <no-reply@sunufarm.test>",
      WAVE_API_KEY: "wave-api-key",
      PAYMENT_WEBHOOK_SECRET: "payment-webhook-secret",
      OPENAI_API_KEY: "openai-key",
    }))

    expect(readiness.coreConfigReady).toBe(true)
    expect(readiness.directDatabaseConfigured).toBe(true)
    expect(readiness.cronReady).toBe(true)
    expect(readiness.emailReady).toBe(true)
    expect(readiness.emailPartiallyConfigured).toBe(false)
    expect(readiness.wavePaymentsReady).toBe(true)
    expect(readiness.paymentWebhooksReady).toBe(true)
    expect(readiness.aiReady).toBe(true)
  })

  it("signale une configuration email partielle", () => {
    const readiness = buildEnvironmentReadiness(createEnv({
      RESEND_API_KEY: "re_test",
    }))

    expect(readiness.emailReady).toBe(false)
    expect(readiness.emailPartiallyConfigured).toBe(true)
  })

  it("signale les integrations optionnelles non configurees", () => {
    const readiness = buildEnvironmentReadiness(createEnv({
      NEXT_PUBLIC_APP_URL: undefined,
    }))

    expect(readiness.coreConfigReady).toBe(true)
    expect(readiness.appUrlConfigured).toBe(false)
    expect(readiness.cronReady).toBe(false)
    expect(readiness.wavePaymentsReady).toBe(false)
    expect(readiness.paymentWebhooksReady).toBe(false)
    expect(readiness.aiReady).toBe(false)
  })
})
