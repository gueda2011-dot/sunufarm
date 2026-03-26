/**
 * SunuFarm — Document PDF rapport de lot
 *
 * Rendu avec @react-pdf/renderer — utilisé UNIQUEMENT dans les API routes
 * (jamais importé côté client).
 *
 * Sections :
 *   1. En-tête  : SunuFarm + organisation + date de génération
 *   2. Lot       : numéro, type, statut, localisation, dates, effectif
 *   3. KPI       : effectif vivant, mortalité, taux de mortalité, aliment total
 *   4. Rentabilité (si disponible) : revenus, charges, marge
 *   5. Saisies   : 10 dernières saisies journalières (tableau)
 *   6. Footer    : page + mention SunuFarm
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer"
import type { BatchProfitability } from "@/src/actions/profitability"

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  page: {
    fontFamily:      "Helvetica",
    fontSize:        10,
    color:           "#111827",
    backgroundColor: "#ffffff",
    paddingTop:      40,
    paddingBottom:   50,
    paddingHorizontal: 40,
  },

  // ── Header
  header: {
    flexDirection:   "row",
    justifyContent:  "space-between",
    alignItems:      "flex-start",
    marginBottom:    24,
    paddingBottom:   16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  brand:     { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#16a34a" },
  orgName:   { fontSize: 11, color: "#6b7280", marginTop: 2 },
  genDate:   { fontSize: 9, color: "#9ca3af", textAlign: "right", marginTop: 4 },

  // ── Section
  section:       { marginBottom: 18 },
  sectionTitle:  {
    fontSize:     9,
    fontFamily:   "Helvetica-Bold",
    color:        "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom:  8,
  },

  // ── Info card (lot header)
  infoCard: {
    backgroundColor: "#f9fafb",
    borderRadius:    8,
    padding:         14,
    marginBottom:    4,
  },
  batchNumber: {
    fontSize:   20,
    fontFamily: "Helvetica-Bold",
    color:      "#111827",
    marginBottom: 4,
  },
  batchMeta: { color: "#6b7280", fontSize: 10, marginBottom: 2 },

  // ── Badge statut
  badgeRow:  { flexDirection: "row", marginTop: 8 },
  badge: {
    fontSize:     9,
    fontFamily:   "Helvetica-Bold",
    paddingVertical:   3,
    paddingHorizontal: 8,
    borderRadius:  10,
  },
  badgeActive:      { backgroundColor: "#dcfce7", color: "#15803d" },
  badgeClosed:      { backgroundColor: "#f3f4f6", color: "#6b7280" },
  badgeSold:        { backgroundColor: "#dbeafe", color: "#1d4ed8" },
  badgeSlaughtered: { backgroundColor: "#ffedd5", color: "#c2410c" },

  // ── KPI grid
  kpiGrid:   { flexDirection: "row", gap: 8 },
  kpiBox: {
    flex:           1,
    backgroundColor: "#f9fafb",
    borderRadius:   8,
    padding:        10,
  },
  kpiLabel: { fontSize: 8, color: "#9ca3af", marginBottom: 3 },
  kpiValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#111827" },
  kpiSub:   { fontSize: 8, color: "#9ca3af", marginTop: 2 },

  // ── Rentabilité
  profitRow:  {
    flexDirection:   "row",
    justifyContent:  "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  profitLabel:  { color: "#6b7280" },
  profitValue:  { fontFamily: "Helvetica-Bold", color: "#111827" },
  profitGreen:  { fontFamily: "Helvetica-Bold", color: "#16a34a" },
  profitRed:    { fontFamily: "Helvetica-Bold", color: "#dc2626" },

  // ── Table saisies
  tableHeader: {
    flexDirection:    "row",
    backgroundColor:  "#f3f4f6",
    paddingVertical:  5,
    paddingHorizontal: 8,
    borderRadius:     4,
    marginBottom:     2,
  },
  tableRow: {
    flexDirection:    "row",
    paddingVertical:  5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f9fafb",
  },
  tableRowAlt: {
    flexDirection:    "row",
    paddingVertical:  5,
    paddingHorizontal: 8,
    backgroundColor:  "#fafafa",
  },
  thCell:  { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#6b7280" },
  tdCell:  { fontSize: 9, color: "#374151" },

  colDate: { width: "22%" },
  colMort: { width: "18%", textAlign: "right" },
  colFeed: { width: "22%", textAlign: "right" },
  colWater:{ width: "20%", textAlign: "right" },
  colObs:  { width: "18%", textAlign: "right" },

  // ── Footer
  footer: {
    position:   "absolute",
    bottom:     20,
    left:       40,
    right:      40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
  footerText: { fontSize: 8, color: "#9ca3af" },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fcfa(n: number): string {
  return n.toLocaleString("fr-SN") + " FCFA"
}

function fcfaCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M FCFA`
  if (abs >= 1_000)     return `${sign}${Math.round(abs / 1_000)}K FCFA`
  return `${sign}${abs} FCFA`
}

function pct(n: number | null): string {
  if (n == null) return "—"
  return `${n.toFixed(1)}%`
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const date = d instanceof Date ? d : new Date(d)
  return date.toLocaleDateString("fr-SN", { day: "2-digit", month: "short", year: "numeric" })
}

function fmtShortDate(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const date = d instanceof Date ? d : new Date(d)
  return date.toLocaleDateString("fr-SN", { day: "2-digit", month: "2-digit" })
}

const TYPE_LABELS: Record<string, string> = {
  CHAIR:        "Poulet de chair",
  PONDEUSE:     "Pondeuse",
  REPRODUCTEUR: "Reproducteur",
}

const STATUS_CONFIG: Record<string, { label: string; style: ReturnType<typeof StyleSheet.create>[string] }> = {
  ACTIVE:      { label: "Actif",   style: s.badgeActive },
  CLOSED:      { label: "Clôturé", style: s.badgeClosed },
  SOLD:        { label: "Vendu",   style: s.badgeSold },
  SLAUGHTERED: { label: "Abattu",  style: s.badgeSlaughtered },
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DailyRow {
  date:        Date
  mortality:   number
  feedKg:      number
  waterLiters: number | null
  observations?: string | null
}

interface Props {
  orgName:        string
  batchNumber:    string
  batchType:      string
  batchStatus:    string
  farmName:       string
  buildingName:   string
  entryDate:      Date
  entryCount:     number
  closedAt?:      Date | null
  closeReason?:   string | null
  ageDay:         number
  totalMortality: number
  mortalityRate:  number
  liveCount:      number
  totalFeedKg:    number
  profitability?: BatchProfitability | null
  recentRecords:  DailyRow[]
  generatedAt:    Date
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function BatchReportDocument({
  orgName,
  batchNumber,
  batchType,
  batchStatus,
  farmName,
  buildingName,
  entryDate,
  entryCount,
  closedAt,
  closeReason,
  ageDay,
  totalMortality,
  mortalityRate,
  liveCount,
  totalFeedKg,
  profitability,
  recentRecords,
  generatedAt,
}: Props) {
  const statusCfg = STATUS_CONFIG[batchStatus] ?? STATUS_CONFIG.CLOSED
  const isActive  = batchStatus === "ACTIVE"

  return (
    <Document
      title={`Rapport lot ${batchNumber}`}
      author="SunuFarm"
      subject="Rapport de lot d'élevage"
    >
      <Page size="A4" style={s.page}>

        {/* ── En-tête ─────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}>SunuFarm</Text>
            <Text style={s.orgName}>{orgName}</Text>
          </View>
          <View>
            <Text style={s.genDate}>Généré le {fmtDate(generatedAt)}</Text>
            <Text style={[s.genDate, { marginTop: 2 }]}>Rapport de lot</Text>
          </View>
        </View>

        {/* ── Informations lot ────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Lot d'élevage</Text>
          <View style={s.infoCard}>
            <Text style={s.batchNumber}>{batchNumber}</Text>
            <Text style={s.batchMeta}>{TYPE_LABELS[batchType] ?? batchType}</Text>
            <Text style={s.batchMeta}>{farmName} · {buildingName}</Text>
            <Text style={s.batchMeta}>
              Entrée : {fmtDate(entryDate)} · Effectif initial : {entryCount.toLocaleString("fr-SN")} sujets
            </Text>
            {!isActive && closedAt && (
              <Text style={s.batchMeta}>
                Clôturé le : {fmtDate(closedAt)}{closeReason ? ` — ${closeReason}` : ""}
              </Text>
            )}
            <View style={s.badgeRow}>
              <Text style={[s.badge, statusCfg.style]}>{statusCfg.label}</Text>
            </View>
          </View>
        </View>

        {/* ── KPI production ──────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Indicateurs de production</Text>
          <View style={s.kpiGrid}>
            <View style={s.kpiBox}>
              <Text style={s.kpiLabel}>{isActive ? "Âge aujourd'hui" : "Durée cycle"}</Text>
              <Text style={s.kpiValue}>Jour {ageDay}</Text>
            </View>
            <View style={s.kpiBox}>
              <Text style={s.kpiLabel}>Effectif vivant</Text>
              <Text style={s.kpiValue}>{liveCount.toLocaleString("fr-SN")}</Text>
              <Text style={s.kpiSub}>sujets</Text>
            </View>
            <View style={s.kpiBox}>
              <Text style={s.kpiLabel}>Mortalité cumulée</Text>
              <Text style={[s.kpiValue, { color: totalMortality > 0 ? "#dc2626" : "#111827" }]}>
                {totalMortality}
              </Text>
              <Text style={s.kpiSub}>{pct(mortalityRate)} du lot</Text>
            </View>
            <View style={s.kpiBox}>
              <Text style={s.kpiLabel}>Aliment total</Text>
              <Text style={s.kpiValue}>{totalFeedKg.toLocaleString("fr-SN")}</Text>
              <Text style={s.kpiSub}>kg distribués</Text>
            </View>
          </View>
        </View>

        {/* ── Rentabilité ─────────────────────────────────────────────────── */}
        {profitability && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Rentabilité</Text>
            <View>
              <View style={s.profitRow}>
                <Text style={s.profitLabel}>Revenus</Text>
                <Text style={s.profitGreen}>{fcfa(profitability.revenueFcfa)}</Text>
              </View>
              <View style={s.profitRow}>
                <Text style={s.profitLabel}>Achat poussins</Text>
                <Text style={s.profitValue}>{fcfa(profitability.purchaseCostFcfa)}</Text>
              </View>
              <View style={s.profitRow}>
                <Text style={s.profitLabel}>Dépenses opérationnelles</Text>
                <Text style={s.profitValue}>{fcfa(profitability.operationalCostFcfa)}</Text>
              </View>
              <View style={s.profitRow}>
                <Text style={s.profitLabel}>Total charges</Text>
                <Text style={s.profitValue}>{fcfa(profitability.totalCostFcfa)}</Text>
              </View>
              <View style={[s.profitRow, { borderBottomWidth: 0, marginTop: 4 }]}>
                <Text style={[s.profitLabel, { fontFamily: "Helvetica-Bold", color: "#111827" }]}>
                  Marge nette
                </Text>
                <Text style={profitability.profitFcfa >= 0 ? s.profitGreen : s.profitRed}>
                  {fcfaCompact(profitability.profitFcfa)}
                  {profitability.marginRate != null
                    ? `  (${pct(profitability.marginRate)})`
                    : ""}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Saisies journalières ─────────────────────────────────────────── */}
        {recentRecords.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              Dernières saisies journalières ({recentRecords.length})
            </Text>

            {/* En-tête table */}
            <View style={s.tableHeader}>
              <Text style={[s.thCell, s.colDate]}>Date</Text>
              <Text style={[s.thCell, s.colMort]}>Morts</Text>
              <Text style={[s.thCell, s.colFeed]}>Aliment (kg)</Text>
              <Text style={[s.thCell, s.colWater]}>Eau (L)</Text>
              <Text style={[s.thCell, s.colObs]}>Notes</Text>
            </View>

            {/* Lignes */}
            {recentRecords.map((r, i) => (
              <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                <Text style={[s.tdCell, s.colDate]}>{fmtShortDate(r.date)}</Text>
                <Text style={[s.tdCell, s.colMort, { color: r.mortality > 0 ? "#dc2626" : "#9ca3af" }]}>
                  {r.mortality}
                </Text>
                <Text style={[s.tdCell, s.colFeed]}>
                  {r.feedKg % 1 === 0 ? r.feedKg : r.feedKg.toFixed(1)}
                </Text>
                <Text style={[s.tdCell, s.colWater]}>
                  {r.waterLiters != null ? r.waterLiters : "—"}
                </Text>
                <Text style={[s.tdCell, s.colObs]}>
                  {r.observations ? r.observations.substring(0, 20) : "—"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>SunuFarm — Notre Ferme</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} / ${totalPages}`
            }
          />
        </View>

      </Page>
    </Document>
  )
}
