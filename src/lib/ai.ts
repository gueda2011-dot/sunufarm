import { createHash } from "node:crypto"
import { z } from "zod"
import prisma from "@/src/lib/prisma"
import { getBatchOperationalSnapshot } from "@/src/lib/batch-metrics"
import { getServerEnv } from "@/src/lib/env"
import type { OrganizationSubscriptionSummary } from "@/src/lib/subscriptions.server"
import { hasPlanFeature } from "@/src/lib/subscriptions"

const ANALYSIS_MODELS = {
  openai: {
    standard: "gpt-5.4-mini",
    advanced: "gpt-5.4-mini",
    parser: "gpt-5.4-nano",
  },
  anthropic: {
    standard: "claude-sonnet-4-20250514",
    advanced: "claude-sonnet-4-20250514",
    parser: "claude-3-5-haiku-latest",
  },
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
  benchmark: z.object({
    sampleSize: z.number().int().nonnegative(),
    avgMortalityRatePct: z.number().nullable(),
    avgMarginRate: z.number().nullable(),
    avgCostPerBird: z.number().nullable(),
    bestMarginRate: z.number().nullable(),
    worstMortalityRatePct: z.number().nullable(),
  }).nullable(),
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
  comparisonInsights: z.array(z.string().min(1).max(320)).max(4).default([]),
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

type AIProvider = "openai" | "anthropic"

function getConfiguredAIProvider(): AIProvider | null {
  const env = getServerEnv()
  if (env.ANTHROPIC_API_KEY) return "anthropic"
  if (env.OPENAI_API_KEY) return "openai"
  return null
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

export interface StoredBatchAnalysisItem {
  id: string
  createdAt: Date
  accessTier: AIAccessTier
  model: string
  analysis: AIBatchAnalysisResult
}

export function getAIPolicy(subscription: OrganizationSubscriptionSummary): AIPolicy {
  const provider = getConfiguredAIProvider()
  const providerModels = provider === "anthropic"
    ? ANALYSIS_MODELS.anthropic
    : ANALYSIS_MODELS.openai

  if (subscription.isTrialActive) {
    return {
      enabled: true,
      tier: "trial",
      model: providerModels.standard,
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
      model: providerModels.standard,
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
      model: providerModels.advanced,
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
    model: providerModels.standard,
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
  options?: { includeBenchmark?: boolean },
): Promise<BatchAnalysisInput | null> {
  const [batch, profitability, mortalityAgg, expenses, records, comparableBatches] = await Promise.all([
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
    options?.includeBenchmark
      ? prisma.batch.findMany({
          where: {
            organizationId,
            id: { not: batchId },
            deletedAt: null,
          },
          orderBy: { entryDate: "desc" },
          take: 8,
          select: {
            id: true,
            type: true,
            entryCount: true,
            totalCostFcfa: true,
            saleItems: {
              select: {
                totalFcfa: true,
              },
            },
            expenses: {
              select: {
                amountFcfa: true,
              },
            },
            dailyRecords: {
              select: {
                mortality: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ])

  if (!batch) return null

  const totalMortality = mortalityAgg._sum.mortality ?? 0
  const totalFeedKg = mortalityAgg._sum.feedKg ?? 0
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
  const snapshot = getBatchOperationalSnapshot({
    entryDate: batch.entryDate,
    entryAgeDay: batch.entryAgeDay,
    entryCount: batch.entryCount,
    status: batch.status,
    totalMortality,
  })

  const benchmarkSource = options?.includeBenchmark
    ? comparableBatches
        .filter((candidate) => candidate.type === batch.type)
        .map((candidate) => {
          const candidateMortality = candidate.dailyRecords.reduce((sum, record) => (
            sum + record.mortality
          ), 0)
          const candidateOperationalCost = candidate.expenses.reduce((sum, expense) => (
            sum + expense.amountFcfa
          ), 0)
          const candidateRevenue = candidate.saleItems.reduce((sum, saleItem) => (
            sum + saleItem.totalFcfa
          ), 0)
          const candidateTotalCost = candidate.totalCostFcfa + candidateOperationalCost
          const candidateProfit = candidateRevenue - candidateTotalCost

          return {
            mortalityRatePct: candidate.entryCount > 0
              ? Math.round((candidateMortality / candidate.entryCount) * 1000) / 10
              : null,
            marginRate: candidateTotalCost > 0
              ? Math.round((candidateProfit / candidateTotalCost) * 1000) / 10
              : null,
            costPerBird: candidate.entryCount > 0
              ? Math.round(candidateTotalCost / candidate.entryCount)
              : null,
          }
        })
        .filter((candidate) => (
          candidate.mortalityRatePct !== null ||
          candidate.marginRate !== null ||
          candidate.costPerBird !== null
        ))
    : []

  const benchmark = benchmarkSource.length > 0
    ? {
        sampleSize: benchmarkSource.length,
        avgMortalityRatePct: averageNullable(benchmarkSource.map((item) => item.mortalityRatePct)),
        avgMarginRate: averageNullable(benchmarkSource.map((item) => item.marginRate)),
        avgCostPerBird: averageNullable(benchmarkSource.map((item) => item.costPerBird)),
        bestMarginRate: maxNullable(benchmarkSource.map((item) => item.marginRate)),
        worstMortalityRatePct: maxNullable(benchmarkSource.map((item) => item.mortalityRatePct)),
      }
    : null

  return analyzeBatchDataSchema.parse({
    batchId: batch.id,
    batchNumber: batch.number,
    batchType: batch.type,
    batchStatus: batch.status,
    entryDate: new Date(batch.entryDate).toISOString(),
    ageDay: snapshot.ageDay,
    entryCount: batch.entryCount,
    liveCount: snapshot.liveCount,
    totalMortality: snapshot.totalMortality,
    mortalityRatePct: snapshot.mortalityRatePct,
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
    benchmark,
  })
}

function averageNullable(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null)
  if (filtered.length === 0) return null

  return Math.round((filtered.reduce((sum, value) => sum + value, 0) / filtered.length) * 10) / 10
}

function maxNullable(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null)
  if (filtered.length === 0) return null
  return Math.max(...filtered)
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

export async function listStoredBatchAnalyses(
  organizationId: string,
  batchId: string,
  limit = 5,
): Promise<StoredBatchAnalysisItem[]> {
  const analyses = await prisma.aIBatchAnalysis.findMany({
    where: {
      organizationId,
      batchId,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      accessTier: true,
      model: true,
      responseJson: true,
    },
  })

  return analyses.flatMap((item) => {
    const parsed = aiBatchAnalysisResponseSchema.safeParse(item.responseJson)
    if (!parsed.success) return []

    return [{
      id: item.id,
      createdAt: item.createdAt,
      accessTier: item.accessTier as AIAccessTier,
      model: item.model,
      analysis: parsed.data,
    }]
  })
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

function extractAnthropicText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const data = payload as {
    content?: Array<{ type?: string; text?: string }>
  }

  return data.content
    ?.find((item) => item.type === "text" && typeof item.text === "string" && item.text.trim().length > 0)
    ?.text ?? null
}

async function generateBatchAnalysisWithAnthropic(
  input: BatchAnalysisInput,
  policy: AIPolicy,
): Promise<AIBatchAnalysisResult> {
  const apiKey = getServerEnv().ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY manquant")
  }

  const recommendationDepth = policy.advanced ? "avance" : "standard"
  const prompt = JSON.stringify({
    tier: policy.tier,
    recommendationDepth,
    maxRecommendations: policy.maxRecommendations,
    batch: input,
  })

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: policy.model,
      max_tokens: 1600,
      system:
        "Tu es le moteur d'analyse avicole de SunuFarm. Reponds uniquement en JSON valide. " +
        "Concentre-toi sur la rentabilite, les risques, et les actions concretes. " +
        "Pas de texte hors JSON. Si un benchmark interne est present, utilise-le explicitement. " +
        "Si aucun benchmark n'est present, renvoie comparisonInsights comme tableau vide.",
      messages: [
        {
          role: "user",
          content:
            "Retourne un JSON strict avec les champs summary, keyRisks, profitabilityInsights, comparisonInsights et recommendations. " +
            "N'ajoute aucun markdown.\n" + prompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic error ${response.status}`)
  }

  const payload = await response.json()
  const rawText = extractAnthropicText(payload)
  if (!rawText) {
    throw new Error("Reponse Anthropic vide")
  }

  return aiBatchAnalysisResponseSchema.parse(JSON.parse(rawText))
}

export async function generateBatchAnalysisWithOpenAI(
  input: BatchAnalysisInput,
  policy: AIPolicy,
): Promise<AIBatchAnalysisResult> {
  const provider = getConfiguredAIProvider()
  if (provider === "anthropic") {
    return generateBatchAnalysisWithAnthropic(input, policy)
  }

  const apiKey = getServerEnv().OPENAI_API_KEY
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
                "Tu es le moteur d'analyse avicole de SunuFarm. Reponds uniquement en JSON valide. Concentre-toi sur la rentabilite, les risques, et les actions concretes. Pas de chatbot, pas de texte hors JSON. Si un benchmark interne est present, utilise-le explicitement pour comparer le lot a des lots similaires de la meme exploitation. Si aucun benchmark n'est present, renvoie comparisonInsights comme tableau vide.",
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
            required: ["summary", "keyRisks", "profitabilityInsights", "comparisonInsights", "recommendations"],
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
              comparisonInsights: {
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
