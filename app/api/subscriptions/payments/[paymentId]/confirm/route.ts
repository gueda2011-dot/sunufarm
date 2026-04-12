import { confirmSubscriptionPayment } from "@/src/actions/subscriptions"
import { apiError, apiFromActionResult } from "@/src/lib/api-response"
import { logger } from "@/src/lib/logger"
import {
  applyRateLimit,
  createRateLimitHeaders,
  getClientIpFromHeaders,
} from "@/src/lib/rate-limit"
import { getRequestAuditContext, getRequestId, isTrustedMutationOrigin } from "@/src/lib/request-security"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const requestId = getRequestId(request.headers)
  try {
    if (!isTrustedMutationOrigin(request)) {
      logger.warn("subscriptions.payments.confirm.untrusted_origin", { requestId })
      return apiError("Origine de requete non autorisee.", {
        status: 403,
        code: "UNTRUSTED_ORIGIN",
      })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch (error) {
      logger.warn("subscriptions.payments.confirm.invalid_json", {
        requestId,
        error,
      })
      return apiError("Corps JSON invalide.", {
        status: 400,
        code: "INVALID_JSON",
      })
    }

    const { paymentId } = await params
    const organizationId =
      typeof body === "object" && body !== null && "organizationId" in body
        ? String((body as { organizationId?: unknown }).organizationId ?? "")
        : ""
    const rateLimit = await applyRateLimit({
      key: `subscription-payment-confirm:${paymentId}:${getClientIpFromHeaders(request.headers)}`,
      limit: 10,
      windowMs: 60_000,
    })

    if (!rateLimit.allowed) {
      logger.warn("subscriptions.payments.confirm.rate_limited", {
        requestId,
        paymentId,
        organizationId: organizationId || undefined,
      })
      return apiError("Trop de tentatives de confirmation. Reessayez dans un instant.", {
        status: 429,
        code: "RATE_LIMITED",
        headers: createRateLimitHeaders(rateLimit, 10),
      })
    }

    const result = await confirmSubscriptionPayment(
      {
        ...(typeof body === "object" && body !== null ? body : {}),
        paymentId,
      },
      getRequestAuditContext(request.headers),
    )

    logger.info("subscriptions.payments.confirm.completed", {
      requestId,
      paymentId,
      organizationId: organizationId || undefined,
      success: result.success,
      code: result.success ? undefined : result.code,
    })

    return apiFromActionResult(result, {
      headers: createRateLimitHeaders(rateLimit, 10),
    })
  } catch (error) {
    logger.error("subscriptions.payments.confirm.failed", {
      requestId,
      error,
    })
    return apiError("Erreur lors de la confirmation du paiement.", {
      status: 500,
      code: "SUBSCRIPTION_PAYMENT_CONFIRM_FAILED",
    })
  }
}
