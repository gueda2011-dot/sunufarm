import { type NextRequest } from "next/server"
import { auth } from "@/src/auth"
import { requireMembership } from "@/src/lib/auth"
import { apiError, apiSuccess } from "@/src/lib/api-response"
import {
  applyRateLimit,
  createRateLimitHeaders,
  getClientIpFromHeaders,
} from "@/src/lib/rate-limit"
import { isTrustedMutationOrigin } from "@/src/lib/request-security"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { hasModuleAccess } from "@/src/lib/permissions"
import {
  analyzeBatchRequestSchema,
  assertAIAccess,
  buildBatchAnalysisInput,
  findCachedBatchAnalysis,
  generateBatchAnalysisWithOpenAI,
  getAIPolicy,
  getBatchAnalysisUsage,
  hashBatchAnalysisInput,
  storeBatchAnalysis,
} from "@/src/lib/ai"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    if (!isTrustedMutationOrigin(request)) {
      return apiError("Origine de requete non autorisee.", {
        status: 403,
        code: "UNTRUSTED_ORIGIN",
      })
    }

    const session = await auth()
    if (!session?.user?.id) {
      return apiError("Non authentifie", { status: 401, code: "UNAUTHENTICATED" })
    }

    const body = await request.json()
    const parsed = analyzeBatchRequestSchema.safeParse(body)
    if (!parsed.success) {
      return apiError("Donnees invalides", { status: 400, code: "INVALID_INPUT" })
    }

    const { organizationId, batchId, batchData } = parsed.data
    const rateLimit = applyRateLimit({
      key: `ai:${session.user.id}:${organizationId}:${getClientIpFromHeaders(request.headers)}`,
      limit: 10,
      windowMs: 60_000,
    })

    if (!rateLimit.allowed) {
      return apiError("Trop de requetes AI. Reessayez dans un instant.", {
        status: 429,
        code: "RATE_LIMITED",
        headers: createRateLimitHeaders(rateLimit, 10),
      })
    }

    const membershipResult = await requireMembership(session.user.id, organizationId)
    if (!membershipResult.success) {
      return apiError(membershipResult.error, {
        status: membershipResult.status,
        code: membershipResult.code,
      })
    }

    if (!hasModuleAccess(membershipResult.data.role, membershipResult.data.modulePermissions, "BATCHES")) {
      return apiError("Acces refuse au module BATCHES.", {
        status: 403,
        code: "MODULE_ACCESS_DENIED",
      })
    }

    const subscription = await getOrganizationSubscription(organizationId)
    const policy = getAIPolicy(subscription)
    const input = batchData ?? (batchId
      ? await buildBatchAnalysisInput(organizationId, batchId, {
          includeBenchmark: policy.advanced,
        })
      : null)

    if (!input) {
      return apiError("Lot introuvable", { status: 404, code: "BATCH_NOT_FOUND" })
    }

    const usage = await getBatchAnalysisUsage(organizationId, session.user.id, policy)
    const accessError = assertAIAccess(policy, usage)
    if (accessError) {
      return apiError(accessError, { status: 403, code: "AI_ACCESS_DENIED" })
    }

    if (policy.tier === "none") {
      return apiError("L'analyse intelligente des lots est disponible a partir du plan Pro.", {
        status: 403,
        code: "PLAN_UPGRADE_REQUIRED",
      })
    }

    const inputHash = hashBatchAnalysisInput(input, policy.tier)
    const cached = await findCachedBatchAnalysis(organizationId, inputHash, policy.tier)

    if (cached) {
      return apiSuccess({
          analysis: cached,
          cached: true,
          tier: policy.tier,
          model: policy.model,
          usage,
      }, { headers: createRateLimitHeaders(rateLimit, 10) })
    }

    const analysis = await generateBatchAnalysisWithOpenAI(input, policy)

    await storeBatchAnalysis({
      organizationId,
      batchId: input.batchId,
      userId: session.user.id,
      inputHash,
      policy,
      analysis,
    })

    const refreshedUsage = await getBatchAnalysisUsage(organizationId, session.user.id, policy)

    return apiSuccess({
        analysis,
        cached: false,
        tier: policy.tier,
        model: policy.model,
        usage: refreshedUsage,
    }, { headers: createRateLimitHeaders(rateLimit, 10) })
  } catch (error) {
    console.error("[AI][analyze]", error)
    return apiError("Impossible de lancer l'analyse AI du lot.", {
      status: 500,
      code: "AI_ANALYSIS_FAILED",
    })
  }
}
