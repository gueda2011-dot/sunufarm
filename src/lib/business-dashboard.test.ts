import { describe, expect, it } from "vitest"
import { buildBusinessDashboardViewModel, getProfitabilityStatus } from "@/src/lib/business-dashboard"
import type { MarginTrendResult, RiskTrendResult } from "@/src/lib/predictive-snapshots"

const steadyMarginTrend: MarginTrendResult = {
  trend: "stable",
  label: "Stable",
  deltaMarginRate: 0,
}

const degradingRiskTrend: RiskTrendResult = {
  trend: "degrading",
  label: "En degradation",
  deltaScore: 12,
}

describe("getProfitabilityStatus", () => {
  it("retourne 'Cycle en demarrage' quand il n'y a aucune vente", () => {
    const result = getProfitabilityStatus({ revenue: 0, expenses: 300000, margin: -300000 })
    expect(result.status).toBe("Cycle en demarrage")
    expect(result.level).toBe("warning")
  })

  it("ne retourne jamais 'Exploitation non rentable' quand revenue === 0", () => {
    const result = getProfitabilityStatus({ revenue: 0, expenses: 500000, margin: -500000 })
    expect(result.status).not.toBe("Exploitation non rentable")
    expect(result.level).not.toBe("danger")
  })

  it("retourne 'Exploitation rentable' quand vente + marge positive", () => {
    const result = getProfitabilityStatus({ revenue: 500000, expenses: 300000, margin: 200000 })
    expect(result.status).toBe("Exploitation rentable")
    expect(result.level).toBe("success")
  })

  it("retourne 'Exploitation non rentable' quand vente + marge negative", () => {
    const result = getProfitabilityStatus({ revenue: 200000, expenses: 400000, margin: -200000 })
    expect(result.status).toBe("Exploitation non rentable")
    expect(result.level).toBe("danger")
  })

  it("maintient BANDE-DEMO-PROFIT en vert sur la rentabilite reelle du seed", () => {
    const result = getProfitabilityStatus({
      revenue: 1_500_000,
      expenses: 1_200_000,
      margin: 300_000,
    })

    expect(result.status).toBe("Exploitation rentable")
    expect(result.level).toBe("success")
  })
})

