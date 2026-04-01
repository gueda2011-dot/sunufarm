/**
 * SunuFarm - Carte de rentabilite d'un lot
 *
 * Affiche les KPI financiers cles calcules par getBatchProfitability :
 *   - Revenus (SaleItems lies au lot)
 *   - Charges (achat poussins + depenses operationnelles)
 *   - Marge nette (profit FCFA + taux sur couts)
 *   - Detail des charges sur 3 lignes
 *
 * La carte est toujours affichee, meme sans vente :
 *   - Sans vente -> marge = -totalCost, bandeau "Aucune vente liee"
 *   - Sans couts -> marge = revenu, affichage en vert
 *
 * Convention marge :
 *   rate = (profit / totalCost) x 100
 *   Ex : rate = 25 -> 25 FCFA gagnes pour 100 FCFA investis.
 *   rate null -> couts = 0 (division impossible).
 */

import Link from "next/link"
import {
  formatMoneyFCFA,
  formatMoneyFCFACompact,
  formatPercent,
} from "@/src/lib/formatters"
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

  const isProfit = profitFcfa >= 0
  const hasRevenue = revenueFcfa > 0

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        Rentabilite
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-1 text-xs text-gray-400">Revenus</div>
          <div className={`text-lg font-bold leading-tight tabular-nums ${hasRevenue ? "text-green-700" : "text-gray-400"}`}>
            {formatMoneyFCFACompact(revenueFcfa)}
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {saleItemsCount > 0 ? (
              <Link
                href="/sales"
                className="text-blue-500 hover:underline"
              >
                {saleItemsCount} ligne{saleItemsCount > 1 ? "s" : ""} de vente
              </Link>
            ) : (
              "Aucune vente liee"
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-1 text-xs text-gray-400">Charges totales</div>
          <div className="text-lg font-bold leading-tight text-gray-900 tabular-nums">
            {formatMoneyFCFACompact(totalCostFcfa)}
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {costPerBird != null
              ? `${formatMoneyFCFA(costPerBird)} / sujet`
              : "-"}
          </div>
        </div>

        <div className={`col-span-2 rounded-xl border p-4 sm:col-span-1 ${isProfit ? "border-green-200 bg-green-50" : "border-red-100 bg-red-50"}`}>
          <div className="mb-1 text-xs text-gray-400">Marge nette</div>
          <div className={`text-xl font-bold leading-tight tabular-nums ${isProfit ? "text-green-700" : "text-red-600"}`}>
            {hasRevenue || totalCostFcfa === 0
              ? formatMoneyFCFACompact(profitFcfa)
              : "-"}
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {marginRate != null
              ? `${formatPercent(marginRate)} sur couts`
              : hasRevenue
                ? "Couts nuls"
                : "En attente de vente"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Prix minimum de vente
            </p>
            <p className="mt-1 text-sm text-amber-900">
              Le prix moyen minimum par poulet vivant pour couvrir les couts du lot.
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold leading-tight text-amber-950 tabular-nums">
              {breakEvenSalePricePerLiveBirdFcfa != null
                ? formatMoneyFCFA(breakEvenSalePricePerLiveBirdFcfa)
                : "-"}
            </p>
            <p className="mt-1 text-xs font-medium text-amber-700">
              {breakEvenSalePricePerLiveBirdFcfa != null
                ? "par poulet"
                : "indisponible"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-amber-800">
          {liveCount > 0
            ? `Base de calcul : ${liveCount} sujet${liveCount > 1 ? "s" : ""} vivant${liveCount > 1 ? "s" : ""}.`
            : "Aucun sujet vivant a valoriser pour estimer un prix minimum de vente."}
        </p>
      </div>

      <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 bg-white text-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-gray-500">Achat poussins</span>
          <span className="font-medium text-gray-900 tabular-nums">
            {formatMoneyFCFA(purchaseCostFcfa)}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-gray-500">Depenses operationnelles</span>
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
