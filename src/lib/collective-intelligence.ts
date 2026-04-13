/**
 * SunuFarm — Intelligence Collective
 *
 * Engine principal qui transforme les données d'un lot fermé
 * en un snapshot anonymisé contribuant au pool collectif.
 *
 * ANONYMISATION GARANTIE :
 *   - Aucun organizationId, userId, farmId ou batchId dans le snapshot
 *   - Seuls le contexte agrégé et les résultats finaux sont stockés
 *   - Les snapshots ne permettent pas de remonter à une ferme spécifique
 *
 * Flux de génération :
 *   closeBatch() → generateBatchOutcomeSnapshot(batchId, organizationId)
 *              → [ collecte données ] → [ calcule métriques ] → [ persiste snapshot ]
 */

import { createHash } from "node:crypto"
import prisma from "@/src/lib/prisma"
import { BatchType, BuildingType } from "@/src/generated/prisma/client"
import { getBatchOperationalSnapshot } from "@/src/lib/batch-metrics"
import { getServerEnv } from "@/src/lib/env"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BatchOutcomeSnapshotInput {
  sourceFingerprint: string
  batchType: BatchType
  breedCode: string | null
  regionCode: string | null
  buildingType: BuildingType
  entryCount: number
  durationDays: number
  entryMonth: number
  entryYear: number

  finalMortalityRatePct: number
  finalFCR: number | null
  finalMarginRatePct: number | null
  avgSalePricePerKgFcfa: number | null

  avgTemperatureMax: number | null
  avgHumidity: number | null
  heatStressDays: number | null
  coldStressDays: number | null

  treatmentCount: number
  majorMortalityDays: number
  overdueVaccineDays: number
  vaccinationCompleted: boolean

  totalFeedKg: number | null
  feedKgPerBird: number | null
  avgFinalWeightG: number | null

  // Phase 4 — traçabilité référentiel et qualité données ML
  curveVersion: string | null
  senegalProfileUsed: string | null
  farmAdjustmentStatus: string | null
  pctEstimatedJ14: number | null
  avgConfidenceJ14: number | null
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function average(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v))
  if (valid.length === 0) return null
  return valid.reduce((sum, v) => sum + v, 0) / valid.length
}