describe("buildBusinessDashboardViewModel", () => {
  it("aggregates KPIs and recommendations from existing predictive signals", () => {
    const view = buildBusinessDashboardViewModel({
      batches: [
        {
          id: "batch-1",
          number: "SF-001",
          farmName: "Ferme Nord",
          buildingName: "Batiment A",
          ageDay: 24,
          entryCount: 100,
          manualFeedRecordCount: 3,
          estimatedFeedRecordCount: 2,
          totalFeedRecordCount: 5,
          observedRevenueFcfa: 250000,
          observedTotalCostFcfa: 300000,
          totalMortality: 8,
          marginPrediction: {
            batchId: "batch-1",
            alertLevel: "critical",
            status: "negative",
            label: "Projection negative",
            summary: "Charges projetees superieures au revenu",
            confidence: "medium",
            projectedRevenueFcfa: 400000,
            projectedOperationalCostFcfa: 150000,
            projectedTotalCostFcfa: 520000,
            projectedProfitFcfa: -120000,
            projectedMarginRate: -23.1,
            reasons: [],
            metrics: {
              ageDay: 24,
              targetCycleDays: 45,
              remainingDays: 21,
              liveCount: 92,
              observedOperationalCostPerDayFcfa: 7000,
              benchmarkSampleSize: 2,
              benchmarkMarginRate: 6,
            },
          },
          marginTrend: steadyMarginTrend,
          mortalityPrediction: {
            batchId: "batch-1",
            riskScore: 68,
            alertLevel: "critical",
            label: "Risque mortalite eleve",
            summary: "mortalite en hausse",
            reasons: [],
            metrics: {
              recentMortality: 8,
              previousMortality: 2,
              recentMortalityRatePct: 8,
              previousMortalityRatePct: 2,
              recentAverageDailyMortalityRatePct: 2.7,
              missingDailyRecords: 1,
              activeTreatments: 1,
              overdueVaccines: 1,
              dueVaccines: 0,
            },
          },
          mortalityTrend: degradingRiskTrend,
        },
      ],
      stockItems: [
        {
          id: "feed-1",
          name: "Aliment croissance",
          type: "feed",
          farmName: "Ferme Nord",
          prediction: {
            stockId: "feed-1",
            daysToStockout: 2,
            estimatedRuptureDate: new Date("2026-04-03T00:00:00.000Z"),
            avgDailyConsumption: 25,
            unit: "kg",
            alertLevel: "critical",
            label: "Rupture dans 2 jours",
          },
        },
      ],
    })

    expect(view.kpis.totalRevenueFcfa).toBe(250000)
    expect(view.kpis.totalCostsFcfa).toBe(300000)
    expect(view.kpis.totalMarginFcfa).toBe(-50000)
    expect(view.kpis.atRiskBatchCount).toBe(1)
    expect(view.kpis.criticalStockCount).toBe(1)
    expect(view.kpis.manualFeedSharePct).toBe(60)
    expect(view.kpis.estimatedFeedSharePct).toBe(40)
    expect(view.kpis.dataQualityVerdict).toBe("Base mixte manuel + estimation")
    expect(view.kpis.marginVerdict).toBe("Exploitation non rentable")
    expect(view.kpis.stockVerdict).toBe("1 rupture critique a traiter")
    expect(view.globalStatus.level).toBe("critical")
    expect(view.globalStatus.headline).toBe("L'exploitation est sous pression")
    expect(view.priority.negativeMarginLots).toHaveLength(1)
    expect(view.priority.mortalityRiskLots).toHaveLength(1)
    expect(view.priority.criticalStockItems).toHaveLength(1)
    expect(view.batchComparison[0]?.status).toBe("critical")
    expect(view.recommendations.some((item) => (
      item.id === "margin-single"
      && item.action === "Traiter en priorite le lot en marge negative"
      && item.priority === 2
    ))).toBe(true)
    expect(view.recommendations.some((item) => (
      item.id === "stock-single"
      && item.affectedItems.includes("Aliment croissance")
    ))).toBe(true)
    expect(view.recommendations.some((item) => (
      item.id === "health-single"
      && item.action === "Surveiller de pres le lot en degradation sanitaire"
    ))).toBe(true)
  })

  it("adoucie les verdicts quand tous les lots sont encore avant J7", () => {
    const view = buildBusinessDashboardViewModel({
      batches: [
        {
          id: "batch-young",
          number: "SF-010",
          farmName: "Ferme Est",
          buildingName: "Batiment C",
          ageDay: 4,
          entryCount: 120,
          manualFeedRecordCount: 1,
          estimatedFeedRecordCount: 0,
          totalFeedRecordCount: 1,
          observedRevenueFcfa: 0,
          observedTotalCostFcfa: 80000,
          totalMortality: 1,
          marginPrediction: {
            batchId: "batch-young",
            alertLevel: "warning",
            status: "fragile",
            label: "Projection a consolider",
            summary: "Cycle encore en construction",
            confidence: "low",
            projectedRevenueFcfa: 220000,
            projectedOperationalCostFcfa: 100000,
            projectedTotalCostFcfa: 180000,
            projectedProfitFcfa: 40000,
            projectedMarginRate: 18.2,
            reasons: [],
            metrics: {
              ageDay: 4,
              targetCycleDays: 45,
              remainingDays: 41,
              liveCount: 119,
              observedOperationalCostPerDayFcfa: 4000,
              benchmarkSampleSize: 1,
              benchmarkMarginRate: 5,
            },
          },
          marginTrend: steadyMarginTrend,
          mortalityPrediction: {
            batchId: "batch-young",
            riskScore: 22,
            alertLevel: "warning",
            label: "Lecture initiale a suivre",
            summary: "Peu de recul",
            reasons: [],
            metrics: {
              recentMortality: 1,
              previousMortality: 0,
              recentMortalityRatePct: 0.8,
              previousMortalityRatePct: 0,
              recentAverageDailyMortalityRatePct: 0.2,
              missingDailyRecords: 0,
              activeTreatments: 0,
              overdueVaccines: 0,
              dueVaccines: 0,
            },
          },
          mortalityTrend: steadyMarginTrend as unknown as RiskTrendResult,
        },
      ],
      stockItems: [],
    })

    expect(view.kpis.riskVerdict).toBe("Lecture encore trop jeune avant J7")
    expect(view.kpis.mortalityVerdict).toBe("Lecture sanitaire encore precoce avant J7")
  })

  it("maintient BANDE-DEMO-LOSS en rouge/critical dans la vue Business active", () => {
    const view = buildBusinessDashboardViewModel({
      batches: [
        {
          id: "batch-demo-loss",
          number: "BANDE-DEMO-LOSS",
          farmName: "Ferme Demo Diamniadio",
          buildingName: "Poulailler Perte",
          ageDay: 31,
          entryCount: 500,
          manualFeedRecordCount: 10,
          estimatedFeedRecordCount: 0,
          totalFeedRecordCount: 10,
          observedRevenueFcfa: 0,
          observedTotalCostFcfa: 1_200_000,
          totalMortality: 36,
          marginPrediction: {
            batchId: "batch-demo-loss",
            alertLevel: "critical",
            status: "negative",
            label: "Projection negative",
            summary: "charges projetees superieures au revenu",
            confidence: "medium",
            projectedRevenueFcfa: 1_400_000,
            projectedOperationalCostFcfa: 1_306_452,
            projectedTotalCostFcfa: 1_606_452,
            projectedProfitFcfa: -206_452,
            projectedMarginRate: -12.8,
            reasons: [],
            metrics: {
              ageDay: 31,
              targetCycleDays: 45,
              remainingDays: 14,
              liveCount: 464,
              observedOperationalCostPerDayFcfa: 29_032,
              benchmarkSampleSize: 1,
              benchmarkMarginRate: 25,
            },
          },
          marginTrend: steadyMarginTrend,
          mortalityPrediction: {
            batchId: "batch-demo-loss",
            riskScore: 72,
            alertLevel: "critical",
            label: "Risque mortalite eleve",
            summary: "mortalite moyenne recente elevee",
            reasons: [],
            metrics: {
              recentMortality: 29,
              previousMortality: 0,
              recentMortalityRatePct: 5.8,
              previousMortalityRatePct: 0,
              recentAverageDailyMortalityRatePct: 0.8,
              missingDailyRecords: 0,
              activeTreatments: 0,
              overdueVaccines: 0,
              dueVaccines: 0,
            },
          },
          mortalityTrend: degradingRiskTrend,
        },
      ],
      stockItems: [],
    })

    expect(view.globalStatus.level).toBe("ok")
    expect(view.kpis.marginVerdict).toBe("Cycle en demarrage")
    expect(view.priority.negativeMarginLots[0]?.number).toBe("BANDE-DEMO-LOSS")
    expect(view.batchComparison[0]?.status).toBe("critical")
  })
})
