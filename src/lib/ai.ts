import { createHash } from "node:crypto"
import { z } from "zod"
import prisma from "@/src/lib/prisma"
import type { OrganizationSubscriptionSummary } from "@/src/lib/subscriptions.server"
import { hasPlanFeature } from "@/src/lib/subscriptions"

const ANALYSIS_MODELS = {
  standard: "gpt-5.4-mini",
  advanced: "gpt-5.4-mini",
  parser: "gpt-5.4-nano",
} as const

const analyzeBatchDataSchema = z.object({
  batchId: z.string(),
  batchNumber: z.string(),
  batchType: z.string(),
  batchStatus: z.string(),
  entryDate: z.string(),
  ageDay: z.number().int().nonnegative(),
  entryCount: z.number().int().nonnegative(),
  liveCount: z.number().int().nonnegative(),
  totalMortality: z.number().int().nonnegative(),
  mortalityRatePct: z.number().nonnegative(),
  totalFeedKg: z.number().nonnegative(),
  totalFeedCostFcfa: z.number().int().nonnegative(),
  operationalCostFcfa: z.number().int().nonnegative(),
  purchaseCostFcfa: z.number().int().nonnegative(),
  totalCostFcfa: z.number().int().nonnegative(),
  revenueFcfa: z.number().int().nonnegative(),
  profitFcfa: z.number().int(),
  marginRate: z.number().nullable(),
  costPerBird: z.number().nullable(),
  saleItemsCount: z.number().int().nonnegative(),
  farmName: z.string(),
  buildingName: z.string(),
  latestRecords: z.array(z.object({
    date: z.string(),
    mortality: z.number().int().nonnegative(),
    feedKg: z.number().nonnegative(),
    waterLiters: z.number().nullable(),
  })).max(14),
})

export type BatchAnalysisInput = z.infer<typeof analyzeBatchDataSchema>

const aiBatchAnalysisResponseSchema = z.object({
  summary: z.string().min(1).max(800),
  keyRisks: z.array(z.object({
    title: z.string().min(1).max(140),
    severity: z.enum(["low", "medium", "high"]),
    reason: z.string().min(1).max(300),
  })).max(5),
  profitabilityInsights: z.array(z.string().min(1).max(300)).max(5),
  recommendations: z.array(z.object({
    action: z.string().min(1).max(160),
    priority: z.enum(["immediate", "soon", "monitor"]),
    why: z.string().min(1).max(320),
  })).max(6),
})

export type AIBatchAnalysisResult = z.infer<typeof aiBatchAnalysisResponseSchema>

export const analyzeBatchRequestSchema = z.object({
  organizationId: z.string().min(1),
  batchId: z.string().min(1).optional(),
  batchData: analyzeBatchDataSchema.optional(),
}).refine((value) => value.batchId || value.batchData, {
  message: "batchId ou batchData est requis",
  path: ["batchId"],
})

type AIAccessTier = "trial" | "pro" | "business"

interface AIPolicy {
  enabled: boolean
  tier: AIAccessTier | "none"
  model: string
  dailyLimit: number
  monthlyLimit: number
  totalTrialLimit: number
  maxRecommendations: number
  advanced: boolean
  priorityProcessing: boolean
}

export interface AIBatchUsage {
  dailyUsed: number
  dailyLimit: number
  monthlyUsed: number
  monthlyLimit: number
  totalTrialUsed: number
  totalTrialLimit: number
}

export interface AIBatchAnalysisEnvelope {
  analysis: AIBatchAnalysisResult
  cached: boolean
  tier: AIAccessTier
  model: string
  usage: AIBatchUsage
}

export function getAIPolicy(subscription: OrganizationSubscriptionSummary): AIPolicy {
  if (subscription.isTrialActive) {
    return {
      enabled: true,
      tier: "trial",
      model: ANALYSIS_MODELS.standard,
      dailyLimit: 3,
      monthlyLimit: 3,
      totalTrialLimit: 3,
      maxRecommendations: 3,
      advanced: false,
      priorityProcessing: false,
    }
  }

  if (!hasPlanFeature(subscription.rawPlan, "AI_BATCH_ANALYSIS")) {
    return {
      enabled: false,
      tier: "none",
      model: ANALYSIS_MODELS.standard,
      dailyLimit: 0,
      monthlyLimit: 0,
      totalTrialLimit: 0,
      maxRecommendations: 0,
      advanced: false,
      priorityProcessing: false,
    }
  }

  if (subscription.rawPlan === "BUSINESS" && subscription.status === "ACTIVE") {
    return {
      enabled: true,
      tier: "business",
      model: ANALYSIS_MODELS.advanced,
      dailyLimit: 20,
      monthlyLimit: 400,
      totalTrialLimit: 0,
      maxRecommendations: 6,
      advanced: true,
      priorityProcessing: true,
    }
  }

  return {
    enabled: true,
    tier: "pro",
    model: ANALYSIS_MODELS.standard,
    dailyLimit: 5,
    monthlyLimit: 100,
    totalTrialLimit: 0,
    maxRecommendations: 4,
    advanced: false,
    priorityProcessing: false,
  }
}

