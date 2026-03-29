import { z } from "zod"
import prisma from "@/src/lib/prisma"
import { getServerEnv } from "@/src/lib/env"
import { getVaccinationSuggestions } from "@/src/lib/health-guidance"

const healthFocusBatchSchema = z.object({
  batchId: z.string(),
  batchNumber: z.string(),
  batchType: z.string(),
  ageDay: z.number().int().nonnegative(),
  entryCount: z.number().int().nonnegative(),
  recentMortality: z.number().int().nonnegative(),
  recentMortalityRatePct: z.number().nonnegative(),
  activeTreatments: z.number().int().nonnegative(),
  recentVaccinations: z.number().int().nonnegative(),
  overdueVaccines: z.number().int().nonnegative(),
  dueVaccines: z.number().int().nonnegative(),
  missingDailyRecords: z.boolean(),
  lastRecordDate: z.string().nullable(),
  signals: z.array(z.string()).max(6),
})

const healthOverviewInputSchema = z.object({
  generatedAt: z.string(),
  lookbackDays: z.number().int().positive(),
  activeBatchCount: z.number().int().nonnegative(),
  recentVaccinations: z.number().int().nonnegative(),
  activeTreatments: z.number().int().nonnegative(),
  overdueVaccinationBatches: z.number().int().nonnegative(),
  missingDailyRecordBatches: z.number().int().nonnegative(),
  focusBatches: z.array(healthFocusBatchSchema).max(8),
})

export type HealthOverviewInput = z.infer<typeof healthOverviewInputSchema>

const healthOverviewResponseSchema = z.object({
  overallStatus: z.enum(["stable", "monitor", "urgent"]),
  summary: z.string().min(1).max(900),
  keySignals: z.array(z.object({
    label: z.string().min(1).max(140),
    severity: z.enum(["low", "medium", "high"]),
    detail: z.string().min(1).max(320),
  })).max(6),
  focusBatches: z.array(z.object({
    batchId: z.string().min(1),
    batchNumber: z.string().min(1).max(120),
    urgency: z.enum(["monitor", "urgent"]),
    reason: z.string().min(1).max(320),
  })).max(5),
  recommendedActions: z.array(z.object({
    action: z.string().min(1).max(180),
    priority: z.enum(["immediate", "soon", "monitor"]),
    why: z.string().min(1).max(320),
  })).max(6),
  whenToEscalate: z.array(z.string().min(1).max(220)).max(4),
})

export type HealthOverviewResult = z.infer<typeof healthOverviewResponseSchema>

function getConfiguredAIProvider(): "openai" | "anthropic" | null {
  const env = getServerEnv()
  if (env.ANTHROPIC_API_KEY) return "anthropic"
  if (env.OPENAI_API_KEY) return "openai"
  return null
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

  return data.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null
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

function stripJsonCodeFence(value: string): string {
  const trimmed = value.trim()
  if (!trimmed.startsWith("```")) return trimmed

  return trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()
}

function normalizeOverallStatus(value: unknown): "stable" | "monitor" | "urgent" {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (["stable", "ok", "normal", "calm"].includes(normalized)) return "stable"
  if (["urgent", "critical", "critique", "alerte rouge"].includes(normalized)) return "urgent"
  return "monitor"
}

function inferSeverity(value: string): "low" | "medium" | "high" {
  const normalized = value.toLowerCase()
  if (
    normalized.includes("urgent")
    || normalized.includes("critique")
    || normalized.includes("mort")
    || normalized.includes("elevee")
    || normalized.includes("retard")
  ) {
    return "high"
  }

  if (
    normalized.includes("surve")
    || normalized.includes("baisse")
    || normalized.includes("attention")
    || normalized.includes("traitement")
  ) {
    return "medium"
  }

  return "low"
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 4)
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(/\n|;|•|-/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 4)
  }
  return []
}

function normalizeHealthOverviewPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload

  const data = payload as Record<string, unknown>
  const keySignals = Array.isArray(data.keySignals)
    ? data.keySignals.map((item) => {
        if (typeof item === "string") {
          return {
            label: item,
            severity: inferSeverity(item),
            detail: item,
          }
        }

        if (item && typeof item === "object") {
          const signal = item as Record<string, unknown>
          const label = typeof signal.label === "string"
            ? signal.label
            : typeof signal.title === "string"
              ? signal.title
              : typeof signal.detail === "string"
                ? signal.detail
                : "Signal sanitaire"
          const detail = typeof signal.detail === "string"
            ? signal.detail
            : typeof signal.reason === "string"
              ? signal.reason
              : label
          return {
            label,
            severity: typeof signal.severity === "string"
              ? inferSeverity(signal.severity)
              : inferSeverity(detail),
            detail,
          }
        }

        return {
          label: "Signal sanitaire",
          severity: "medium" as const,
          detail: "Signal a verifier.",
        }
      }).slice(0, 6)
    : []

  const recommendedActions = Array.isArray(data.recommendedActions)
    ? data.recommendedActions.map((item) => {
        if (typeof item === "string") {
          return {
            action: item,
            priority: inferSeverity(item) === "high" ? "immediate" : "soon",
            why: "Action proposee par l'analyse IA sanitaire.",
          }
        }

        if (item && typeof item === "object") {
          const action = item as Record<string, unknown>
          const actionLabel = typeof action.action === "string"
            ? action.action
            : typeof action.label === "string"
              ? action.label
              : "Action recommandee"
          const why = typeof action.why === "string"
            ? action.why
            : typeof action.reason === "string"
              ? action.reason
              : "Action proposee par l'analyse IA sanitaire."
          const priorityValue = typeof action.priority === "string" ? action.priority.toLowerCase() : ""
          const priority = priorityValue === "immediate" || priorityValue === "soon" || priorityValue === "monitor"
            ? priorityValue
            : inferSeverity(`${actionLabel} ${why}`) === "high"
              ? "immediate"
              : "soon"

          return {
            action: actionLabel,
            priority,
            why,
          }
        }

        return {
          action: "Verifier la situation sanitaire",
          priority: "soon" as const,
          why: "Action proposee par l'analyse IA sanitaire.",
        }
      }).slice(0, 6)
    : []

  const focusBatches = Array.isArray(data.focusBatches)
    ? data.focusBatches
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        batchId: typeof item.batchId === "string" ? item.batchId : "",
        batchNumber: typeof item.batchNumber === "string"
          ? item.batchNumber
          : typeof item.batch === "string"
            ? item.batch
            : "Lot a surveiller",
        urgency: inferSeverity(
          `${typeof item.urgency === "string" ? item.urgency : ""} ${typeof item.reason === "string" ? item.reason : ""}`,
        ) === "high"
          ? "urgent" as const
          : "monitor" as const,
        reason: typeof item.reason === "string" ? item.reason : "Lot a verifier en priorite.",
      }))
      .slice(0, 5)
    : []

  return {
    overallStatus: normalizeOverallStatus(data.overallStatus),
    summary: typeof data.summary === "string"
      ? data.summary
      : "Analyse sanitaire generee par l'IA.",
    keySignals,
    focusBatches,
    recommendedActions,
    whenToEscalate: normalizeStringArray(data.whenToEscalate),
  }
}

export async function buildHealthOverviewInput(
  organizationId: string,
  lookbackDays = 7,
): Promise<HealthOverviewInput> {
  const now = new Date()
  const lookbackStart = new Date(now.getTime() - lookbackDays * 86_400_000)

  const batches = await prisma.batch.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
    },
    select: {
      id: true,
      number: true,
      type: true,
      entryDate: true,
      entryAgeDay: true,
      entryCount: true,
      dailyRecords: {
        where: { date: { gte: lookbackStart } },
        orderBy: { date: "desc" },
        select: {
          date: true,
          mortality: true,
        },
      },
      vaccinationRecords: {
        orderBy: { date: "desc" },
        select: {
          date: true,
          vaccineName: true,
        },
      },
      treatmentRecords: {
        where: {
          OR: [
            { endDate: null },
            { endDate: { gte: lookbackStart } },
            { startDate: { gte: lookbackStart } },
          ],
        },
        orderBy: { startDate: "desc" },
        select: {
          startDate: true,
          endDate: true,
          medicineName: true,
          indication: true,
        },
      },
    },
  })

  const focusBatches = batches.map((batch) => {
    const ageDay = batch.entryAgeDay + Math.max(
      0,
      Math.floor((now.getTime() - new Date(batch.entryDate).getTime()) / 86_400_000),
    )
    const recentMortality = batch.dailyRecords.reduce((sum, record) => sum + record.mortality, 0)
    const recentMortalityRatePct = batch.entryCount > 0
      ? Math.round((recentMortality / batch.entryCount) * 1000) / 10
      : 0
    const activeTreatments = batch.treatmentRecords.filter((record) => (
      !record.endDate || new Date(record.endDate) >= now
    )).length
    const recentVaccinations = batch.vaccinationRecords.filter((record) => (
      new Date(record.date) >= lookbackStart
    )).length
    const lastRecordDate = batch.dailyRecords[0]?.date ?? null
    const missingDailyRecords = !lastRecordDate
      || (now.getTime() - new Date(lastRecordDate).getTime()) / 86_400_000 > 1.5
    const suggestions = getVaccinationSuggestions({
      batchType: batch.type,
      ageDay,
      recordedVaccines: batch.vaccinationRecords.map((record) => record.vaccineName),
    })
    const overdueVaccines = suggestions.filter((item) => item.status === "overdue").length
    const dueVaccines = suggestions.filter((item) => item.status === "due").length

    const signals: string[] = []
    if (recentMortalityRatePct >= 5) {
      signals.push(`mortalite recente elevee (${recentMortalityRatePct}%)`)
    } else if (recentMortalityRatePct >= 2) {
      signals.push(`mortalite recente a surveiller (${recentMortalityRatePct}%)`)
    }
    if (activeTreatments > 0) {
      signals.push(`${activeTreatments} traitement(s) actif(s)`)
    }
    if (overdueVaccines > 0) {
      signals.push(`${overdueVaccines} vaccination(s) en retard`)
    } else if (dueVaccines > 0) {
      signals.push(`${dueVaccines} vaccination(s) a faire`)
    }
    if (missingDailyRecords) {
      signals.push("saisie quotidienne incomplete ou absente")
    }
    if (recentVaccinations > 0) {
      signals.push(`${recentVaccinations} vaccination(s) recente(s)`)
    }

    return {
      batchId: batch.id,
      batchNumber: batch.number,
      batchType: batch.type,
      ageDay,
      entryCount: batch.entryCount,
      recentMortality,
      recentMortalityRatePct,
      activeTreatments,
      recentVaccinations,
      overdueVaccines,
      dueVaccines,
      missingDailyRecords,
      lastRecordDate: lastRecordDate ? new Date(lastRecordDate).toISOString() : null,
      signals: signals.slice(0, 6),
    }
  })
    .sort((left, right) => (
      right.recentMortality - left.recentMortality
      || right.overdueVaccines - left.overdueVaccines
      || Number(right.missingDailyRecords) - Number(left.missingDailyRecords)
      || right.activeTreatments - left.activeTreatments
    ))
    .slice(0, 8)

  return healthOverviewInputSchema.parse({
    generatedAt: now.toISOString(),
    lookbackDays,
    activeBatchCount: batches.length,
    recentVaccinations: focusBatches.reduce((sum, item) => sum + item.recentVaccinations, 0),
    activeTreatments: focusBatches.reduce((sum, item) => sum + item.activeTreatments, 0),
    overdueVaccinationBatches: focusBatches.filter((item) => item.overdueVaccines > 0).length,
    missingDailyRecordBatches: focusBatches.filter((item) => item.missingDailyRecords).length,
    focusBatches,
  })
}

