import { describe, expect, it } from "vitest"
import { buildBusinessReportCsv } from "@/src/lib/business-reports"
import type { BusinessDashboardViewModel } from "@/src/lib/business-dashboard"

function buildOverview(): BusinessDashboardViewModel {
  return {
    globalStatus: {
      level: "warning",
      label: "Exploitation sous vigilance",
      headline: "Des arbitrages rapides sont necessaires",
      summary: "La situation reste pilotable, mais plusieurs sujets peuvent vite se transformer en perte.",
      primaryAction: "Prioriser les lots fragiles et securiser les approvisionnements sensibles.",
      score: 71,
    },
    kpis: {
      totalRevenueFcfa: 500000,
      totalCostsFcfa: 380000,
      totalMarginFcfa: 120000,
      globalMortalityRate: 2.4,
      activeBatchCount: 3,
      atRiskBatchCount: 2,
      criticalStockCount: 1,
      marginVerdict: "Marge sous pression",
      riskVerdict: "2 lots demandent une action rapide",
      stockVerdict: "1 rupture critique a traiter",
      mortalityVerdict: "Sante a surveiller",
    },
    priority: {
      negativeMarginLots: [
        {
          id: "batch-1",
          number: "SF-001",
          farmName: "Ferme Centre",
          label: "Projection negative",
          detail: "Charges projetees superieures au revenu",
          level: "critical",
        },
      ],
      mortalityRiskLots: [
        {
          id: "batch-2",
          number: "SF-002",
          farmName: "Ferme Sud",
          label: "Risque mortalite eleve",
          detail: "68/100 - mortalite en hausse",
          level: "critical",
        },
      ],
      criticalStockItems: [
        {
          id: "stock-1",
          name: 'Aliment "croissance"',
          type: "feed",
          farmName: "Ferme Centre",
          label: "Rupture dans 2 jours",
          daysToStockout: 2,
        },
      ],
    },
    batchComparison: [
      {
        id: "batch-1",
        number: "SF-001",
        farmName: "Ferme Centre",
        buildingName: "Batiment A",
        projectedMarginFcfa: -25000,
        projectedMarginRate: -6.3,
        marginLabel: "Projection negative",
        mortalityRiskScore: 68,
        mortalityLabel: "Risque mortalite eleve",
        status: "critical",
        statusLabel: "Priorite immediate",
      },
    ],
    recommendations: [
      {
        id: "margin-single",
        priority: 2,
        title: "Traiter le lot en marge negative",
        action: "Verifier les charges recentes du lot",
        description: "Verifier les charges recentes.",
        tone: "warning",
        affectedItems: ["SF-001"],
      },
    ],
  }
}

describe("business-reports", () => {
  it("genere un CSV exploitable et echappe les guillemets", () => {
    const csv = buildBusinessReportCsv({
      organizationName: "Ferme Premium",
      generatedAt: new Date("2026-04-01T00:00:00.000Z"),
      overview: buildOverview(),
    })

    expect(csv).toContain('"Organisation","Ferme Premium","Vue Business transverse"')
    expect(csv).toContain('"Statut global","Exploitation sous vigilance","Des arbitrages rapides sont necessaires"')
    expect(csv).toContain('"Score exploitation","71","Prioriser les lots fragiles et securiser les approvisionnements sensibles."')
    expect(csv).toContain('"Chiffre d\'affaires total FCFA","500000","Marge sous pression"')
    expect(csv).toContain('"SF-001","Ferme Centre","Charges projetees superieures au revenu"')
    expect(csv).toContain('"Aliment ""croissance""","Aliment","Rupture dans 2 jours"')
    expect(csv).toContain('"2","Traiter le lot en marge negative","Verifier les charges recentes du lot","Verifier les charges recentes.","SF-001"')
  })
})
