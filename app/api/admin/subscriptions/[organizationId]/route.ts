import { adminUpdateOrganizationSubscription } from "@/src/actions/subscriptions"
import { apiError, apiFromActionResult } from "@/src/lib/api-response"
import {
  applyRateLimit,
  createRateLimitHeaders,
  getClientIpFromHeaders,
} from "@/src/lib/rate-limit"
import { getRequestAuditContext, isTrustedMutationOrigin } from "@/src/lib/request-security"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  if (!isTrustedMutationOrigin(request)) {
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
    return apiError("Trop de modifications d'abonnement. Reessayez dans un instant.", {
      status: 429,
      code: "RATE_LIMITED",
      headers: createRateLimitHeaders(rateLimit, 10),
    })
  }

  const body = await request.json()

  const result = await adminUpdateOrganizationSubscription(
    {
      ...body,
      organizationId,
    },
    getRequestAuditContext(request.headers),
  )

  return apiFromActionResult(result)
}