function roundTo(value: number | null, decimals: number): number | null {
  if (value === null) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

const SNAPSHOT_FINGERPRINT_ENABLED_AT = new Date("2026-04-12T00:00:00.000Z")

/**
 * Détermine le code région depuis l'adresse ou la localisation de la ferme.
 * Heuristique simple sur le champ address — peut être enrichie plus tard.
 */
export function deriveRegionCode(address: string | null): string | null {
  if (!address) return null
  const upper = address.toUpperCase()
  const regions = [
    "DAKAR", "THIES", "THIÈS", "SAINT_LOUIS", "SAINT LOUIS", "DIOURBEL",
    "FATICK", "KAOLACK", "KOLDA", "LOUGA", "MATAM", "SEDHIOU", "SÉDHIOU",
    "TAMBACOUNDA", "ZIGUINCHOR", "KAFFRINE", "KEDOUGOU", "KÉDOUGOU",
  ]
  for (const region of regions) {
    if (upper.includes(region)) {
      return region.replace(" ", "_").replace("È", "E").replace("É", "E")
    }
  }
  return null
}

export function buildBatchOutcomeSnapshotFingerprint(
  organizationId: string,
  batchId: string,
  secret: string,
): string {
  return createHash("sha256")
    .update(`${organizationId}:${batchId}:${secret}`)
    .digest("hex")
}

// ---------------------------------------------------------------------------
// Qualité des données alimentation J1–J14 (Phase 4)
// ---------------------------------------------------------------------------

const CONFIDENCE_SCORE = { HIGH: 1.0, MEDIUM: 0.5, LOW: 0.0 } as const

export interface J14DataQualityInput {
  entryDate: Date
  dailyRecords: Array<{
    date: Date
    dataSource?: string | null
    estimationConfidence?: string | null
  }>
}

export interface J14DataQualityResult {
  /** % de jours J1–J14 avec dataSource = ESTIMATED_FROM_BAG (null si aucun record J14) */
  pctEstimatedJ14: number | null
  /** Confiance moyenne J1–J14 : HIGH=1.0, MEDIUM=0.5, LOW=0.0, MANUAL_KG=1.0 (null si aucun record J14) */
  avgConfidenceJ14: number | null
}

export function computeJ14DataQuality(input: J14DataQualityInput): J14DataQualityResult {
  const j14Cutoff = new Date(input.entryDate)
  j14Cutoff.setUTCDate(j14Cutoff.getUTCDate() + 14)
  const j14Records = input.dailyRecords.filter((r) => new Date(r.date) < j14Cutoff)

  if (j14Records.length === 0) {
    return { pctEstimatedJ14: null, avgConfidenceJ14: null }
  }

  const estimatedCount = j14Records.filter(
    (r) => r.dataSource === "ESTIMATED_FROM_BAG"
  ).length
  const pctEstimatedJ14 = roundTo((estimatedCount / j14Records.length) * 100, 1)

  const confidenceValues = j14Records
    .filter((r) => r.estimationConfidence !== null && r.estimationConfidence !== undefined)
    .map((r) => CONFIDENCE_SCORE[r.estimationConfidence as keyof typeof CONFIDENCE_SCORE] ?? 1.0)
  // Records without estimationConfidence are MANUAL_KG → confidence = 1.0
  const manualCount = j14Records.length - confidenceValues.length
  const allConfidenceValues = [
    ...confidenceValues,
    ...Array<number>(manualCount).fill(1.0),
  ]
  const avg = average(allConfidenceValues)
  const avgConfidenceJ14 = avg !== null ? roundTo(avg, 3) : null

  return { pctEstimatedJ14, avgConfidenceJ14 }
}

// ---------------------------------------------------------------------------
// Collecte des données brutes du lot
// ---------------------------------------------------------------------------

async function fetchBatchRawData(batchId: string, organizationId: string) {
  const [
    batch,
    dailyRecords,
    mortalityAgg,
    feedAgg,
    treatmentCount,
    vaccinationRecords,
    vaccinationPlanItems,
    saleItems,
    expenses,
    lastWeightRecord,
    latestFeedBagEvent,
  ] = await Promise.all([
    // Lot + contexte bâtiment/ferme/race
    prisma.batch.findFirst({
      where: { id: batchId, organizationId, deletedAt: null },
      select: {
        id: true,
        type: true,
        status: true,
        entryDate: true,
        entryCount: true,
        entryAgeDay: true,
        closedAt: true,
        totalCostFcfa: true,
        building: {
          select: {
            type: true,
            farm: {
              select: { address: true },
            },
          },
        },
        breed: {
          select: { code: true },
        },
      },
    }),

    // Saisies journalières complètes (météo + mortalité + source donnée Phase 4)
    prisma.dailyRecord.findMany({
      where: { batchId, organizationId },
      select: {
        date: true,
        mortality: true,
        feedKg: true,
        temperatureMax: true,
        humidity: true,
        avgWeightG: true,
        dataSource: true,
        estimationConfidence: true,
      },
      orderBy: { date: "asc" },
    }),

    // Agrégat mortalité
    prisma.dailyRecord.aggregate({
      where: { batchId, organizationId },
      _sum: { mortality: true },
    }),

    // Agrégat aliment
    prisma.dailyRecord.aggregate({
      where: { batchId, organizationId },
      _sum: { feedKg: true },
    }),

    // Nb traitements
    prisma.treatmentRecord.count({
      where: { batchId, organizationId },
    }),

    // Vaccinations réalisées
    prisma.vaccinationRecord.findMany({
      where: { batchId, organizationId },
      select: { date: true, batchAgeDay: true },
    }),

    // Plan vaccinal applicable (pour calculer le retard)
    prisma.vaccinationPlanItem.findMany({
      where: { plan: { organizationId, batchType: undefined } },
      select: { dayOfAge: true },
      take: 20,
    }),

    // Ventes liées
    prisma.saleItem.findMany({
      where: { batchId, sale: { organizationId } },
      select: {
        quantity: true,
        unit: true,
        totalFcfa: true,
        unitPriceFcfa: true,
      },
    }),

    // Dépenses
    prisma.expense.aggregate({
      where: { batchId, organizationId },
      _sum: { amountFcfa: true },
    }),

    // Dernier poids mesuré
    prisma.weightRecord.findFirst({
      where: { batchId, organizationId },
      orderBy: { date: "desc" },
      select: { avgWeightG: true },
    }),

    // Phase 4 — version de courbe utilisée (depuis les FeedBagEvents)
    prisma.feedBagEvent.findFirst({
      where: { batchId, organizationId, curveVersion: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { curveVersion: true },
    }),
  ])

  // Phase 4 — profil Sénégal + statut d'ajustement ferme
  // On les charge séparément car ils nécessitent batch pour avoir farmId
  const batchWithFarm = await prisma.batch.findFirst({
    where: { id: batchId, organizationId },
    select: {
      building: {
        select: {
          farm: {
            select: {
              senegalProfileCode: true,
              farmAdjustmentProfile: {
                select: { status: true },
              },
            },
          },
        },
      },
    },
  })

  return {
    batch,
    dailyRecords,
    mortalityAgg,
    feedAgg,
    treatmentCount,
    vaccinationRecords,
    vaccinationPlanItems,
    saleItems,
    expenses,
    lastWeightRecord,
    latestFeedBagEvent,
    senegalProfileCode: batchWithFarm?.building.farm.senegalProfileCode ?? null,
    farmAdjustmentStatus: batchWithFarm?.building.farm.farmAdjustmentProfile?.status ?? null,
  }
}

// ---------------------------------------------------------------------------
// Calcul des métriques du snapshot
// ---------------------------------------------------------------------------

function computeSnapshotInput(
  raw: Awaited<ReturnType<typeof fetchBatchRawData>>,
  options: { sourceFingerprint: string },
): BatchOutcomeSnapshotInput | null {
  const { batch, dailyRecords, mortalityAgg, feedAgg,
    treatmentCount, vaccinationRecords,
    saleItems, expenses, lastWeightRecord,
    latestFeedBagEvent, senegalProfileCode, farmAdjustmentStatus } = raw

  if (!batch) return null

  // Durée réelle du lot
  const closedAt = batch.closedAt ?? new Date()
  const entryDate = new Date(batch.entryDate)
  const durationDays = Math.max(
    1,
    Math.floor((closedAt.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)),
  )

  // Contexte
  const entryMonth = entryDate.getUTCMonth() + 1
  const entryYear = entryDate.getUTCFullYear()
  const regionCode = deriveRegionCode(batch.building.farm.address)
  const breedCode = batch.breed?.code ?? null

  // Snapshot opérationnel
  const totalMortality = mortalityAgg._sum.mortality ?? 0
  const opSnapshot = getBatchOperationalSnapshot({
    entryDate: batch.entryDate,
    entryAgeDay: batch.entryAgeDay,
    entryCount: batch.entryCount,
    status: batch.status,
    totalMortality,
  })
  const finalMortalityRatePct = roundTo(opSnapshot.mortalityRatePct, 2) ?? 0

  // FCR — aliment total / masse gagnée (estimée depuis poids moyen final)
  const totalFeedKg = feedAgg._sum.feedKg ?? null
  let finalFCR: number | null = null
  if (totalFeedKg && lastWeightRecord?.avgWeightG && batch.entryCount > 0) {
    const totalMassGainKg = (lastWeightRecord.avgWeightG / 1000) * opSnapshot.liveCount
    if (totalMassGainKg > 0) {
      finalFCR = roundTo(totalFeedKg / totalMassGainKg, 2)
    }
  }

  // Marge
  const totalRevenueFcfa = saleItems.reduce((sum, item) => sum + item.totalFcfa, 0)
  const operationalCostFcfa = expenses._sum.amountFcfa ?? 0
  const totalCostFcfa = batch.totalCostFcfa + operationalCostFcfa
  let finalMarginRatePct: number | null = null
  if (totalCostFcfa > 0) {
    finalMarginRatePct = roundTo(
      ((totalRevenueFcfa - totalCostFcfa) / totalCostFcfa) * 100,
      1,
    )
  }

  // Prix de vente moyen / kg (poulets vifs uniquement)
  const kgItems = saleItems.filter((i) => i.unit === "KG" && i.quantity > 0)
  let avgSalePricePerKgFcfa: number | null = null
  if (kgItems.length > 0) {
    const avgPrice = average(kgItems.map((i) => i.unitPriceFcfa))
    avgSalePricePerKgFcfa = avgPrice ? Math.round(avgPrice) : null
  }

  // Météo agrégée
  const tempsMax = dailyRecords
    .map((r) => r.temperatureMax)
    .filter((v): v is number => v !== null)
  const humidities = dailyRecords
    .map((r) => r.humidity)
    .filter((v): v is number => v !== null)

  const avgTemperatureMax = roundTo(average(tempsMax), 1)
  const avgHumidity = roundTo(average(humidities), 1)
  const heatStressDays = tempsMax.filter((t) => t > 35).length || null
  const coldStressDays = tempsMax.filter((t) => t < 18).length || null

  // Signaux sanitaires
  const majorMortalityDays = dailyRecords.filter((r) => {
    const rate = batch.entryCount > 0 ? (r.mortality / batch.entryCount) * 100 : 0
    return rate > 2
  }).length

  // Jours de retard vaccination (simple : vaccinations réalisées après J+3 du jour cible)
  const overdueVaccineDays = vaccinationRecords.filter((v) => v.batchAgeDay > 3).length

  // Plan vaccinal complété (heuristique : au moins 1 vaccination)
  const vaccinationCompleted = vaccinationRecords.length > 0

  // Aliment par oiseau vivant
  const feedKgPerBird =
    totalFeedKg && opSnapshot.liveCount > 0
      ? roundTo(totalFeedKg / opSnapshot.liveCount, 2)
      : null

  // Phase 4 — qualité des données J1–J14
  const { pctEstimatedJ14, avgConfidenceJ14 } = computeJ14DataQuality({
    entryDate,
    dailyRecords,
  })

  return {
    sourceFingerprint: options.sourceFingerprint,
    batchType: batch.type,
    breedCode,
    regionCode,
    buildingType: batch.building.type,
    entryCount: batch.entryCount,
    durationDays,
    entryMonth,
    entryYear,
    finalMortalityRatePct,
    finalFCR,
    finalMarginRatePct,
    avgSalePricePerKgFcfa,
    avgTemperatureMax,
    avgHumidity,
    heatStressDays: heatStressDays === 0 ? null : heatStressDays,
    coldStressDays: coldStressDays === 0 ? null : coldStressDays,
    treatmentCount,
    majorMortalityDays,
    overdueVaccineDays,
    vaccinationCompleted,
    totalFeedKg,
    feedKgPerBird,
    avgFinalWeightG: lastWeightRecord?.avgWeightG ?? null,
    // Phase 4 — traçabilité référentiel et qualité données ML
    curveVersion: latestFeedBagEvent?.curveVersion ?? null,
    senegalProfileUsed: senegalProfileCode ?? null,
    farmAdjustmentStatus: farmAdjustmentStatus ?? null,
    pctEstimatedJ14,
    avgConfidenceJ14,
  }
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Génère et persiste un snapshot anonymisé pour un lot fermé.
 * À appeler juste après la fermeture du lot dans closeBatch().
 * Ne lève jamais d'exception — les erreurs sont loguées sans bloquer la fermeture.
 */
export async function generateBatchOutcomeSnapshot(
  batchId: string,
  organizationId: string,
  options: { swallowErrors?: boolean } = {},
): Promise<"created" | "updated" | "skipped" | "error"> {
  const { swallowErrors = true } = options

  try {
    const organization = await prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { collectiveIntelligenceSharingEnabled: true },
    })

    if (!organization?.collectiveIntelligenceSharingEnabled) {
      return "skipped"
    }

    const sourceFingerprint = buildBatchOutcomeSnapshotFingerprint(
      organizationId,
      batchId,
      getServerEnv().AUTH_SECRET,
    )
    const rawData = await fetchBatchRawData(batchId, organizationId)
    const snapshotInput = computeSnapshotInput(rawData, { sourceFingerprint })

    if (!snapshotInput) return "skipped"

    const now = new Date()
    const snapshot = await prisma.batchOutcomeSnapshot.upsert({
      where: { sourceFingerprint },
      create: snapshotInput,
      update: {
        ...snapshotInput,
        updatedAt: now,
      },
      select: { createdAt: true, updatedAt: true },
    })

    return snapshot.createdAt.getTime() === snapshot.updatedAt.getTime()
      ? "created"
      : "updated"
  } catch (error) {
    console.error("[CollectiveIntelligence] Erreur génération snapshot:", error)
    if (!swallowErrors) {
      throw error
    }
    return "error"
  }
}

/**
 * Backfill : génère les snapshots pour tous les lots fermés sans snapshot.
 * À appeler depuis le cron de backfill une seule fois au démarrage.
 * Limite à `batchSize` lots par appel pour éviter les timeouts.
 */
export async function backfillBatchOutcomeSnapshots(
  options: { batchSize?: number } = {},
): Promise<{ processed: number; errors: number }> {
  const { batchSize = 20 } = options

  const organizations = await prisma.organization.findMany({
    where: {
      deletedAt: null,
      collectiveIntelligenceSharingEnabled: true,
    },
    select: { id: true },
  })

  if (organizations.length === 0) {
    return { processed: 0, errors: 0 }
  }

  const organizationIds = organizations.map((organization) => organization.id)

  const closedBatches = await prisma.batch.findMany({
    where: {
      organizationId: { in: organizationIds },
      status: { in: ["CLOSED", "SOLD", "SLAUGHTERED"] },
      deletedAt: null,
      closedAt: { not: null, gte: SNAPSHOT_FINGERPRINT_ENABLED_AT },
    },
    select: {
      id: true,
      organizationId: true,
      closedAt: true,
    },
    orderBy: { closedAt: "desc" },
    take: batchSize * 20,
  })

  const fingerprintByBatch = new Map(
    closedBatches.map((batch) => [
      batch.id,
      buildBatchOutcomeSnapshotFingerprint(
        batch.organizationId,
        batch.id,
        getServerEnv().AUTH_SECRET,
      ),
    ]),
  )

  const existingSnapshots = await prisma.batchOutcomeSnapshot.findMany({
    where: {
      sourceFingerprint: {
        in: [...fingerprintByBatch.values()],
      },
    },
    select: { sourceFingerprint: true },
  })

  const existingFingerprints = new Set(
    existingSnapshots.map((snapshot) => snapshot.sourceFingerprint),
  )

  const toProcess = closedBatches
    .filter((batch) => !existingFingerprints.has(fingerprintByBatch.get(batch.id)!))
    .slice(0, batchSize)

  let processed = 0
  let errors = 0

  for (const batch of toProcess) {
    try {
      const result = await generateBatchOutcomeSnapshot(batch.id, batch.organizationId, {
        swallowErrors: false,
      })

      if (result === "created" || result === "updated") {
        processed++
      }
    } catch {
      errors++
    }
  }

  return { processed, errors }
}
