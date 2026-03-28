import { createHmac, timingSafeEqual, randomUUID } from "node:crypto"
import prisma from "@/src/lib/prisma"
import { getServerEnv } from "@/src/lib/env"
import {
  type Prisma,
  PaymentMethod,
  PaymentProvider,
  PaymentTransactionStatus,
  SubscriptionPaymentStatus,
  SubscriptionPlan,
} from "@/src/generated/prisma/client"
import {
  PLAN_DEFINITIONS,
  UNLIMITED_AI,
} from "@/src/lib/subscriptions"

const MOBILE_MONEY_TRANSACTION_TTL_MS = 15 * 60 * 1000
const WAVE_API_BASE_URL = "https://api.wave.com"
const WAVE_WEBHOOK_TOLERANCE_SECONDS = 300

export function resolvePaymentProvider(
  paymentMethod: PaymentMethod,
): PaymentProvider {
  switch (paymentMethod) {
    case PaymentMethod.VIREMENT:
      return PaymentProvider.BANK_TRANSFER
    case PaymentMethod.MOBILE_MONEY:
      return PaymentProvider.WAVE
    default:
      return PaymentProvider.MANUAL
  }
}

export function createPaymentIdempotencyKey(): string {
  return randomUUID()
}

export function createCheckoutToken(): string {
  return randomUUID().replace(/-/g, "")
}

export async function createPaymentTransaction(input: {
  organizationId: string
  userId: string
  subscriptionPaymentId: string
  requestedPlan: SubscriptionPlan
  amountFcfa: number
  paymentMethod: PaymentMethod
}) {
  const provider = resolvePaymentProvider(input.paymentMethod)
  const now = new Date()
  const expiresAt =
    input.paymentMethod === PaymentMethod.MOBILE_MONEY
      ? new Date(now.getTime() + MOBILE_MONEY_TRANSACTION_TTL_MS)
      : null

  return prisma.paymentTransaction.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      subscriptionPaymentId: input.subscriptionPaymentId,
      requestedPlan: input.requestedPlan,
      provider,
      status:
        input.paymentMethod === PaymentMethod.MOBILE_MONEY
          ? PaymentTransactionStatus.PENDING
          : PaymentTransactionStatus.CREATED,
      amountFcfa: input.amountFcfa,
      idempotencyKey: createPaymentIdempotencyKey(),
      checkoutToken: createCheckoutToken(),
      initiatedAt: now,
      expiresAt,
    },
    select: {
      id: true,
      provider: true,
      status: true,
      checkoutToken: true,
      expiresAt: true,
    },
  })
}

export function verifyWebhookSignature(input: {
  provider: PaymentProvider
  payload: string
  signature: string | null
  secret: string | undefined
}): boolean {
  if (input.provider === PaymentProvider.WAVE) {
    return verifyWaveSignature(input.payload, input.signature, input.secret)
  }

  if (!input.secret || !input.signature) {
    return false
  }

  const expected = createHmac("sha256", input.secret)
    .update(input.payload)
    .digest("hex")

  const provided = input.signature.trim()
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)

  if (expectedBuffer.length !== providedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, providedBuffer)
}

function verifyWaveSignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !signature) {
    return false
  }

  const parts = signature.split(",")
  const timestampPart = parts.find((part) => part.startsWith("t="))
  const signatureParts = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))

  if (!timestampPart || signatureParts.length === 0) {
    return false
  }

  const timestamp = Number(timestampPart.slice(2))
  if (!Number.isFinite(timestamp)) {
    return false
  }

  const ageInSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp)
  if (ageInSeconds > WAVE_WEBHOOK_TOLERANCE_SECONDS) {
    return false
  }

  const signedPayload = `${timestamp}${rawBody}`
  const expected = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex")

  return signatureParts.some((candidate) => {
    const expectedBuffer = Buffer.from(expected)
    const candidateBuffer = Buffer.from(candidate)

    if (expectedBuffer.length !== candidateBuffer.length) {
      return false
    }

    return timingSafeEqual(expectedBuffer, candidateBuffer)
  })
}

function getAppBaseUrl(): string {
  const env = getServerEnv()
  return (
    env.NEXT_PUBLIC_APP_URL ??
    env.AUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "")
}

