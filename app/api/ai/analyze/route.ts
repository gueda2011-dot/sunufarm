import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/src/auth"
import { requireMembership } from "@/src/lib/auth"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
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
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Non authentifie" }, { status: 401 })
    }

    const body = await request.json()
    const parsed = analyzeBatchRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Donnees invalides" }, { status: 400 })
    }

    const { organizationId, batchId, batchData } = parsed.data
    const membershipResult = await requireMembership(session.user.id, organizationId)
    if (!membershipResult.success) {
      return NextResponse.json({ success: false, error: membershipResult.error }, { status: 403 })
    }

    const subscription = await getOrganizationSubscription(organizationId)
    const policy = getAIPolicy(subscription)
    const input = batchData ?? (batchId
      ? await buildBatchAnalysisInput(organizationId, batchId, {
          includeBenchmark: policy.advanced,
        })
      : null)

    if (!input) {
      return NextResponse.json({ success: false, error: "Lot introuvable" }, { status: 404 })
    }

    const usage = await getBatchAnalysisUsage(organizationId, session.user.id, policy)
    const accessError = assertAIAccess(policy, usage)
    if (accessError) {
      return NextResponse.json({ success: false, error: accessError }, { status: 403 })
    }

    if (policy.tier === "none") {
      return NextResponse.json(
        { success: false, error: "L'analyse intelligente des lots est disponible a partir du plan Pro." },
        { status: 403 },
      )
    }

    const inputHash = hashBatchAnalysisInput(input, policy.tier)
    const cached = await findCachedBatchAnalysis(organizationId, inputHash, policy.tier)

    if (cached) {
      return NextResponse.json({
        success: true,
        data: {
          analysis: cached,
          cached: true,
          tier: policy.tier,
          model: policy.model,
          usage,
        },
      })
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

    return NextResponse.json({
      success: true,
      data: {
        analysis,
        cached: false,
        tier: policy.tier,
        model: policy.model,
        usage: refreshedUsage,
      },
    })
  } catch (error) {
    console.error("[AI][analyze]", error)
    return NextResponse.json(
      { success: false, error: "Impossible de lancer l'analyse AI du lot." },
      { status: 500 },
    )
  }
}
