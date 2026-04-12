import { adminRejectPaymentTransaction } from "@/src/actions/subscriptions"
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
  { params }: { params: Promise<{ transactionId: string }> },
) {
  const requestId = getRequestId(request.headers)
  try {
    if (!isTrustedMutationOrigin(request)) {
      logger.warn("admin.payments.reject.untrusted_origin", { requestId })
      return apiError("Origine de requete non autorisee.", {
        status: 403,
        code: "UNTRUSTED_ORIGIN",
      })
    }

    const { transactionId } = await params
    const rateLimit = await applyRateLimit({
      key: `admin-payment-reject:${transactionId}:${getClientIpFromHeaders(request.headers)}`,
      limit: 10,
      windowMs: 60_000,
    })

    if (!rateLimit.allowed) {
      logger.warn("admin.payments.reject.rate_limited", {
        requestId,
        transactionId,
      })
      return apiError("Trop de tentatives de rejet. Reessayez dans un instant.", {
        status: 429,
        code: "RATE_LIMITED",
        headers: createRateLimitHeaders(rateLimit, 10),
      })
    }

    const result = await adminRejectPaymentTransaction(
      { transactionId },
      getRequestAuditContext(request.headers),
    )

    logger.info("admin.payments.reject.completed", {
      requestId,
      transactionId,
      success: result.success,
      code: result.success ? undefined : result.code,
    })

    return apiFromActionResult(result)
  } catch (error) {
    logger.error("admin.payments.reject.failed", {
      requestId,
      error,
    })
    return apiError("Erreur lors du rejet admin.", {
      status: 500,
      code: "ADMIN_PAYMENT_REJECT_FAILED",
    })
  }
}
