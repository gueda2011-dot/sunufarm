import type { MonthlyReportData } from "@/src/lib/monthly-report-view"
import type { CommercialPlan } from "@/src/lib/offer-catalog"
import { formatMoneyFCFACompact, formatNumber } from "@/src/lib/formatters"

export type ReportsPreviewStatus = "favorable" | "sous-pression" | "incertain"

export interface MonthlyReportsPreviewModel {
  status: ReportsPreviewStatus
  statusLabel: string
  headline: string
  explanation: string
  starterRangeLabel: string
  starterRangeCaption: string
  freeSignalCaption: string
  drivers: string[]
}

export function hasMonthlyReportsPreviewData(report: MonthlyReportData): boolean {
  return (
    report.dailyRecordsCount >= 3 &&
    (
      report.expensesCount > 0 ||
      report.salesCount > 0 ||
      report.totalMortality > 0
    )
  )
}

function roundDown(value: number, step: number): number {
  return Math.floor(value / step) * step
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

function getStatus(report: MonthlyReportData): ReportsPreviewStatus {
  if (report.salesCount > 0 && report.netResult >= 0) {
    return "favorable"
  }

  if (report.netResult < 0 || (report.totalMortality > 0 && report.salesCount === 0)) {
    return "sous-pression"
  }

  return "incertain"
}

export function buildMonthlyReportsPreview(
  report: MonthlyReportData,
  commercialPlan: CommercialPlan,
): MonthlyReportsPreviewModel {
  const status = getStatus(report)
  const rangeStep = 25_000
  const rangeCenter = report.netResult
  const rangeLow = roundDown(rangeCenter * 0.85, rangeStep)
  const rangeHigh = roundUp(rangeCenter * 1.15, rangeStep)

  const statusCopy: Record<ReportsPreviewStatus, {
    label: string
    headline: string
    explanation: string
    freeSignalCaption: string
  }> = {
    favorable: {
      label: "Mois plutot favorable",
      headline: "Le mois commence a montrer une trajectoire economique favorable.",
      explanation: "Les activites enregistrees suggerent une dynamique saine, mais le rapport complet reste reserve aux plans Pro et Business.",
      freeSignalCaption: "Signal simple pour savoir si le mois semble soutenir la marge.",
    },
    "sous-pression": {
      label: "Mois sous pression",
      headline: "Le mois montre deja des signes de pression economique ou operationnelle.",
      explanation: "Les charges, la mortalite ou le manque de ventes peuvent peser sur la marge. Le rapport complet aide a arbitrer plus vite.",
      freeSignalCaption: "Signal simple pour sentir un risque de derive ou de perte.",
    },
    incertain: {
      label: "Mois encore incertain",
      headline: "Le mois devient lisible, mais la conclusion economique reste encore prudente.",
      explanation: "Vous commencez a voir la tendance sans ouvrir toute l'analyse mensuelle. Pro et Business debloquent la lecture exacte et complete.",
      freeSignalCaption: "Signal simple pour suivre la tendance sans lecture complete.",
    },
  }

  return {
    status,
    statusLabel: statusCopy[status].label,
    headline: statusCopy[status].headline,
    explanation: statusCopy[status].explanation,
    freeSignalCaption: statusCopy[status].freeSignalCaption,
    starterRangeLabel:
      commercialPlan === "STARTER"
        ? `${formatMoneyFCFACompact(rangeLow)} a ${formatMoneyFCFACompact(rangeHigh)}`
        : "Visible en Starter",
    starterRangeCaption:
      commercialPlan === "STARTER"
        ? "Zone estimative du resultat du mois, avec approximation volontaire."
        : "Passez a Starter pour voir une zone estimative du resultat mensuel.",
    drivers: [
      `${report.batchesActive.length} lot${report.batchesActive.length > 1 ? "s" : ""} suivi${report.batchesActive.length > 1 ? "s" : ""} sur la periode`,
      `${report.salesCount} vente${report.salesCount > 1 ? "s" : ""} et ${report.expensesCount} depense${report.expensesCount > 1 ? "s" : ""} saisie${report.expensesCount > 1 ? "s" : ""}`,
      `${formatNumber(report.totalMortality)} mort${report.totalMortality > 1 ? "s" : ""} et ${report.dailyRecordsCount} saisie${report.dailyRecordsCount > 1 ? "s" : ""} sur le mois`,
    ],
  }
}
