import { adminConfirmPaymentTransaction } from "@/src/actions/subscriptions"
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
      logger.warn("admin.payments.confirm.untrusted_origin", { requestId })
      return apiError("Origine de requete non autorisee.", {
        status: 403,
        code: "UNTRUSTED_ORIGIN",
      })
    }

    const { transactionId } = await params
    const rateLimit = await applyRateLimit({
      key: `admin-payment-confirm:${transactionId}:${getClientIpFromHeaders(request.headers)}`,
      limit: 10,
      windowMs: 60_000,
    })

    if (!rateLimit.allowed) {
      logger.warn("admin.payments.confirm.rate_limited", {
        requestId,
        transactionId,
      })
      return apiError("Trop de tentatives de confirmation. Reessayez dans un instant.", {
        status: 429,
        code: "RATE_LIMITED",
        headers: createRateLimitHeaders(rateLimit, 10),
      })
    }

    const result = await adminConfirmPaymentTransaction(
      { transactionId },
      getRequestAuditContext(request.headers),
    )

    logger.info("admin.payments.confirm.completed", {
      requestId,
      transactionId,
      success: result.success,
      code: result.success ? undefined : result.code,
    })

    return apiFromActionResult(result)
  } catch (error) {
    logger.error("admin.payments.confirm.failed", {
      requestId,
      error,
    })
    return apiError("Erreur lors de la confirmation admin.", {
      status: 500,
      code: "ADMIN_PAYMENT_CONFIRM_FAILED",
    })
  }
}
