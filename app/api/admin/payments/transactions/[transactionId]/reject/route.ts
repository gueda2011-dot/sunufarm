import { adminRejectPaymentTransaction } from "@/src/actions/subscriptions"
import { apiError, apiFromActionResult } from "@/src/lib/api-response"
import {
  applyRateLimit,
  createRateLimitHeaders,
  getClientIpFromHeaders,
} from "@/src/lib/rate-limit"
import { getRequestAuditContext, isTrustedMutationOrigin } from "@/src/lib/request-security"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  if (!isTrustedMutationOrigin(request)) {
    return apiError("Origine de requete non autorisee.", {
      status: 403,
      code: "UNTRUSTED_ORIGIN",
    })
  }

  const { transactionId } = await params
  const rateLimit = applyRateLimit({
    key: `admin-payment-reject:${transactionId}:${getClientIpFromHeaders(request.headers)}`,
    limit: 10,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
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

  return apiFromActionResult(result)
}
