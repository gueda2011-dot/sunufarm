import type { MarginTrendResult, RiskTrendResult } from "@/src/lib/predictive-snapshots"
import type { BatchMarginProjection } from "@/src/lib/predictive-margin-rules"
import type { BatchMortalityPrediction } from "@/src/lib/predictive-mortality-rules"
import type { StockRupturePrediction } from "@/src/lib/predictive-rules"
import type { AlertLevel } from "@/src/lib/kpi"

type BusinessSignalTone = "critical" | "warning" | "ok"

export interface BusinessBatchSource {
  id: string
  number: string
  farmName: string
  buildingName: string
  entryCount: number
  observedRevenueFcfa: number
  observedTotalCostFcfa: number
  totalMortality: number
  marginPrediction: BatchMarginProjection
  marginTrend: MarginTrendResult
  mortalityPrediction: BatchMortalityPrediction
  mortalityTrend: RiskTrendResult
}

export interface BusinessStockSource {
  id: string
  name: string
  type: "feed" | "medicine"
  farmName: string
  prediction: StockRupturePrediction
}

export interface BusinessBatchComparisonRow {
  id: string
  number: string
  farmName: string
  buildingName: string
  projectedMarginFcfa: number
  projectedMarginRate: number | null
  marginLabel: string
  mortalityRiskScore: number
  mortalityLabel: string
  status: AlertLevel
  statusLabel: string
}

export interface BusinessPriorityLot {
  id: string
  number: string
  farmName: string
  label: string
  detail: string
  level: AlertLevel
}

export interface BusinessCriticalStockItem {
  id: string
  name: string
  type: "feed" | "medicine"
  farmName: string
  label: string
  daysToStockout: number | null
}

export interface BusinessRecommendation {
  id: string
  title: string
  description: string
  tone: BusinessSignalTone
}

export interface BusinessDashboardViewModel {
  kpis: {
    totalRevenueFcfa: number
    totalCostsFcfa: number
    totalMarginFcfa: number
    globalMortalityRate: number | null
    activeBatchCount: number
    atRiskBatchCount: number
    criticalStockCount: number
  }
  priority: {
    negativeMarginLots: BusinessPriorityLot[]
    mortalityRiskLots: BusinessPriorityLot[]
    criticalStockItems: BusinessCriticalStockItem[]
  }
  batchComparison: BusinessBatchComparisonRow[]
  recommendations: BusinessRecommendation[]
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function alertWeight(alertLevel: AlertLevel): number {
  switch (alertLevel) {
    case "critical":
      return 3
    case "warning":
      return 2
    default:
      return 1
  }
}

function getBatchStatus(
  marginAlertLevel: AlertLevel,
  mortalityAlertLevel: AlertLevel,
): { level: AlertLevel; label: string } {
  if (marginAlertLevel === "critical" || mortalityAlertLevel === "critical") {
    return { level: "critical", label: "Priorite immediate" }
  }
  if (marginAlertLevel === "warning" || mortalityAlertLevel === "warning") {
    return { level: "warning", label: "A surveiller" }
  }
  return { level: "ok", label: "Sous controle" }
}

function compareBatches(a: BusinessBatchSource, b: BusinessBatchSource): number {
  const aStatus = getBatchStatus(a.marginPrediction.alertLevel, a.mortalityPrediction.alertLevel)
  const bStatus = getBatchStatus(b.marginPrediction.alertLevel, b.mortalityPrediction.alertLevel)

  const scoreA =
    alertWeight(aStatus.level) * 100
    + alertWeight(a.marginPrediction.alertLevel) * 30
    + alertWeight(a.mortalityPrediction.alertLevel) * 20
    + Math.max(0, a.mortalityPrediction.riskScore)
  const scoreB =
    alertWeight(bStatus.level) * 100
    + alertWeight(b.marginPrediction.alertLevel) * 30
    + alertWeight(b.mortalityPrediction.alertLevel) * 20
    + Math.max(0, b.mortalityPrediction.riskScore)

  if (scoreA !== scoreB) return scoreB - scoreA
  return a.marginPrediction.projectedProfitFcfa - b.marginPrediction.projectedProfitFcfa
}

function buildRecommendations(
  batches: BusinessBatchSource[],
  criticalStocks: BusinessCriticalStockItem[],
): BusinessRecommendation[] {
  const negativeMarginLots = batches.filter((batch) => batch.marginPrediction.alertLevel === "critical")
  const degradingMortalityLots = batches.filter((batch) => (
    batch.mortalityPrediction.alertLevel !== "ok"
    && batch.mortalityTrend.trend === "degrading"
  ))
  const fragileLots = batches.filter((batch) => (
    batch.marginPrediction.alertLevel !== "ok" || batch.mortalityPrediction.alertLevel !== "ok"
  ))

  const recommendations: BusinessRecommendation[] = []

  if (negativeMarginLots.length >= 2) {
    recommendations.push({
      id: "margin-cluster",
      title: "Revoir vite la rentabilite des lots les plus fragiles",
      description: `${negativeMarginLots.length} lots projettent une marge negative. Priorisez une revue des couts variables, du rythme de depense et du prix de sortie attendu.`,
      tone: "critical",
    })
  } else if (negativeMarginLots.length === 1) {
    recommendations.push({
      id: "margin-single",
      title: "Traiter le lot qui part en marge negative",
      description: `Le lot ${negativeMarginLots[0]?.number} projette une marge negative. Verifiez rapidement ses charges recentes et la strategie de vente restante.`,
      tone: "warning",
    })
  }

  if (criticalStocks.length >= 2) {
    recommendations.push({
      id: "stock-multi",
      title: "Declencher un reapprovisionnement prioritaire",
      description: `${criticalStocks.length} articles de stock sont en rupture critique. Replanifiez les entrees stock avant que plusieurs lots soient bloques en meme temps.`,
      tone: "critical",
    })
  } else if (criticalStocks.length === 1) {
    recommendations.push({
      id: "stock-single",
      title: "Securiser le stock critique du moment",
      description: `${criticalStocks[0]?.name} approche d'une rupture critique. Anticipez l'achat ou le transfert avant l'impact terrain.`,
      tone: "warning",
    })
  }

  if (degradingMortalityLots.length >= 2) {
    recommendations.push({
      id: "health-degrading",
      title: "Organiser une revue sanitaire transverse",
      description: `${degradingMortalityLots.length} lots montrent un risque mortalite qui se degrade. Programmez une verification terrain concentree sur ces sites aujourd'hui.`,
      tone: "critical",
    })
  } else if (degradingMortalityLots.length === 1) {
    recommendations.push({
      id: "health-single",
      title: "Surveiller de pres le lot en degradation sanitaire",
      description: `Le lot ${degradingMortalityLots[0]?.number} montre une degradation recente du risque mortalite. Verifiez saisie, traitements et calendrier vaccinal.`,
      tone: "warning",
    })
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "steady-state",
      title: "Maintenir le pilotage actuel",
      description: `Aucun regroupement critique majeur n'apparait pour l'instant. Continuez la discipline de saisie et gardez l'attention sur les ${fragileLots.length} lots a surveiller.`,
      tone: "ok",
    })
  }

  return recommendations
}

