/**
 * SunuFarm — Tableau de bord global (Server Component)
 *
 * Responsabilités :
 *   1. Auth guard + résolution organisation active
 *   2. Fetch parallèle (4 sources) — agrégations calculées côté serveur
 *   3. Détection des lots en retard de saisie (seuil 48h UTC)
 *
 * Sources de données :
 *   - getBatches         : lots actifs (BatchSummary[]) — Server Action existante
 *   - getExpenses        : dépenses globales org (limit 100) — Server Action existante
 *   - prisma.dailyRecord.aggregate  : mortalité cumulée sur les lots actifs
 *   - prisma.dailyRecord.findMany   : batchIds avec record récent (< 48h) — détection alertes
 *
 * Limites MVP documentées :
 *   - Charges limitées aux 100 dernières dépenses (suffisant pour MVP)
 *   - Mortalité : agrégat sur tous les DailyRecords des lots actifs (pas limité dans le temps)
 *   - Taux mortalité : approx (réformes non déduites de l'effectif)
 *   - Revenus / rentabilité : non disponibles (getSales sans filtre batchId)
 */

import { redirect }            from "next/navigation"
import type { Metadata }       from "next"
import { auth }                from "@/src/auth"
import prisma                  from "@/src/lib/prisma"
import { getBatches }          from "@/src/actions/batches"
import { getExpenses }         from "@/src/actions/expenses"
import { AlertBanner }         from "../_components/AlertBanner"
import { DashboardKpis }       from "../_components/DashboardKpis"
import { ActiveBatchList }     from "../_components/ActiveBatchList"
import { MortalityChart }      from "../_components/MortalityChart"
import type { MortalityChartPoint } from "../_components/MortalityChart"

export const metadata: Metadata = { title: "Tableau de bord" }

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  // Même logique que le layout — première organisation alphabétiquement
  const membership = await prisma.userOrganization.findFirst({
    where:   { userId: session.user.id },
    select:  { organizationId: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/start")

  const { organizationId } = membership

  // ── Fetch parallèle ────────────────────────────────────────────────────
  // Les 2 requêtes Prisma directes sont nécessaires car les Server Actions
  // existantes ne couvrent pas ces agrégations multi-lots.
  const threshold48h = new Date(Date.now() - 2 * 86_400_000)

  const [
    batchesResult,
    expensesResult,
    mortalityAgg,
    recentRecordBatchIds,
    mortalityChart,
  ] = await Promise.all([
    getBatches({ organizationId, status: "ACTIVE", limit: 100 }),
    getExpenses({ organizationId, limit: 100 }),

    // Mortalité cumulée sur tous les DailyRecords des lots actifs de l'org
    prisma.dailyRecord.aggregate({
      where: {
        batch: { organizationId, status: "ACTIVE", deletedAt: null },
      },
      _sum: { mortality: true },
    }),

    // batchIds ayant au moins un record dans les 48 dernières heures
    // Utilisé pour détecter les lots en retard de saisie (seuil 48h UTC)
    prisma.dailyRecord.findMany({
      where: {
        batch: { organizationId, status: "ACTIVE", deletedAt: null },
        date:  { gte: threshold48h },
      },
      select:   { batchId: true },
      distinct: ["batchId"],
    }),

    // Mortalité agrégée par jour sur 30 jours — pour le graphique dashboard
    prisma.dailyRecord.groupBy({
      by:    ["date"],
      where: {
        batch: { organizationId, status: "ACTIVE", deletedAt: null },
        date:  { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      _sum:    { mortality: true },
      orderBy: { date: "asc" },
    }),
  ])

  const activeBatches = batchesResult.success ? batchesResult.data : []
  const expenses      = expensesResult.success ? expensesResult.data : []

  // ── Agrégations ────────────────────────────────────────────────────────
  const totalEntryCount  = activeBatches.reduce((s, b) => s + b.entryCount, 0)
  const totalCostFcfa    = activeBatches.reduce((s, b) => s + b.totalCostFcfa, 0)
  const totalExpenses    = expenses.reduce((s, e) => s + e.amountFcfa, 0)
  const totalChargesFcfa = totalCostFcfa + totalExpenses
  const totalMortality   = mortalityAgg._sum.mortality ?? 0
  const mortalityRate    = totalEntryCount > 0
    ? (totalMortality / totalEntryCount) * 100
    : 0

  // ── Détection alertes saisie ───────────────────────────────────────────
  // Un lot est "en retard" si :
  //   - ACTIVE depuis > 1 jour (daysSinceEntry > 1)
  //   - Aucun record dans les 48 dernières heures (recentRecordBatchIds)
  const recentIds = new Set(recentRecordBatchIds.map((r) => r.batchId))

  const batchesNeedingSaisie = activeBatches.filter((b) => {
    const daysSinceEntry = Math.floor(
      (Date.now() - new Date(b.entryDate).getTime()) / 86_400_000,
    )
    return daysSinceEntry > 1 && !recentIds.has(b.id)
  })

  // ── Chart mortalité 30 jours : remplissage des jours sans saisie avec 0 ──
  const mortMap = new Map(
    mortalityChart.map((r) => [
      new Date(r.date).toISOString().substring(0, 10),
      r._sum.mortality ?? 0,
    ]),
  )
  const chartData: MortalityChartPoint[] = []
  for (let i = 29; i >= 0; i--) {
    const d   = new Date(Date.now() - i * 86_400_000)
    const key = d.toISOString().substring(0, 10)
    chartData.push({
      date: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      mort: mortMap.get(key) ?? 0,
    })
  }

  // ── Tri des lots : âge décroissant (plus vieux = plus critique en premier) ─
  const sortedBatches = [...activeBatches].sort((a, b) => {
    const ageA = a.entryAgeDay + Math.floor((Date.now() - new Date(a.entryDate).getTime()) / 86_400_000)
    const ageB = b.entryAgeDay + Math.floor((Date.now() - new Date(b.entryDate).getTime()) / 86_400_000)
    return ageB - ageA
  })

  return (
    <div className="mx-auto max-w-3xl space-y-5">

      {/* ── Titre ───────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Vue d&apos;ensemble de votre exploitation avicole.
        </p>
      </div>

      {/* ── Alerte saisie manquante (conditionnelle) ─────────────────────── */}
      <AlertBanner batchesNeedingSaisie={batchesNeedingSaisie} />

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <DashboardKpis
        activeBatchCount={activeBatches.length}
        totalEntryCount={totalEntryCount}
        totalChargesFcfa={totalChargesFcfa}
        totalMortality={totalMortality}
        mortalityRate={mortalityRate}
        alertCount={batchesNeedingSaisie.length}
      />

      {/* ── Graphique mortalité 30j ─────────────────────────────────────────── */}
      <MortalityChart data={chartData} />

      {/* ── Lots actifs ──────────────────────────────────────────────────── */}
      <ActiveBatchList
        batches={sortedBatches}
        batchesNeedingSaisieIds={recentIds}
        totalActiveBatches={activeBatches.length}
      />
    </div>
  )
}