export async function generateHealthOverviewWithOpenAI(
  input: HealthOverviewInput,
  model: string,
): Promise<HealthOverviewResult> {
  const provider = getConfiguredAIProvider()
  if (provider === "anthropic") {
    const apiKey = getServerEnv().ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY manquant")
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1600,
        system:
          "Tu es l'assistant sanitaire de SunuFarm. Reponds uniquement en JSON valide. " +
          "Tu aides a surveiller un elevage avicole, sans poser de diagnostic veterinaire definitif. " +
          "Priorise les risques operationnels, les actions terrain concretes et les cas qui demandent une escalation rapide vers un veterinaire.",
        messages: [
          {
            role: "user",
            content:
              "Retourne un JSON strict avec overallStatus, summary, keySignals, focusBatches, recommendedActions et whenToEscalate. " +
              "N'ajoute aucun markdown.\n" + JSON.stringify(input),
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
      throw new Error("Reponse Anthropic sante vide")
    }

    return healthOverviewResponseSchema.parse(
      normalizeHealthOverviewPayload(JSON.parse(stripJsonCodeFence(rawText))),
    )
  }

  const apiKey = getServerEnv().OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY manquant")
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Tu es l'assistant sanitaire de SunuFarm. Reponds uniquement en JSON valide. Tu aides a surveiller un elevage avicole, sans poser de diagnostic veterinaire definitif. Priorise les risques operationnels, les actions terrain concretes et les cas qui demandent une escalation rapide vers un veterinaire.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(input),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "sunufarm_health_overview",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["overallStatus", "summary", "keySignals", "focusBatches", "recommendedActions", "whenToEscalate"],
            properties: {
              overallStatus: {
                type: "string",
                enum: ["stable", "monitor", "urgent"],
              },
              summary: { type: "string" },
              keySignals: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "severity", "detail"],
                  properties: {
                    label: { type: "string" },
                    severity: { type: "string", enum: ["low", "medium", "high"] },
                    detail: { type: "string" },
                  },
                },
              },
              focusBatches: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["batchId", "batchNumber", "urgency", "reason"],
                  properties: {
                    batchId: { type: "string" },
                    batchNumber: { type: "string" },
                    urgency: { type: "string", enum: ["monitor", "urgent"] },
                    reason: { type: "string" },
                  },
                },
              },
              recommendedActions: {
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
              whenToEscalate: {
                type: "array",
                items: { type: "string" },
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
    throw new Error("Reponse IA sante vide")
  }

  return healthOverviewResponseSchema.parse(normalizeHealthOverviewPayload(JSON.parse(rawText)))
}
