import { adminUpdateOrganizationSubscription } from "@/src/actions/subscriptions"
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
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const requestId = getRequestId(request.headers)
  try {
    if (!isTrustedMutationOrigin(request)) {
      logger.warn("admin.subscriptions.untrusted_origin", { requestId })
      return apiError("Origine de requete non autorisee.", {
        status: 403,
        code: "UNTRUSTED_ORIGIN",
      })
    }

    const { organizationId } = await params
    const rateLimit = applyRateLimit({
      key: `admin-subscription:${organizationId}:${getClientIpFromHeaders(request.headers)}`,
      limit: 10,
      windowMs: 60_000,
    })

    if (!rateLimit.allowed) {
      logger.warn("admin.subscriptions.rate_limited", {
        requestId,
        organizationId,
      })
      return apiError("Trop de modifications d'abonnement. Reessayez dans un instant.", {
        status: 429,
        code: "RATE_LIMITED",
        headers: createRateLimitHeaders(rateLimit, 10),
      })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch (error) {
      logger.warn("admin.subscriptions.invalid_json", {
        requestId,
        organizationId,
        error,
      })
      return apiError("Corps JSON invalide.", {
        status: 400,
        code: "INVALID_JSON",
      })
    }

    const result = await adminUpdateOrganizationSubscription(
      {
        ...(typeof body === "object" && body !== null ? body : {}),
        organizationId,
      },
      getRequestAuditContext(request.headers),
    )

    logger.info("admin.subscriptions.completed", {
      requestId,
      organizationId,
      success: result.success,
      code: result.success ? undefined : result.code,
    })

    return apiFromActionResult(result)
  } catch (error) {
    logger.error("admin.subscriptions.failed", {
      requestId,
      error,
    })
    return apiError("Erreur lors de la mise a jour de l abonnement.", {
      status: 500,
      code: "ADMIN_SUBSCRIPTION_UPDATE_FAILED",
    })
  }
}