export async function createWaveCheckoutSessionForTransaction(
  transactionId: string,
) {
  const apiKey = getServerEnv().WAVE_API_KEY
  if (!apiKey) {
    throw new Error("WAVE_NOT_CONFIGURED")
  }

  const transaction = await prisma.paymentTransaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      organizationId: true,
      provider: true,
      status: true,
      amountFcfa: true,
      currency: true,
      checkoutToken: true,
      providerReference: true,
      providerPayload: true,
      expiresAt: true,
    },
  })

  if (!transaction) {
    throw new Error("TRANSACTION_NOT_FOUND")
  }

  if (transaction.provider !== PaymentProvider.WAVE) {
    throw new Error("PROVIDER_NOT_SUPPORTED")
  }

  const existingLaunchUrl = extractWaveLaunchUrl(transaction.providerPayload)
  const now = new Date()
  if (
    transaction.providerReference &&
    existingLaunchUrl &&
    transaction.expiresAt &&
    transaction.expiresAt > now &&
    transaction.status !== PaymentTransactionStatus.CONFIRMED
  ) {
    return {
      checkoutId: transaction.providerReference,
      checkoutUrl: existingLaunchUrl,
      expiresAt: transaction.expiresAt,
    }
  }

  const appBaseUrl = getAppBaseUrl()
  const payload = {
    amount: String(transaction.amountFcfa),
    currency: transaction.currency,
    client_reference: transaction.id,
    success_url: `${appBaseUrl}/settings?payment=success&provider=wave&transaction=${transaction.id}`,
    error_url: `${appBaseUrl}/settings?payment=error&provider=wave&transaction=${transaction.id}`,
  }

  const response = await fetch(`${WAVE_API_BASE_URL}/v1/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const json = await response.json() as {
    id?: string
    wave_launch_url?: string
    checkout_status?: string
    when_expires?: string
    [key: string]: unknown
  }

  if (!response.ok || !json.id || !json.wave_launch_url) {
    throw new Error("WAVE_CHECKOUT_FAILED")
  }

  const updated = await prisma.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: PaymentTransactionStatus.REQUIRES_ACTION,
      providerReference: json.id,
      providerStatus: json.checkout_status ?? "open",
      providerPayload: json as Prisma.InputJsonValue,
      expiresAt: json.when_expires ? new Date(json.when_expires) : transaction.expiresAt,
    },
    select: {
      providerReference: true,
      expiresAt: true,
    },
  })

  return {
    checkoutId: updated.providerReference ?? json.id,
    checkoutUrl: json.wave_launch_url,
    expiresAt: updated.expiresAt,
  }
}

function extractWaveLaunchUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const waveLaunchUrl = (payload as Record<string, unknown>).wave_launch_url
  return typeof waveLaunchUrl === "string" ? waveLaunchUrl : null
}

export async function recordWebhookEvent(input: {
  paymentTransactionId?: string | null
  provider: PaymentProvider
  eventType: string
  providerEventId?: string | null
  signature?: string | null
  payload: unknown
  processedAt?: Date | null
  processingError?: string | null
}) {
  return prisma.paymentWebhookEvent.create({
    data: {
      paymentTransactionId: input.paymentTransactionId ?? null,
      provider: input.provider,
      eventType: input.eventType,
      providerEventId: input.providerEventId ?? null,
      signature: input.signature ?? null,
      payload: input.payload as Prisma.InputJsonValue,
      processedAt: input.processedAt ?? null,
      processingError: input.processingError ?? null,
    },
  })
}

export async function confirmPaymentTransaction(input: {
  transactionId: string
  providerReference?: string | null
  providerTransactionId?: string | null
  providerStatus?: string | null
  providerPayload?: unknown
}) {
  const now = new Date()

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.paymentTransaction.findUnique({
      where: { id: input.transactionId },
      select: {
        id: true,
        status: true,
        subscriptionPaymentId: true,
        organizationId: true,
      },
    })

    if (!transaction) {
      throw new Error("TRANSACTION_NOT_FOUND")
    }

    if (transaction.status === PaymentTransactionStatus.CONFIRMED) {
      return transaction
    }

    const updatedTransaction = await tx.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: PaymentTransactionStatus.CONFIRMED,
        providerReference: input.providerReference ?? undefined,
        providerTransactionId: input.providerTransactionId ?? undefined,
        providerStatus: input.providerStatus ?? undefined,
        providerPayload: input.providerPayload ?? undefined,
        confirmedAt: now,
      },
    })

    if (transaction.subscriptionPaymentId) {
      const payment = await tx.subscriptionPayment.update({
        where: { id: transaction.subscriptionPaymentId },
        data: {
          status: SubscriptionPaymentStatus.CONFIRMED,
          paymentReference: input.providerReference ?? undefined,
          paidAt: now,
          confirmedAt: now,
        },
        select: {
          organizationId: true,
          requestedPlan: true,
          amountFcfa: true,
        },
      })

      const existingSubscription = await tx.subscription.findUnique({
        where: { organizationId: payment.organizationId },
        select: {
          plan: true,
          currentPeriodEnd: true,
        },
      })

      const isRenewal =
        existingSubscription?.plan === payment.requestedPlan &&
        existingSubscription.currentPeriodEnd != null &&
        existingSubscription.currentPeriodEnd > now

      const periodStart =
        isRenewal && existingSubscription?.currentPeriodEnd
          ? existingSubscription.currentPeriodEnd
          : now
      const periodEnd = new Date(periodStart)
      periodEnd.setDate(periodEnd.getDate() + 30)

      await tx.subscription.upsert({
        where: { organizationId: payment.organizationId },
        update: {
          plan: payment.requestedPlan,
          status: "ACTIVE",
          amountFcfa: PLAN_DEFINITIONS[payment.requestedPlan].monthlyPriceFcfa,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          trialEndsAt: null,
          aiCreditsTotal: UNLIMITED_AI,
          aiCreditsUsed: 0,
          canceledAt: null,
        },
        create: {
          organizationId: payment.organizationId,
          plan: payment.requestedPlan,
          status: "ACTIVE",
          amountFcfa: payment.amountFcfa,
          startedAt: now,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          trialEndsAt: null,
          aiCreditsTotal: UNLIMITED_AI,
          aiCreditsUsed: 0,
        },
      })
    }

    return updatedTransaction
  })
}

export async function failPaymentTransaction(input: {
  transactionId: string
  providerStatus?: string | null
  providerPayload?: unknown
}) {
  return prisma.paymentTransaction.update({
    where: { id: input.transactionId },
    data: {
      status: PaymentTransactionStatus.FAILED,
      providerStatus: input.providerStatus ?? undefined,
      providerPayload: input.providerPayload ?? undefined,
      failedAt: new Date(),
    },
  })
}
