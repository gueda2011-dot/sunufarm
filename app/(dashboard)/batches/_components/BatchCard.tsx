/**
 * SunuFarm — Carte de lot d'élevage
 *
 * Composant de présentation pur — reçoit un BatchSummary, affiche les données
 * disponibles uniquement. Aucun KPI inventé.
 *
 * KPI affichés (ce qui existe dans BatchSummary) :
 *   - Âge (jours) pour les lots ACTIVE — calculé depuis entryDate + entryAgeDay
 *   - Durée cycle pour les lots terminés — calculé depuis closedAt - entryDate
 *   - Effectif initial
 *   - Date d'entrée
 *   - Coût d'achat (totalCostFcfa) si > 0
 *   - Nombre de saisies journalières (_count.dailyRecords)
 *   - Badge "Aucune saisie" si lot ACTIVE + > 1 jour + 0 saisies
 *
 * KPI absents de BatchSummary et donc NON affichés :
 *   mortalité cumulée, coûts opérationnels, revenus, rentabilité nette.
 */

import Link                              from "next/link"
import { useState }                      from "react"
import { cn }                            from "@/src/lib/utils"
import {
  formatMoneyFCFACompact,
  formatDate,
  formatNumber,
}                                        from "@/src/lib/formatters"
import { batchAgeDay, diffDays }         from "@/src/lib/utils"
import type { BatchSummary }             from "@/src/actions/batches"

// ---------------------------------------------------------------------------
// Constantes d'affichage
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  CHAIR:        "Poulet de chair",
  PONDEUSE:     "Pondeuse",
  REPRODUCTEUR: "Reproducteur",
}

const STATUS_CONFIG: Record<string, {
  label: string
  dotClass: string
  bgClass: string
  textClass: string
}> = {
  ACTIVE:      { label: "Actif",   dotClass: "bg-green-500",  bgClass: "bg-green-50",  textClass: "text-green-700"  },
  CLOSED:      { label: "Clôturé", dotClass: "bg-gray-400",   bgClass: "bg-gray-100",  textClass: "text-gray-600"   },
  SOLD:        { label: "Vendu",   dotClass: "bg-blue-500",   bgClass: "bg-blue-50",   textClass: "text-blue-700"   },
  SLAUGHTERED: { label: "Abattu",  dotClass: "bg-orange-500", bgClass: "bg-orange-50", textClass: "text-orange-700" },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calcule l'âge du lot en jours à aujourd'hui.
 *   ACTIVE    → entryAgeDay + jours depuis entryDate
 *   Terminé   → entryAgeDay + jours entre entryDate et closedAt
 */
function computeAgeDay(batch: BatchSummary, now: Date): number {
  return batchAgeDay(
    batch.entryDate,
    batch.entryAgeDay,
    batch.status === "ACTIVE" ? now : (batch.closedAt ?? now),
  )
}

/**
 * Badge "Aucune saisie" — ajustement 4 :
 *   seulement si ACTIVE + lot existe depuis > 1 jour (entryDate) + 0 saisies
 */
function shouldShowNoRecordsBadge(batch: BatchSummary, now: Date): boolean {
  if (batch.status !== "ACTIVE") return false
  if (batch._count.dailyRecords > 0) return false
  const daysSinceEntry = diffDays(batch.entryDate, now)
  return daysSinceEntry > 1
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BatchCardProps {
  batch: BatchSummary
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchCard({ batch }: BatchCardProps) {
  const [now]         = useState(() => new Date())
  const ageDay        = computeAgeDay(batch, now)
  const noRecords     = shouldShowNoRecordsBadge(batch, now)
  const isActive      = batch.status === "ACTIVE"
  const statusCfg     = STATUS_CONFIG[batch.status] ?? STATUS_CONFIG.CLOSED
  const typeLabel     = TYPE_LABELS[batch.type]     ?? batch.type

  return (
    <div className="rounded-xl border border-gray-200 bg-white hover:border-green-200 hover:shadow-sm transition-all duration-150">

      {/* ── Zone principale : clic → détail lot ─────────────────────────── */}
      <Link href={`/batches/${batch.id}`} className="block p-4">

        {/* En-tête : numéro + badge statut */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <div className="font-bold text-gray-900 text-base leading-tight">
              {batch.number}
            </div>
            <div className="text-sm text-gray-500 mt-0.5 truncate">
              {typeLabel}
            </div>
          </div>

          {/* Badge statut */}
          <span
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              statusCfg.bgClass,
              statusCfg.textClass,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dotClass)} aria-hidden />
            {statusCfg.label}
          </span>
        </div>

        {/* Localisation */}
        <div className="text-xs text-gray-400 mb-3 truncate">
          {batch.building.farm.name} · {batch.building.name}
        </div>

        {/* KPI row : âge / effectif / date entrée */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-xs text-gray-400 mb-0.5">
              {isActive ? "Âge" : "Durée"}
            </div>
            <div className="text-sm font-semibold text-gray-800 tabular-nums">
              J. {ageDay}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Effectif</div>
            <div className="text-sm font-semibold text-gray-800 tabular-nums">
              {formatNumber(batch.entryCount)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Entrée</div>
            <div className="text-sm font-semibold text-gray-800">
              {formatDate(batch.entryDate)}
            </div>
          </div>
        </div>
      </Link>

      {/* ── Footer : coût + saisies + quick action ─────────────────────── */}
      <div className="border-t border-gray-50 px-4 py-3 flex items-center justify-between gap-3">

        {/* Données financières + saisies */}
        <div className="flex items-center gap-3 text-xs text-gray-500 min-w-0">
          {batch.totalCostFcfa > 0 && (
            <span className="font-medium text-gray-700 whitespace-nowrap">
              {formatMoneyFCFACompact(batch.totalCostFcfa)}
            </span>
          )}
          <span className="whitespace-nowrap">
            {batch._count.dailyRecords}{" "}
            {batch._count.dailyRecords === 1 ? "saisie" : "saisies"}
          </span>
        </div>

        {/* Badge "Aucune saisie" + bouton Saisir (lots ACTIVE uniquement) */}
        <div className="flex items-center gap-2 shrink-0">
          {noRecords && (
            <span className="text-xs font-medium text-orange-700 bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5 whitespace-nowrap">
              Aucune saisie
            </span>
          )}

          {isActive && (
            <Link
              href={`/daily?batchId=${batch.id}`}
              className={cn(
                "text-xs font-medium rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap",
                noRecords
                  ? "bg-orange-600 text-white hover:bg-orange-700"
                  : "border border-green-200 text-green-700 hover:bg-green-50",
              )}
              // Stoppe la propagation au cas où la carte serait dans un wrapper cliquable
              onClick={(e) => e.stopPropagation()}
            >
              Saisir
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
