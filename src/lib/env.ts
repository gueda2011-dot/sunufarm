import { z } from "zod"

const optionalNonEmptyString = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  },
  z.string().min(1).optional(),
)

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUNUFARM_DATABASE_URL: z.string().min(1, "SUNUFARM_DATABASE_URL est requis"),
  SUNUFARM_DIRECT_URL: optionalNonEmptyString,
  NEXT_PUBLIC_APP_URL: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().url().optional(),
  ),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET est requis"),
  AUTH_URL: z.string().url("AUTH_URL doit etre une URL valide"),
  RESEND_API_KEY: optionalNonEmptyString,
  MAIL_FROM: optionalNonEmptyString,
  ADMIN_ALERT_EMAILS: optionalNonEmptyString,
  CRON_SECRET: optionalNonEmptyString,
  WAVE_API_KEY: optionalNonEmptyString,
  WAVE_WEBHOOK_SECRET: optionalNonEmptyString,
  PAYMENT_WEBHOOK_SECRET: optionalNonEmptyString,
  OPENAI_API_KEY: optionalNonEmptyString,
  ANTHROPIC_API_KEY: optionalNonEmptyString,
  VERCEL_ENV: optionalNonEmptyString,
  VERCEL_URL: optionalNonEmptyString,
  VERCEL_PROJECT_PRODUCTION_URL: optionalNonEmptyString,
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

function normalizeServerEnv(): ServerEnv {
  const nodeEnv = process.env.NODE_ENV
  const testDefaults = nodeEnv === "test"
    ? {
        SUNUFARM_DATABASE_URL: "postgresql://test:test@localhost:5432/sunufarm_test",
        AUTH_SECRET: "test-auth-secret",
        AUTH_URL: "http://localhost:3000",
      }
    : {}

  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: nodeEnv,
    SUNUFARM_DATABASE_URL: process.env.SUNUFARM_DATABASE_URL ?? testDefaults.SUNUFARM_DATABASE_URL,
    SUNUFARM_DIRECT_URL: process.env.SUNUFARM_DIRECT_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    AUTH_SECRET:
      process.env.AUTH_SECRET ??
      process.env.NEXTAUTH_SECRET ??
      testDefaults.AUTH_SECRET,
    AUTH_URL:
      process.env.AUTH_URL ??
      process.env.NEXTAUTH_URL ??
      testDefaults.AUTH_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    MAIL_FROM: process.env.MAIL_FROM ?? process.env.EMAIL_FROM,
    ADMIN_ALERT_EMAILS: process.env.ADMIN_ALERT_EMAILS,
    CRON_SECRET: process.env.CRON_SECRET,
    WAVE_API_KEY: process.env.WAVE_API_KEY,
    WAVE_WEBHOOK_SECRET: process.env.WAVE_WEBHOOK_SECRET,
    PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  })

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")
    throw new Error(`Configuration d'environnement invalide: ${details}`)
  }

  return parsed.data
}

let cachedServerEnv: ServerEnv | null = null

export function getServerEnv(): ServerEnv {
  cachedServerEnv ??= normalizeServerEnv()
  return cachedServerEnv
}