export async function buildBatchAnalysisInput(
  organizationId: string,
  batchId: string,
): Promise<BatchAnalysisInput | null> {
  const [batch, profitability, mortalityAgg, expenses, records] = await Promise.all([
    prisma.batch.findFirst({
      where: { id: batchId, organizationId, deletedAt: null },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        entryDate: true,
        entryCount: true,
        entryAgeDay: true,
        totalCostFcfa: true,
        building: {
          select: {
            name: true,
            farm: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.saleItem.aggregate({
      where: {
        batchId,
        sale: { organizationId },
      },
      _sum: { totalFcfa: true },
      _count: { id: true },
    }),
    prisma.dailyRecord.aggregate({
      where: { batchId, organizationId },
      _sum: {
        mortality: true,
        feedKg: true,
      },
    }),
    prisma.expense.aggregate({
      where: { batchId, organizationId },
      _sum: { amountFcfa: true },
    }),
    prisma.dailyRecord.findMany({
      where: { batchId, organizationId },
      orderBy: { date: "desc" },
      take: 7,
      select: {
        date: true,
        mortality: true,
        feedKg: true,
        waterLiters: true,
      },
    }),
  ])

  if (!batch) return null

  const totalMortality = mortalityAgg._sum.mortality ?? 0
  const totalFeedKg = mortalityAgg._sum.feedKg ?? 0
  const liveCount = Math.max(0, batch.entryCount - totalMortality)
  const operationalCostFcfa = expenses._sum.amountFcfa ?? 0
  const purchaseCostFcfa = batch.totalCostFcfa
  const totalCostFcfa = purchaseCostFcfa + operationalCostFcfa
  const revenueFcfa = profitability._sum.totalFcfa ?? 0
  const profitFcfa = revenueFcfa - totalCostFcfa
  const marginRate = totalCostFcfa > 0
    ? Math.round((profitFcfa / totalCostFcfa) * 1000) / 10
    : null
  const costPerBird = batch.entryCount > 0
    ? Math.round(totalCostFcfa / batch.entryCount)
    : null
  const mortalityRatePct = batch.entryCount > 0
    ? Math.round((totalMortality / batch.entryCount) * 1000) / 10
    : 0

  const endDate = batch.status === "ACTIVE"
    ? new Date()
    : new Date()
  const ageDay = batch.entryAgeDay + Math.max(
    0,
    Math.floor((endDate.getTime() - new Date(batch.entryDate).getTime()) / 86_400_000),
  )

  return analyzeBatchDataSchema.parse({
    batchId: batch.id,
    batchNumber: batch.number,
    batchType: batch.type,
    batchStatus: batch.status,
    entryDate: new Date(batch.entryDate).toISOString(),
    ageDay,
    entryCount: batch.entryCount,
    liveCount,
    totalMortality,
    mortalityRatePct,
    totalFeedKg,
    totalFeedCostFcfa: operationalCostFcfa,
    operationalCostFcfa,
    purchaseCostFcfa,
    totalCostFcfa,
    revenueFcfa,
    profitFcfa,
    marginRate,
    costPerBird,
    saleItemsCount: profitability._count.id,
    farmName: batch.building.farm.name,
    buildingName: batch.building.name,
    latestRecords: records.map((record) => ({
      date: new Date(record.date).toISOString(),
      mortality: record.mortality,
      feedKg: record.feedKg,
      waterLiters: record.waterLiters ?? null,
    })),
  })
}

export function hashBatchAnalysisInput(input: BatchAnalysisInput, tier: AIAccessTier): string {
  return createHash("sha256")
    .update(JSON.stringify({ tier, input }))
    .digest("hex")
}

export async function getBatchAnalysisUsage(
  organizationId: string,
  userId: string,
  policy: AIPolicy,
): Promise<AIBatchUsage> {
  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setUTCHours(0, 0, 0, 0)

  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const [dailyUsed, monthlyUsed, totalTrialUsed] = await Promise.all([
    prisma.aIBatchAnalysis.count({
      where: {
        organizationId,
        createdById: userId,
        createdAt: { gte: startOfDay },
      },
    }),
    prisma.aIBatchAnalysis.count({
      where: {
        organizationId,
        createdById: userId,
        createdAt: { gte: startOfMonth },
      },
    }),
    prisma.aIBatchAnalysis.count({
      where: {
        organizationId,
        createdById: userId,
        accessTier: "trial",
      },
    }),
  ])

  return {
    dailyUsed,
    dailyLimit: policy.dailyLimit,
    monthlyUsed,
    monthlyLimit: policy.monthlyLimit,
    totalTrialUsed,
    totalTrialLimit: policy.totalTrialLimit,
  }
}

export function assertAIAccess(policy: AIPolicy, usage: AIBatchUsage): string | null {
  if (!policy.enabled || policy.tier === "none") {
    return "L'analyse intelligente des lots est disponible a partir du plan Pro."
  }

  if (usage.dailyUsed >= usage.dailyLimit) {
    return "Votre limite quotidienne d'analyses AI est atteinte."
  }

  if (usage.monthlyUsed >= usage.monthlyLimit) {
    return "Votre quota mensuel d'analyses AI est atteint."
  }

  if (policy.tier === "trial" && usage.totalTrialUsed >= usage.totalTrialLimit) {
    return "Les analyses offertes pendant l'essai ont deja ete utilisees. Passez au plan Pro pour continuer."
  }

  return null
}

export async function findCachedBatchAnalysis(
  organizationId: string,
  inputHash: string,
  tier: AIAccessTier,
): Promise<AIBatchAnalysisResult | null> {
  const cached = await prisma.aIBatchAnalysis.findFirst({
    where: {
      organizationId,
      inputHash,
      accessTier: tier,
    },
    orderBy: { createdAt: "desc" },
    select: {
      responseJson: true,
    },
  })

  if (!cached) return null

  const parsed = aiBatchAnalysisResponseSchema.safeParse(cached.responseJson)
  return parsed.success ? parsed.data : null
}

function extractResponseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const data = payload as {
    output_text?: string
    output?: Array<{ content?: Array<{ text?: string }> }>
  }

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text
  }

  const firstText = data.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)

  return firstText ?? null
}

export async function generateBatchAnalysisWithOpenAI(
  input: BatchAnalysisInput,
  policy: AIPolicy,
): Promise<AIBatchAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY manquant")
  }

  const recommendationDepth = policy.advanced ? "avance" : "standard"
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: policy.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Tu es le moteur d'analyse avicole de SunuFarm. Reponds uniquement en JSON valide. Concentre-toi sur la rentabilite, les risques, et les actions concretes. Pas de chatbot, pas de texte hors JSON.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                tier: policy.tier,
                recommendationDepth,
                maxRecommendations: policy.maxRecommendations,
                batch: input,
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "sunufarm_batch_analysis",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "keyRisks", "profitabilityInsights", "recommendations"],
            properties: {
              summary: { type: "string" },
              keyRisks: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "severity", "reason"],
                  properties: {
                    title: { type: "string" },
                    severity: { type: "string", enum: ["low", "medium", "high"] },
                    reason: { type: "string" },
                  },
                },
              },
              profitabilityInsights: {
                type: "array",
                items: { type: "string" },
              },
              recommendations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["action", "priority", "why"],
                  properties: {
                    action: { type: "string" },
                    priority: { type: "string", enum: ["immediate", "soon", "monitor"] },
                    why: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}`)
  }

  const payload = await response.json()
  const rawText = extractResponseText(payload)
  if (!rawText) {
    throw new Error("Reponse AI vide")
  }

  return aiBatchAnalysisResponseSchema.parse(JSON.parse(rawText))
}

export async function storeBatchAnalysis(params: {
  organizationId: string
  batchId: string
  userId: string
  inputHash: string
  policy: AIPolicy
  analysis: AIBatchAnalysisResult
}) {
  await prisma.aIBatchAnalysis.create({
    data: {
      organizationId: params.organizationId,
      batchId: params.batchId,
      createdById: params.userId,
      inputHash: params.inputHash,
      accessTier: params.policy.tier,
      model: params.policy.model,
      responseJson: params.analysis,
    },
  })
}
