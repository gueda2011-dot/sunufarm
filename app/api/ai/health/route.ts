import { type NextRequest } from "next/server"
import { auth } from "@/src/auth"
import { requireMembership } from "@/src/lib/auth"
import { apiError, apiSuccess } from "@/src/lib/api-response"
import {
  applyRateLimit,
  createRateLimitHeaders,
  getClientIpFromHeaders,
} from "@/src/lib/rate-limit"
import { logger } from "@/src/lib/logger"
import { getRequestId, isTrustedMutationOrigin } from "@/src/lib/request-security"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { hasModuleAccess } from "@/src/lib/permissions"
import { z } from "zod"
import { getAIPolicy } from "@/src/lib/ai"
import {
  buildHealthOverviewInput,
  generateHealthOverviewWithOpenAI,
} from "@/src/lib/ai-health"

export const dynamic = "force-dynamic"

const requestSchema = z.object({
  organizationId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers)

  try {
    if (!isTrustedMutationOrigin(request)) {
      logger.warn("ai.health.untrusted_origin", { requestId })
      return apiError("Origine de requete non autorisee.", {
        status: 403,
        code: "UNTRUSTED_ORIGIN",
      })
    }

    const session = await auth()
    if (!session?.user?.id) {
      logger.warn("ai.health.unauthenticated", { requestId })
      return apiError("Non authentifie", { status: 401, code: "UNAUTHENTICATED" })
    }

    const body = await request.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return apiError("Donnees invalides", { status: 400, code: "INVALID_INPUT" })
    }

    const { organizationId } = parsed.data
    const rateLimit = applyRateLimit({
      key: `ai-health:${session.user.id}:${organizationId}:${getClientIpFromHeaders(request.headers)}`,
      limit: 5,
      windowMs: 60_000,
    })

    if (!rateLimit.allowed) {
      return apiError("Trop de requetes AI. Reessayez dans un instant.", {
        status: 429,
        code: "RATE_LIMITED",
        headers: createRateLimitHeaders(rateLimit, 5),
      })
    }

    const membershipResult = await requireMembership(session.user.id, organizationId)
    if (!membershipResult.success) {
      return apiError(membershipResult.error, {
        status: membershipResult.status,
        code: membershipResult.code,
      })
    }

    if (!hasModuleAccess(membershipResult.data.role, membershipResult.data.modulePermissions, "HEALTH")) {
      return apiError("Acces refuse au module HEALTH.", {
        status: 403,
        code: "MODULE_ACCESS_DENIED",
      })
    }

    const subscription = await getOrganizationSubscription(organizationId)
    const policy = getAIPolicy(subscription)
    if (!policy.enabled || policy.tier === "none") {
      return apiError("L'analyse sanitaire intelligente est disponible a partir du plan Pro.", {
        status: 403,
        code: "AI_ACCESS_DENIED",
      })
    }

    const input = await buildHealthOverviewInput(organizationId, 7)
    const analysis = await generateHealthOverviewWithOpenAI(input, policy.model)

    logger.info("ai.health.completed", {
      requestId,
      userId: session.user.id,
      organizationId,
      tier: policy.tier,
    })

    return apiSuccess({
      analysis,
      model: policy.model,
      lookbackDays: input.lookbackDays,
    }, { headers: createRateLimitHeaders(rateLimit, 5) })
  } catch (error) {
    logger.error("ai.health.failed", { requestId, error })
    return apiError("Impossible de lancer l'analyse IA sante.", {
      status: 500,
      code: "AI_HEALTH_FAILED",
    })
  }
}
