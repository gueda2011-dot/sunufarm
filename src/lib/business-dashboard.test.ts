import { describe, expect, it } from "vitest"
import { buildBusinessDashboardViewModel } from "@/src/lib/business-dashboard"
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

describe("buildBusinessDashboardViewModel", () => {
  it("aggregates KPIs and recommendations from existing predictive signals", () => {
    const view = buildBusinessDashboardViewModel({
      batches: [
        {
          id: "batch-1",
          number: "SF-001",
          farmName: "Ferme Nord",
          buildingName: "Batiment A",
          entryCount: 100,
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
})
