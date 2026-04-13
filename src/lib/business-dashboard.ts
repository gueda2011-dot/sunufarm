import { KPI_THRESHOLDS } from "@/src/constants/kpi-thresholds"
import type { AlertLevel } from "@/src/lib/kpi"
import type { BatchMarginProjection } from "@/src/lib/predictive-margin-rules"
import type { BatchMortalityPrediction } from "@/src/lib/predictive-mortality-rules"
import type { StockRupturePrediction } from "@/src/lib/predictive-rules"
import type { MarginTrendResult, RiskTrendResult } from "@/src/lib/predictive-snapshots"

type BusinessSignalTone = "critical" | "warning" | "ok"
type BusinessStatusLevel = AlertLevel

export interface BusinessBatchSource {
  id: string
  number: string
  farmName: string
  buildingName: string
  ageDay: number
  entryCount: number
  manualFeedRecordCount: number
  estimatedFeedRecordCount: number
  totalFeedRecordCount: number
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
  priority: number
  title: string
  action: string
  description: string
  tone: BusinessSignalTone
  affectedItems: string[]
}

export interface BusinessDashboardViewModel {
  globalStatus: {
    level: BusinessStatusLevel
    label: string
    headline: string
    summary: string
    primaryAction: string
    score: number
  }
  kpis: {
    totalRevenueFcfa: number
    totalCostsFcfa: number
    totalMarginFcfa: number
    globalMortalityRate: number | null
    activeBatchCount: number
    atRiskBatchCount: number
    criticalStockCount: number
    manualFeedSharePct: number | null
    estimatedFeedSharePct: number | null
    marginVerdict: string
    riskVerdict: string
    stockVerdict: string
    mortalityVerdict: string
    dataQualityVerdict: string
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
    return { level: "warning", label: "Sous tension" }
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

export interface ProfitabilityStatus {
  status: string
  message: string
  level: "info" | "warning" | "success" | "danger"
}

export function getProfitabilityStatus(params: {
  revenue: number
  expenses: number
  margin: number
}): ProfitabilityStatus {
  const { revenue, margin } = params

  if (revenue === 0) {
    return {
      status: "Cycle en demarrage",
      message: "Premieres depenses enregistrees, en attente de ventes",
      level: "warning",
    }
  }

  if (margin > 0) {
    return {
      status: "Exploitation rentable",
      message: "La marge est positive sur la periode",
      level: "success",
    }
  }

  return {
    status: "Exploitation non rentable",
    message: "Les charges depassent les revenus sur la periode",
    level: "danger",
  }
}

function buildMarginVerdict(totalRevenueFcfa: number, totalMarginFcfa: number, atRiskBatchCount: number): string {
  if (totalRevenueFcfa === 0) return "Cycle en demarrage"
  if (totalMarginFcfa < 0) return "Exploitation non rentable"
  if (atRiskBatchCount >= 3) return "Marge sous pression"
  if (totalMarginFcfa < 100_000) return "Marge a consolider"
  return "Situation favorable"
}

function buildRiskVerdict(atRiskBatchCount: number, youngBatchCount: number, matureBatchCount: number): string {
  if (matureBatchCount === 0 && youngBatchCount > 0) {
    return `Lecture encore trop jeune avant J${KPI_THRESHOLDS.PERFORMANCE_VERDICT_MIN_AGE_DAYS}`
  }
  if (atRiskBatchCount >= 4) return `${atRiskBatchCount} lots menacent la performance`
  if (atRiskBatchCount >= 2) return `${atRiskBatchCount} lots demandent une action rapide`
  if (atRiskBatchCount === 1) return "1 lot prioritaire a traiter"
  if (youngBatchCount > 0) {
    return `Lecture stable, avec ${youngBatchCount} lot${youngBatchCount > 1 ? "s" : ""} encore avant J${KPI_THRESHOLDS.PERFORMANCE_VERDICT_MIN_AGE_DAYS}`
  }
  return "Aucun lot en alerte forte"
}

function buildStockVerdict(criticalStockCount: number): string {
  if (criticalStockCount >= 2) return "Reapprovisionnement urgent"
  if (criticalStockCount === 1) return "1 rupture critique a traiter"
  return "Aucune rupture critique"
}

function buildMortalityVerdict(
  globalMortalityRate: number | null,
  youngBatchCount: number,
  matureBatchCount: number,
): string {
  if (matureBatchCount === 0 && youngBatchCount > 0) {
    return `Lecture sanitaire encore precoce avant J${KPI_THRESHOLDS.PERFORMANCE_VERDICT_MIN_AGE_DAYS}`
  }
  if (globalMortalityRate == null) return "Lecture sanitaire incomplete"
  if (globalMortalityRate >= 3) return "Pression sanitaire elevee"
  if (globalMortalityRate >= 1.5) return "Sante a surveiller"
  if (youngBatchCount > 0) return "Situation sanitaire plutot saine, avec des lots encore jeunes"
  return "Situation sanitaire plutot saine"
}

function buildDataQualityVerdict(manualFeedSharePct: number | null): string {
  if (manualFeedSharePct == null) return "Lecture alimentaire incomplete"
  if (manualFeedSharePct >= 70) return "Base terrain solide"
  if (manualFeedSharePct >= 40) return "Base mixte manuel + estimation"
  return "Base surtout reconstruite"
}

function buildGlobalStatus(input: {
  totalRevenueFcfa: number
  totalMarginFcfa: number
  atRiskBatchCount: number
  criticalStockCount: number
  mortalityRiskCount: number
}): BusinessDashboardViewModel["globalStatus"] {
  const noRevenue = input.totalRevenueFcfa === 0

  let score = 100
  score -= input.atRiskBatchCount * 10
  score -= input.criticalStockCount * 15
  score -= input.mortalityRiskCount * 8
  if (!noRevenue && input.totalMarginFcfa < 0) score -= 25
  else if (!noRevenue && input.totalMarginFcfa < 100_000) score -= 10
  score = Math.max(0, Math.min(100, score))

  if ((!noRevenue && input.totalMarginFcfa < 0) || input.criticalStockCount >= 2 || input.atRiskBatchCount >= 4) {
    return {
      level: "critical",
      label: "Situation critique",
      headline: "L'exploitation est sous pression",
      summary: "Plusieurs signaux menacent directement la marge, la continuite terrain ou la sante des lots.",
      primaryAction: "Traiter aujourd'hui les lots non rentables et les ruptures critiques.",
      score,
    }
  }

  if (input.atRiskBatchCount >= 2 || input.criticalStockCount === 1 || input.mortalityRiskCount >= 2) {
    return {
      level: "warning",
      label: "Exploitation sous vigilance",
      headline: "Des arbitrages rapides sont necessaires",
      summary: "La situation reste pilotable, mais plusieurs sujets peuvent vite se transformer en perte.",
      primaryAction: "Prioriser les lots fragiles et securiser les approvisionnements sensibles.",
      score,
    }
  }

  return {
    level: "ok",
    label: "Situation globalement saine",
    headline: "L'exploitation reste sous controle",
    summary: "Les signaux critiques sont limites et les decisions prioritaires restent maitrisables.",
    primaryAction: "Maintenir la discipline de saisie et suivre les quelques points de vigilance.",
    score,
  }
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
      priority: 1,
      title: "La marge est menacee sur plusieurs lots",
      action: "Revoir aujourd'hui les lots les moins rentables",
      description: `${negativeMarginLots.length} lots projettent une marge negative. Priorisez une revue des couts variables, du rythme de depense et du prix de sortie attendu.`,
      tone: "critical",
      affectedItems: negativeMarginLots.slice(0, 3).map((batch) => batch.number),
    })
  } else if (negativeMarginLots.length === 1) {
    recommendations.push({
      id: "margin-single",
      priority: 2,
      title: "Un lot fait basculer la rentabilite",
      action: "Traiter en priorite le lot en marge negative",
      description: `Le lot ${negativeMarginLots[0]?.number} projette une marge negative. Verifiez rapidement ses charges recentes et la strategie de vente restante.`,
      tone: "warning",
      affectedItems: negativeMarginLots.map((batch) => batch.number),
    })
  }

  if (criticalStocks.length >= 2) {
    recommendations.push({
      id: "stock-multi",
      priority: 1,
      title: "Le reapprovisionnement devient urgent",
      action: "Declencher un reapprovisionnement prioritaire",
      description: `${criticalStocks.length} articles de stock sont en rupture critique. Replanifiez les entrees stock avant que plusieurs lots soient bloques en meme temps.`,
      tone: "critical",
      affectedItems: criticalStocks.slice(0, 3).map((item) => item.name),
    })
  } else if (criticalStocks.length === 1) {
    recommendations.push({
      id: "stock-single",
      priority: 2,
      title: "Un stock critique menace la continuite",
      action: "Securiser le stock critique du moment",
      description: `${criticalStocks[0]?.name} approche d'une rupture critique. Anticipez l'achat ou le transfert avant l'impact terrain.`,
      tone: "warning",
      affectedItems: criticalStocks.map((item) => item.name),
    })
  }

  if (degradingMortalityLots.length >= 2) {
    recommendations.push({
      id: "health-degrading",
      priority: 1,
      title: "La pression sanitaire monte sur plusieurs lots",
      action: "Organiser une revue sanitaire transverse",
      description: `${degradingMortalityLots.length} lots montrent un risque mortalite qui se degrade. Programmez une verification terrain concentree sur ces sites aujourd'hui.`,
      tone: "critical",
      affectedItems: degradingMortalityLots.slice(0, 3).map((batch) => batch.number),
    })
  } else if (degradingMortalityLots.length === 1) {
    recommendations.push({
      id: "health-single",
      priority: 2,
      title: "Un lot demande une action sanitaire rapide",
      action: "Surveiller de pres le lot en degradation sanitaire",
      description: `Le lot ${degradingMortalityLots[0]?.number} montre une degradation recente du risque mortalite. Verifiez saisie, traitements et calendrier vaccinal.`,
      tone: "warning",
      affectedItems: degradingMortalityLots.map((batch) => batch.number),
    })
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "steady-state",
      priority: 3,
      title: "L'exploitation reste globalement sous controle",
      action: "Maintenir le rythme de pilotage actuel",
      description: `Aucun regroupement critique majeur n'apparait pour l'instant. Continuez la discipline de saisie et gardez l'attention sur les ${fragileLots.length} lots a surveiller.`,
      tone: "ok",
      affectedItems: fragileLots.slice(0, 3).map((batch) => batch.number),
    })
  }

  return recommendations.sort((a, b) => a.priority - b.priority)
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
  const totalManualFeedRecords = input.batches.reduce((sum, batch) => sum + batch.manualFeedRecordCount, 0)
  const totalEstimatedFeedRecords = input.batches.reduce((sum, batch) => sum + batch.estimatedFeedRecordCount, 0)
  const totalFeedRecords = input.batches.reduce((sum, batch) => sum + batch.totalFeedRecordCount, 0)
  const youngBatchCount = input.batches.filter((batch) => (
    batch.ageDay < KPI_THRESHOLDS.PERFORMANCE_VERDICT_MIN_AGE_DAYS
  )).length
  const matureBatchCount = input.batches.length - youngBatchCount
  const mortalityRiskCount = input.batches.filter((batch) => (
    batch.mortalityPrediction.alertLevel !== "ok"
  )).length
  const globalMortalityRate = totalEntryCount > 0 ? round((totalMortality / totalEntryCount) * 100) : null
  const manualFeedSharePct = totalFeedRecords > 0 ? round((totalManualFeedRecords / totalFeedRecords) * 100, 0) : null
  const estimatedFeedSharePct = totalFeedRecords > 0 ? round((totalEstimatedFeedRecords / totalFeedRecords) * 100, 0) : null

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
      detail: `${batch.mortalityPrediction.riskScore}/100 - ${batch.mortalityPrediction.summary}`,
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
    globalStatus: buildGlobalStatus({
      totalRevenueFcfa,
      totalMarginFcfa,
      atRiskBatchCount,
      criticalStockCount: criticalStockItems.length,
      mortalityRiskCount,
    }),
    kpis: {
      totalRevenueFcfa,
      totalCostsFcfa,
      totalMarginFcfa,
      globalMortalityRate,
      activeBatchCount: input.batches.length,
      atRiskBatchCount,
      criticalStockCount: criticalStockItems.length,
      manualFeedSharePct,
      estimatedFeedSharePct,
      marginVerdict: buildMarginVerdict(totalRevenueFcfa, totalMarginFcfa, atRiskBatchCount),
      riskVerdict: buildRiskVerdict(atRiskBatchCount, youngBatchCount, matureBatchCount),
      stockVerdict: buildStockVerdict(criticalStockItems.length),
      mortalityVerdict: buildMortalityVerdict(globalMortalityRate, youngBatchCount, matureBatchCount),
      dataQualityVerdict: buildDataQualityVerdict(manualFeedSharePct),
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
