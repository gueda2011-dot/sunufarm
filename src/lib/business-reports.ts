import ExcelJS from "exceljs"
import {
  formatMoneyFCFA,
  formatNumber,
  formatPercent,
} from "@/src/lib/formatters"
import type { BusinessDashboardViewModel } from "@/src/lib/business-dashboard"

function autosizeColumns(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    let maxLength = 12
    if (!column || !column.eachCell) return

    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value
      if (value == null) return
      const text =
        typeof value === "object" && "richText" in value
          ? value.richText.map((part) => part.text).join("")
          : String(value)

      maxLength = Math.max(maxLength, Math.min(text.length + 2, 42))
    })

    column.width = maxLength
  })
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } }
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF166534" },
  }
}

function addSummaryRow(
  worksheet: ExcelJS.Worksheet,
  label: string,
  value: string | number,
  detail = "",
) {
  const row = worksheet.addRow([label, value, detail])
  row.getCell(1).font = { bold: true, color: { argb: "FF374151" } }
  row.getCell(2).alignment = { horizontal: "right" }
  row.getCell(3).font = { color: { argb: "FF6B7280" }, italic: true }
}

function sanitizeSpreadsheetValue(value: string | number) {
  if (typeof value !== "string") return value

  const trimmed = value.trimStart()
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${value}`
  }

  return value
}

export function buildBusinessReportCsv(input: {
  organizationName: string
  generatedAt: Date
  overview: BusinessDashboardViewModel
}) {
  const { organizationName, generatedAt, overview } = input
  const toCsvRow = (values: Array<string | number>) => (
    values
      .map((value) => sanitizeSpreadsheetValue(value))
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",")
  )

  const lines = [
    toCsvRow(["Section", "Valeur", "Detail"]),
    toCsvRow(["Organisation", organizationName, "Vue Business transverse"]),
    toCsvRow(["Genere le", generatedAt.toISOString(), "Timestamp UTC"]),
    toCsvRow(["Statut global", overview.globalStatus.label, overview.globalStatus.headline]),
    toCsvRow(["Score exploitation", overview.globalStatus.score, overview.globalStatus.primaryAction]),
    toCsvRow(["Chiffre d'affaires total FCFA", overview.kpis.totalRevenueFcfa, overview.kpis.marginVerdict]),
    toCsvRow(["Couts totaux FCFA", overview.kpis.totalCostsFcfa, "Achats + depenses observees"]),
    toCsvRow(["Marge totale FCFA", overview.kpis.totalMarginFcfa, "Recettes - couts"]),
    toCsvRow(["Taux mortalite global", overview.kpis.globalMortalityRate ?? "", overview.kpis.mortalityVerdict]),
    toCsvRow(["Lots actifs", overview.kpis.activeBatchCount, "Exploitation en cours"]),
    toCsvRow(["Lots a risque", overview.kpis.atRiskBatchCount, overview.kpis.riskVerdict]),
    toCsvRow(["Stocks critiques", overview.kpis.criticalStockCount, overview.kpis.stockVerdict]),
    "",
    toCsvRow(["Lots qui menacent la marge", "Ferme", "Signal"]),
    ...overview.priority.negativeMarginLots.map((lot) => (
      toCsvRow([lot.number, lot.farmName, lot.detail])
    )),
    "",
    toCsvRow(["Pressions sanitaires", "Ferme", "Signal"]),
    ...overview.priority.mortalityRiskLots.map((lot) => (
      toCsvRow([lot.number, lot.farmName, lot.detail])
    )),
    "",
    toCsvRow(["Approvisionnements sous tension", "Type", "Signal"]),
    ...overview.priority.criticalStockItems.map((item) => (
      toCsvRow([item.name, item.type === "feed" ? "Aliment" : "Medicament", item.label])
    )),
    "",
    toCsvRow(["Lot", "Ferme", "Marge projetee FCFA", "Risque mortalite", "Statut global"]),
    ...overview.batchComparison.map((row) => (
      toCsvRow([
        row.number,
        row.farmName,
        row.projectedMarginFcfa,
        row.mortalityRiskScore,
        row.statusLabel,
      ])
    )),
    "",
    toCsvRow(["Priorite", "Decision", "Action", "Description", "Concerne"]),
    ...overview.recommendations.map((item) => (
      toCsvRow([
        item.priority,
        item.title,
        item.action,
        item.description,
        item.affectedItems.join(" | "),
      ])
    )),
  ]

  return lines.join("\n")
}

export async function buildBusinessReportWorkbook(input: {
  organizationName: string
  generatedAt: Date
  overview: BusinessDashboardViewModel
}) {
  const { organizationName, generatedAt, overview } = input
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "SunuFarm"
  workbook.company = "SunuFarm"
  workbook.created = generatedAt
  workbook.modified = generatedAt
  workbook.subject = "Vue Business transverse"
  workbook.title = `SunuFarm Business - ${organizationName}`

  const summarySheet = workbook.addWorksheet("Synthese", {
    views: [{ state: "frozen", ySplit: 4 }],
  })
  summarySheet.mergeCells("A1:C1")
  summarySheet.getCell("A1").value = `SunuFarm Business - ${organizationName}`
  summarySheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF14532D" } }
  summarySheet.getCell("A2").value = "Resume dirigeant de l'exploitation"
  summarySheet.getCell("A3").value = `Genere le ${generatedAt.toISOString()}`
  summarySheet.addRow([])
  styleHeader(summarySheet.addRow(["Indicateur", "Valeur", "Lecture"]))
  addSummaryRow(summarySheet, "Statut global", overview.globalStatus.label, overview.globalStatus.headline)
  addSummaryRow(summarySheet, "Score exploitation", overview.globalStatus.score, overview.globalStatus.primaryAction)
  addSummaryRow(summarySheet, "Chiffre d'affaires", formatMoneyFCFA(overview.kpis.totalRevenueFcfa), overview.kpis.marginVerdict)
  addSummaryRow(summarySheet, "Couts totaux", formatMoneyFCFA(overview.kpis.totalCostsFcfa), "Achats + depenses observees")
  addSummaryRow(summarySheet, "Marge totale", formatMoneyFCFA(overview.kpis.totalMarginFcfa), "Recettes - couts")
  addSummaryRow(summarySheet, "Taux mortalite global", overview.kpis.globalMortalityRate == null ? "-" : formatPercent(overview.kpis.globalMortalityRate), overview.kpis.mortalityVerdict)
  addSummaryRow(summarySheet, "Lots a risque", formatNumber(overview.kpis.atRiskBatchCount), overview.kpis.riskVerdict)
  addSummaryRow(summarySheet, "Stocks critiques", formatNumber(overview.kpis.criticalStockCount), overview.kpis.stockVerdict)
  autosizeColumns(summarySheet)

  const prioritySheet = workbook.addWorksheet("Signaux prioritaires", {
    views: [{ state: "frozen", ySplit: 1 }],
  })
  styleHeader(prioritySheet.addRow(["Type", "Nom", "Ferme", "Signal", "Niveau"]))
  overview.priority.negativeMarginLots.forEach((lot) => {
    prioritySheet.addRow([
      "Marge negative",
      sanitizeSpreadsheetValue(lot.number),
      sanitizeSpreadsheetValue(lot.farmName),
      sanitizeSpreadsheetValue(lot.detail),
      sanitizeSpreadsheetValue(lot.level),
    ])
  })
  overview.priority.mortalityRiskLots.forEach((lot) => {
    prioritySheet.addRow([
      "Risque mortalite",
      sanitizeSpreadsheetValue(lot.number),
      sanitizeSpreadsheetValue(lot.farmName),
      sanitizeSpreadsheetValue(lot.detail),
      sanitizeSpreadsheetValue(lot.level),
    ])
  })
  overview.priority.criticalStockItems.forEach((item) => {
    prioritySheet.addRow([
      "Stock critique",
      sanitizeSpreadsheetValue(item.name),
      sanitizeSpreadsheetValue(item.farmName),
      sanitizeSpreadsheetValue(item.label),
      "critical",
    ])
  })
  autosizeColumns(prioritySheet)

  const batchesSheet = workbook.addWorksheet("Lots actifs", {
    views: [{ state: "frozen", ySplit: 1 }],
  })
  styleHeader(batchesSheet.addRow(["Lot", "Ferme", "Batiment", "Marge projetee", "Taux marge", "Risque mortalite", "Statut global"]))
  overview.batchComparison.forEach((row) => {
    batchesSheet.addRow([
      row.number,
      sanitizeSpreadsheetValue(row.farmName),
      sanitizeSpreadsheetValue(row.buildingName),
      row.projectedMarginFcfa,
      row.projectedMarginRate == null ? "-" : `${row.projectedMarginRate}%`,
      `${row.mortalityRiskScore}/100`,
      sanitizeSpreadsheetValue(row.statusLabel),
    ])
  })
  autosizeColumns(batchesSheet)

  const recommendationsSheet = workbook.addWorksheet("Decisions", {
    views: [{ state: "frozen", ySplit: 1 }],
  })
  styleHeader(recommendationsSheet.addRow(["Priorite", "Decision", "Action", "Description", "Concerne"]))
  overview.recommendations.forEach((item) => {
    recommendationsSheet.addRow([
      item.priority,
      sanitizeSpreadsheetValue(item.title),
      sanitizeSpreadsheetValue(item.action),
      sanitizeSpreadsheetValue(item.description),
      sanitizeSpreadsheetValue(item.affectedItems.join(", ")),
    ])
  })
  autosizeColumns(recommendationsSheet)

  return workbook
}
