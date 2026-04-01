/**
 * SunuFarm — Carte de rentabilité d'un lot
 *
 * Affiche les KPI financiers clés calculés par getBatchProfitability :
 *   - Revenus (SaleItems liés au lot)
 *   - Charges (achat poussins + dépenses opérationnelles)
 *   - Marge nette (profit FCFA + taux sur coûts)
 *   - Détail des charges sur 3 lignes
 *
 * La carte est toujours affichée, même sans vente :
 *   - Sans vente → marge = -totalCost, bandeau "Aucune vente liée"
 *   - Sans coûts → marge = revenu, affichage en vert
 *
 * Convention marge :
 *   rate = (profit / totalCost) × 100
 *   Ex : rate = 25 → 25 FCFA gagnés pour 100 FCFA investis.
 *   rate null → coûts = 0 (division impossible).
 */

import Link from "next/link"
import {
  formatMoneyFCFA,
  formatMoneyFCFACompact,
  formatPercent,
}            from "@/src/lib/formatters"
import type { BatchProfitability } from "@/src/actions/profitability"

interface Props {
  profitability: BatchProfitability
}

export function ProfitabilityCard({ profitability }: Props) {
  const {
    revenueFcfa,
    saleItemsCount,
    purchaseCostFcfa,
    operationalCostFcfa,
    totalCostFcfa,
    profitFcfa,
    marginRate,
    costPerBird,
    breakEvenSalePricePerLiveBirdFcfa,
    liveCount,
  } = profitability

  const isProfit   = profitFcfa >= 0
  const hasRevenue = revenueFcfa > 0

  return (
    <div className="space-y-3">

      {/* ── Titre section ─────────────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Rentabilité
      </h2>

      {/* ── KPI : Revenus / Charges / Marge ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">

        {/* Revenus */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-400 mb-1">Revenus</div>
          <div className={`text-lg font-bold tabular-nums leading-tight ${hasRevenue ? "text-green-700" : "text-gray-400"}`}>
            {formatMoneyFCFACompact(revenueFcfa)}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {saleItemsCount > 0 ? (
              <Link
                href={`/sales`}
                className="text-blue-500 hover:underline"
              >
                {saleItemsCount} ligne{saleItemsCount > 1 ? "s" : ""} de vente
              </Link>
            ) : (
              "Aucune vente liée"
            )}
          </div>
        </div>

        {/* Charges totales */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-400 mb-1">Charges totales</div>
          <div className="text-lg font-bold tabular-nums leading-tight text-gray-900">
            {formatMoneyFCFACompact(totalCostFcfa)}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {costPerBird != null
              ? `${formatMoneyFCFA(costPerBird)} / sujet`
              : "—"}
          </div>
        </div>

        {/* Marge nette */}
        <div className={`col-span-2 sm:col-span-1 rounded-xl border p-4 ${isProfit ? "border-green-200 bg-green-50" : "border-red-100 bg-red-50"}`}>
          <div className="text-xs text-gray-400 mb-1">Marge nette</div>
          <div className={`text-xl font-bold tabular-nums leading-tight ${isProfit ? "text-green-700" : "text-red-600"}`}>
            {hasRevenue || totalCostFcfa === 0
              ? formatMoneyFCFACompact(profitFcfa)
              : "—"}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {marginRate != null
              ? `${formatPercent(marginRate)} sur coûts`
              : hasRevenue
                ? "Coûts nuls"
                : "En attente de vente"}
          </div>
        </div>
      </div>

      {/* ── Détail des charges ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50 text-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <span className="text-gray-500">Prix minimum de vente</span>
            <p className="mt-0.5 text-xs text-gray-400">
              Prix moyen minimum par sujet vivant pour couvrir les couts du lot.
            </p>
          </div>
          <div className="text-right">
            <span className="font-medium text-gray-900 tabular-nums">
              {breakEvenSalePricePerLiveBirdFcfa != null
                ? `${formatMoneyFCFA(breakEvenSalePricePerLiveBirdFcfa)} / poulet`
                : "—"}
            </span>
            <p className="mt-0.5 text-xs text-gray-400">
              {liveCount > 0
                ? `Base de calcul : ${liveCount} sujet${liveCount > 1 ? "s" : ""} vivant${liveCount > 1 ? "s" : ""}`
                : "Aucun sujet vivant a valoriser"}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-gray-500">Achat poussins</span>
          <span className="font-medium text-gray-900 tabular-nums">
            {formatMoneyFCFA(purchaseCostFcfa)}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-gray-500">Dépenses opérationnelles</span>
          <span className="font-medium text-gray-900 tabular-nums">
            {operationalCostFcfa > 0
              ? formatMoneyFCFA(operationalCostFcfa)
              : <span className="text-gray-400">Aucune saisie</span>}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-3 font-semibold">
          <span className="text-gray-700">Total charges</span>
          <span className="text-gray-900 tabular-nums">
            {formatMoneyFCFA(totalCostFcfa)}
          </span>
        </div>
      </div>

    </div>
  )
}
