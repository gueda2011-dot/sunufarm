import { createSubscriptionPaymentRequest } from "@/src/actions/subscriptions"
import { apiError, apiFromActionResult } from "@/src/lib/api-response"
import { logger } from "@/src/lib/logger"
import {
  applyRateLimit,
  createRateLimitHeaders,
  getClientIpFromHeaders,
} from "@/src/lib/rate-limit"
import { getRequestAuditContext, getRequestId, isTrustedMutationOrigin } from "@/src/lib/request-security"

export async function POST(request: Request) {
  const requestId = getRequestId(request.headers)
  try {
    if (!isTrustedMutationOrigin(request)) {
      logger.warn("subscriptions.payments.untrusted_origin", { requestId })
      return apiError("Origine de requete non autorisee.", {
        status: 403,
        code: "UNTRUSTED_ORIGIN",
      })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch (error) {
      logger.warn("subscriptions.payments.invalid_json", {
        requestId,
        error,
      })
      return apiError("Corps JSON invalide.", {
        status: 400,
        code: "INVALID_JSON",
      })
    }

    const organizationId =
      typeof body === "object" && body !== null && "organizationId" in body
        ? String((body as { organizationId?: unknown }).organizationId ?? "")
        : ""
    const rateLimit = applyRateLimit({
      key: `subscription-payment-request:${organizationId}:${getClientIpFromHeaders(request.headers)}`,
      limit: 5,
      windowMs: 60_000,
    })

    if (!rateLimit.allowed) {
      logger.warn("subscriptions.payments.rate_limited", {
        requestId,
        organizationId: organizationId || undefined,
      })
      return apiError("Trop de demandes de paiement. Reessayez dans un instant.", {
        status: 429,
        code: "RATE_LIMITED",
        headers: createRateLimitHeaders(rateLimit, 5),
      })
    }

    const result = await createSubscriptionPaymentRequest(
      body,
      getRequestAuditContext(request.headers),
    )

    logger.info("subscriptions.payments.completed", {
      requestId,
      organizationId: organizationId || undefined,
      success: result.success,
      code: result.success ? undefined : result.code,
    })

    return apiFromActionResult(result, {
      headers: createRateLimitHeaders(rateLimit, 5),
    })
  } catch (error) {
    logger.error("subscriptions.payments.failed", {
      requestId,
      error,
    })
    return apiError("Erreur lors de la creation de la demande de paiement.", {
      status: 500,
      code: "SUBSCRIPTION_PAYMENT_REQUEST_FAILED",
    })
  }
}
