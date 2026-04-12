import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import {
  PaymentProvider,
  PaymentTransactionStatus,
} from "@/src/generated/prisma/client"
import {
  applyRateLimit,
  createRateLimitHeaders,
  getClientIpFromHeaders,
} from "@/src/lib/rate-limit"
import {
  confirmPaymentTransaction,
  failPaymentTransaction,
  recordWebhookEvent,
  verifyWebhookSignature,
} from "@/src/lib/payments"
import { getServerEnv } from "@/src/lib/env"
import { logger } from "@/src/lib/logger"
import prisma from "@/src/lib/prisma"
import { getRequestId } from "@/src/lib/request-security"

const providerSchema = z.nativeEnum(PaymentProvider)

const webhookPayloadSchema = z.object({
  eventId: z.string().max(191).optional(),
  eventType: z.string().min(1).max(120),
  status: z.nativeEnum(PaymentTransactionStatus).optional(),
  transactionId: z.string().cuid().optional(),
  providerReference: z.string().max(191).optional(),
  providerTransactionId: z.string().max(191).optional(),
  data: z.unknown().optional(),
})

const waveWebhookSchema = z.object({
  id: z.string().max(191).optional(),
  type: z.string().min(1).max(120),
  data: z.object({
    id: z.string().max(191),
    client_reference: z.string().optional(),
    transaction_id: z.string().optional(),
    checkout_status: z.string().optional(),
    payment_status: z.string().optional(),
  }).passthrough(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const requestId = getRequestId(request.headers)
  const { provider: providerParam } = await params
  const providerParsed = providerSchema.safeParse(providerParam.toUpperCase())

  if (!providerParsed.success) {
    logger.warn("payments.webhook.unknown_provider", {
      requestId,
      providerParam,
    })
    return NextResponse.json({ success: false, error: "Provider inconnu" }, { status: 404 })
  }

  const rawBody = await request.text()
  const rateLimit = await applyRateLimit({
    key: `payment-webhook:${providerParsed.data}:${getClientIpFromHeaders(request.headers)}`,
    limit: 120,
    windowMs: 60_000,
  })
  if (!rateLimit.allowed) {
    logger.warn("payments.webhook.rate_limited", {
      requestId,
      provider: providerParsed.data,
    })
    return NextResponse.json(
      { success: false, error: "Trop de webhooks recus" },
      {
        status: 429,
        headers: createRateLimitHeaders(rateLimit, 120),
      },
    )
  }

  const signature = request.headers.get("x-payment-signature")
  const env = getServerEnv()
  const providerSecret =
    providerParsed.data === PaymentProvider.WAVE
      ? env.WAVE_WEBHOOK_SECRET
      : env.PAYMENT_WEBHOOK_SECRET

  const resolvedSignature =
    providerParsed.data === PaymentProvider.WAVE
      ? request.headers.get("wave-signature")
      : signature

  if (!verifyWebhookSignature({
    provider: providerParsed.data,
    payload: rawBody,
    signature: resolvedSignature,
    secret: providerSecret,
  })) {
    logger.warn("payments.webhook.invalid_signature", {
      requestId,
      provider: providerParsed.data,
    })
    await recordWebhookEvent({
      provider: providerParsed.data,
      eventType: "INVALID_SIGNATURE",
      signature: resolvedSignature,
      payload: { rawBody },
      processingError: "INVALID_SIGNATURE",
    })

    return NextResponse.json(
      { success: false, error: "Signature invalide" },
      { status: 401, headers: createRateLimitHeaders(rateLimit, 120) },
    )
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawBody)
  } catch {
    logger.warn("payments.webhook.invalid_json", {
      requestId,
      provider: providerParsed.data,
    })
    return NextResponse.json(
      { success: false, error: "Payload invalide" },
      { status: 400, headers: createRateLimitHeaders(rateLimit, 120) },
    )
  }

  const payloadParsed = webhookPayloadSchema.safeParse(parsedJson)
  const waveParsed =
    providerParsed.data === PaymentProvider.WAVE
      ? waveWebhookSchema.safeParse(parsedJson)
      : null

  if (
    (providerParsed.data !== PaymentProvider.WAVE && !payloadParsed.success) ||
    (providerParsed.data === PaymentProvider.WAVE && !waveParsed?.success)
  ) {
    logger.warn("payments.webhook.invalid_payload", {
      requestId,
      provider: providerParsed.data,
    })
    return NextResponse.json(
      { success: false, error: "Payload invalide" },
      { status: 400, headers: createRateLimitHeaders(rateLimit, 120) },
    )
  }

  if (providerParsed.data === PaymentProvider.WAVE && waveParsed?.success) {
    const payload = waveParsed.data
    const transactionId = payload.data.client_reference
    let resolvedTransactionId = transactionId ?? null

    if (!resolvedTransactionId) {
      const transaction = await prisma.paymentTransaction.findFirst({
        where: { providerReference: payload.data.id },
        select: { id: true },
      })
      resolvedTransactionId = transaction?.id ?? null
    }

    try {
      if (
        resolvedTransactionId &&
        (payload.type === "checkout.session.completed" || payload.data.payment_status === "succeeded")
      ) {
        await confirmPaymentTransaction({
          transactionId: resolvedTransactionId,
          providerReference: payload.data.id,
          providerTransactionId: payload.data.transaction_id ?? null,
          providerStatus: payload.data.payment_status ?? payload.data.checkout_status ?? payload.type,
          providerPayload: parsedJson,
        })
      } else if (
        resolvedTransactionId &&
        (
          payload.type === "checkout.session.expired" ||
          payload.data.payment_status === "failed" ||
          payload.data.checkout_status === "expired"
        )
      ) {
        await failPaymentTransaction({
          transactionId: resolvedTransactionId,
          status:
            payload.data.checkout_status === "expired"
              ? PaymentTransactionStatus.EXPIRED
              : PaymentTransactionStatus.FAILED,
          providerStatus: payload.data.payment_status ?? payload.data.checkout_status ?? payload.type,
          providerPayload: parsedJson,
        })
      }

      await recordWebhookEvent({
        paymentTransactionId: resolvedTransactionId,
        provider: providerParsed.data,
        eventType: payload.type,
        providerEventId: payload.id ?? null,
        signature: resolvedSignature,
        payload: parsedJson,
        processedAt: new Date(),
      })

      logger.info("payments.webhook.processed", {
        requestId,
        provider: providerParsed.data,
        transactionId: resolvedTransactionId,
        eventType: payload.type,
      })

      return NextResponse.json(
        { success: true },
        { headers: createRateLimitHeaders(rateLimit, 120) },
      )
    } catch (error) {
      logger.error("payments.webhook.processing_failed", {
        requestId,
        provider: providerParsed.data,
        transactionId: resolvedTransactionId,
        eventType: payload.type,
        error,
      })
      await recordWebhookEvent({
        paymentTransactionId: resolvedTransactionId,
        provider: providerParsed.data,
        eventType: payload.type,
        providerEventId: payload.id ?? null,
        signature: resolvedSignature,
        payload: parsedJson,
        processingError: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      })

      return NextResponse.json(
        { success: false, error: "Impossible de traiter le webhook" },
        { status: 500, headers: createRateLimitHeaders(rateLimit, 120) },
      )
    }
  }

  if (!payloadParsed.success) {
    return NextResponse.json({ success: false, error: "Payload invalide" }, { status: 400 })
  }

  const payload = payloadParsed.data

  try {
    if (payload.transactionId && payload.status === PaymentTransactionStatus.CONFIRMED) {
      await confirmPaymentTransaction({
        transactionId: payload.transactionId,
        providerReference: payload.providerReference ?? null,
        providerTransactionId: payload.providerTransactionId ?? null,
        providerStatus: payload.status,
        providerPayload: parsedJson,
      })
    } else if (
      payload.transactionId &&
      (
        payload.status === PaymentTransactionStatus.FAILED ||
        payload.status === PaymentTransactionStatus.CANCELED ||
        payload.status === PaymentTransactionStatus.EXPIRED
      )
    ) {
      await failPaymentTransaction({
        transactionId: payload.transactionId,
        status: payload.status,
        providerStatus: payload.status,
        providerPayload: parsedJson,
      })
    }

    await recordWebhookEvent({
      paymentTransactionId: payload.transactionId ?? null,
      provider: providerParsed.data,
      eventType: payload.eventType,
      providerEventId: payload.eventId ?? null,
      signature: resolvedSignature,
      payload: parsedJson,
      processedAt: new Date(),
    })

    logger.info("payments.webhook.processed", {
      requestId,
      provider: providerParsed.data,
      transactionId: payload.transactionId ?? null,
      eventType: payload.eventType,
    })

    return NextResponse.json(
      { success: true },
      { headers: createRateLimitHeaders(rateLimit, 120) },
    )
  } catch (error) {
    logger.error("payments.webhook.processing_failed", {
      requestId,
      provider: providerParsed.data,
      transactionId: payload.transactionId ?? null,
      eventType: payload.eventType,
      error,
    })
    await recordWebhookEvent({
      paymentTransactionId: payload.transactionId ?? null,
      provider: providerParsed.data,
      eventType: payload.eventType,
      providerEventId: payload.eventId ?? null,
      signature: resolvedSignature,
      payload: parsedJson,
      processingError: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    })

    return NextResponse.json(
      { success: false, error: "Impossible de traiter le webhook" },
      { status: 500, headers: createRateLimitHeaders(rateLimit, 120) },
    )
  }
}