export function buildBusinessDashboardViewModel(input: {
  batches: BusinessBatchSource[]
  stockItems: BusinessStockSource[]
}): BusinessDashboardViewModel {
  const sortedBatches = [...input.batches].sort(compareBatches)
  const totalRevenueFcfa = input.batches.reduce((sum, batch) => sum + batch.observedRevenueFcfa, 0)
  const totalCostsFcfa = input.batches.reduce((sum, batch) => sum + batch.observedTotalCostFcfa, 0)
  const totalMarginFcfa = totalRevenueFcfa - totalCostsFcfa
  const totalEntryCount = input.batches.reduce((sum, batch) => sum + batch.entryCount, 0)
  const totalMortality = input.batches.reduce((sum, batch) => sum + batch.totalMortality, 0)
  const atRiskBatchCount = input.batches.filter((batch) => (
    batch.marginPrediction.alertLevel !== "ok" || batch.mortalityPrediction.alertLevel !== "ok"
  )).length

  const criticalStockItems = input.stockItems
    .filter((item) => item.prediction.alertLevel === "critical")
    .sort((a, b) => {
      const left = a.prediction.daysToStockout ?? Number.POSITIVE_INFINITY
      const right = b.prediction.daysToStockout ?? Number.POSITIVE_INFINITY
      return left - right
    })
    .map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      farmName: item.farmName,
      label: item.prediction.label,
      daysToStockout: item.prediction.daysToStockout,
    }))

  const negativeMarginLots = sortedBatches
    .filter((batch) => batch.marginPrediction.alertLevel === "critical")
    .map((batch) => ({
      id: batch.id,
      number: batch.number,
      farmName: batch.farmName,
      label: batch.marginPrediction.label,
      detail: batch.marginPrediction.summary,
      level: batch.marginPrediction.alertLevel,
    }))

  const mortalityRiskLots = sortedBatches
    .filter((batch) => batch.mortalityPrediction.alertLevel !== "ok")
    .map((batch) => ({
      id: batch.id,
      number: batch.number,
      farmName: batch.farmName,
      label: batch.mortalityPrediction.label,
      detail: `${batch.mortalityPrediction.riskScore}/100 · ${batch.mortalityPrediction.summary}`,
      level: batch.mortalityPrediction.alertLevel,
    }))

  const batchComparison = sortedBatches.map((batch) => {
    const status = getBatchStatus(
      batch.marginPrediction.alertLevel,
      batch.mortalityPrediction.alertLevel,
    )

    return {
      id: batch.id,
      number: batch.number,
      farmName: batch.farmName,
      buildingName: batch.buildingName,
      projectedMarginFcfa: batch.marginPrediction.projectedProfitFcfa,
      projectedMarginRate: batch.marginPrediction.projectedMarginRate,
      marginLabel: batch.marginPrediction.label,
      mortalityRiskScore: batch.mortalityPrediction.riskScore,
      mortalityLabel: batch.mortalityPrediction.label,
      status: status.level,
      statusLabel: status.label,
    }
  })

  return {
    kpis: {
      totalRevenueFcfa,
      totalCostsFcfa,
      totalMarginFcfa,
      globalMortalityRate: totalEntryCount > 0 ? round((totalMortality / totalEntryCount) * 100) : null,
      activeBatchCount: input.batches.length,
      atRiskBatchCount,
      criticalStockCount: criticalStockItems.length,
    },
    priority: {
      negativeMarginLots,
      mortalityRiskLots,
      criticalStockItems,
    },
    batchComparison,
    recommendations: buildRecommendations(sortedBatches, criticalStockItems),
  }
}
