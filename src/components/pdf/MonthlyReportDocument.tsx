import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"
import type { MonthlyReportData } from "@/src/lib/monthly-report-view"
import type { MonthlyReportsPreviewModel } from "@/src/lib/reports-preview"

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111827",
    backgroundColor: "#ffffff",
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 32,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 16,
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },
  headerLeft: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  logo: {
    width: 96,
    height: 64,
    objectFit: "contain",
  },
  brandTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#14532d",
  },
  brandSub: {
    marginTop: 3,
    fontSize: 10,
    color: "#6b7280",
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    marginBottom: 8,
    fontSize: 9,
    color: "#6b7280",
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.8,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  kpiCard: {
    width: "31%",
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 10,
  },
  kpiLabel: {
    fontSize: 8,
    color: "#6b7280",
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  kpiSub: {
    marginTop: 3,
    fontSize: 8,
    color: "#9ca3af",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#166534",
    color: "#ffffff",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rowAlt: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#f9fafb",
  },
  cell: {
    fontSize: 9,
    color: "#374151",
  },
  headerCell: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  colLot: { width: "18%" },
  colSite: { width: "24%" },
  colCount: { width: "14%", textAlign: "right" },
  colMort: { width: "14%", textAlign: "right" },
  colFeed: { width: "15%", textAlign: "right" },
  colCost: { width: "15%", textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: "#9ca3af",
  },
  watermark: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 34,
    color: "#d97706",
    opacity: 0.12,
    transform: "rotate(-24deg)",
    fontFamily: "Helvetica-Bold",
  },
})

function fcfa(value: number) {
  return value.toLocaleString("fr-SN") + " FCFA"
}

export function MonthlyReportDocument({
  report,
  logoSrc,
  previewModel,
  watermarkText,
}: {
  report: MonthlyReportData
  logoSrc?: string
  previewModel?: MonthlyReportsPreviewModel
  watermarkText?: string
}) {
  const isPreview = previewModel != null

  return (
    <Document
      title={`Rapport mensuel ${report.periodLabel}`}
      author="SunuFarm"
      subject="Rapport mensuel de pilotage"
    >
      <Page size="A4" style={s.page}>
        {watermarkText ? <Text style={s.watermark} fixed>{watermarkText}</Text> : null}

        <View style={s.header}>
          <View style={s.headerLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logoSrc ? <Image src={logoSrc} style={s.logo} /> : null}
            <View>
              <Text style={s.brandTitle}>{isPreview ? "Rapport mensuel preview" : "Rapport mensuel"}</Text>
              <Text style={s.brandSub}>{report.organizationName}</Text>
              <Text style={s.brandSub}>{report.periodLabel}</Text>
            </View>
          </View>
          <View>
            <Text style={s.brandSub}>Genere le</Text>
            <Text style={s.brandSub}>{report.generatedAt.toLocaleDateString("fr-SN")}</Text>
          </View>
        </View>

        {isPreview && previewModel ? (
          <>
            <View style={s.section}>
              <Text style={s.sectionTitle}>Decision preview</Text>
              <View style={s.kpiGrid}>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Signal gratuit</Text>
                  <Text style={s.kpiValue}>{previewModel.statusLabel}</Text>
                  <Text style={s.kpiSub}>{previewModel.freeSignalCaption}</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Zone Starter</Text>
                  <Text style={s.kpiValue}>{previewModel.starterRangeLabel}</Text>
                  <Text style={s.kpiSub}>{previewModel.starterRangeCaption}</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Lecture Pro</Text>
                  <Text style={s.kpiValue}>Rapport complet</Text>
                  <Text style={s.kpiSub}>KPIs exacts et exports sans watermark</Text>
                </View>
              </View>
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Contexte du mois</Text>
              <View style={s.kpiGrid}>
                {previewModel.drivers.map((driver) => (
                  <View key={driver} style={s.kpiCard}>
                    <Text style={s.kpiValue}>{driver}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={s.section}>
              <Text style={s.sectionTitle}>Synthese</Text>
              <View style={s.kpiGrid}>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Revenus ventes</Text>
                  <Text style={s.kpiValue}>{fcfa(report.totalSales)}</Text>
                  <Text style={s.kpiSub}>{report.salesCount} ventes</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Depenses</Text>
                  <Text style={s.kpiValue}>{fcfa(report.totalExpenses)}</Text>
                  <Text style={s.kpiSub}>{report.expensesCount} depenses</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Resultat net</Text>
                  <Text style={s.kpiValue}>{fcfa(report.netResult)}</Text>
                  <Text style={s.kpiSub}>revenus - depenses</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Mortalite</Text>
                  <Text style={s.kpiValue}>{report.totalMortality}</Text>
                  <Text style={s.kpiSub}>{report.totalEntryCount.toLocaleString("fr-SN")} sujets suivis</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Aliment distribue</Text>
                  <Text style={s.kpiValue}>{report.totalFeedKg.toLocaleString("fr-SN")} kg</Text>
                  <Text style={s.kpiSub}>{report.dailyRecordsCount} saisies</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Lots actifs</Text>
                  <Text style={s.kpiValue}>{report.batchesActive.length}</Text>
                  <Text style={s.kpiSub}>{report.batchesClosedCount} clotures ce mois</Text>
                </View>
              </View>
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Lots suivis sur la periode</Text>
              <View style={s.tableHeader}>
                <Text style={[s.headerCell, s.colLot]}>Lot</Text>
                <Text style={[s.headerCell, s.colSite]}>Site</Text>
                <Text style={[s.headerCell, s.colCount]}>Effectif</Text>
                <Text style={[s.headerCell, s.colMort]}>Morts</Text>
                <Text style={[s.headerCell, s.colFeed]}>Aliment</Text>
                <Text style={[s.headerCell, s.colCost]}>Cout</Text>
              </View>
              {report.batchesActive.slice(0, 12).map((batch, index) => (
                <View key={batch.id} style={index % 2 === 0 ? s.row : s.rowAlt}>
                  <Text style={[s.cell, s.colLot]}>{batch.number}</Text>
                  <Text style={[s.cell, s.colSite]}>{batch.farmName} / {batch.buildingName}</Text>
                  <Text style={[s.cell, s.colCount]}>{batch.entryCount}</Text>
                  <Text style={[s.cell, s.colMort]}>{batch.periodMortality}</Text>
                  <Text style={[s.cell, s.colFeed]}>{batch.periodFeedKg}</Text>
                  <Text style={[s.cell, s.colCost]}>{fcfa(batch.totalCostFcfa)}</Text>
                </View>
              ))}
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Flux financiers</Text>
              <View style={s.kpiGrid}>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Encaissements</Text>
                  <Text style={s.kpiValue}>{fcfa(report.totalPaid)}</Text>
                  <Text style={s.kpiSub}>sur les ventes du mois</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Achats fournisseurs</Text>
                  <Text style={s.kpiValue}>{fcfa(report.totalPurchases)}</Text>
                  <Text style={s.kpiSub}>{report.purchasesCount} achats</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Comparatif ventes</Text>
                  <Text style={s.kpiValue}>
                    {report.comparison.sales.deltaPercent == null
                      ? "n/a"
                      : `${report.comparison.sales.deltaPercent.toFixed(1)}%`}
                  </Text>
                  <Text style={s.kpiSub}>vs mois precedent</Text>
                </View>
              </View>
            </View>
          </>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>SunuFarm - Pilotage avicole</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
