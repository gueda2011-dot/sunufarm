/**
 * SunuFarm — En-tête du détail d'un lot
 *
 * Affiche : numéro, type, statut, localisation, dates, effectif, notes.
 * Actions disponibles selon le statut et le rôle :
 *   - Lot ACTIVE  : bouton "Saisir" (→ /daily?batchId=) + CloseBatchForm (MANAGER+)
 *   - Lot terminé : date de clôture + motif
 *
 * Alerte "saisie manquante" : bandeau orange si missingSaisie = true.
 */

import Link                from "next/link"
import { cn }              from "@/src/lib/utils"
import {
  formatDate,
  formatNumber,
}                          from "@/src/lib/formatters"
import type { BatchDetail } from "@/src/actions/batches"
import { CloseBatchForm }  from "./CloseBatchForm"

// ---------------------------------------------------------------------------
// Constantes d'affichage
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  CHAIR:        "Poulet de chair",
  PONDEUSE:     "Pondeuse",
  REPRODUCTEUR: "Reproducteur",
}

const STATUS_CONFIG: Record<string, {
  label:     string
  dotClass:  string
  bgClass:   string
  textClass: string
}> = {
  ACTIVE:      { label: "Actif",   dotClass: "bg-green-500",  bgClass: "bg-green-50",  textClass: "text-green-700"  },
  CLOSED:      { label: "Clôturé", dotClass: "bg-gray-400",   bgClass: "bg-gray-100",  textClass: "text-gray-600"   },
  SOLD:        { label: "Vendu",   dotClass: "bg-blue-500",   bgClass: "bg-blue-50",   textClass: "text-blue-700"   },
  SLAUGHTERED: { label: "Abattu",  dotClass: "bg-orange-500", bgClass: "bg-orange-50", textClass: "text-orange-700" },
}

const MANAGER_OR_ABOVE = ["SUPER_ADMIN", "OWNER", "MANAGER"] as const

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BatchHeaderProps {
  batch:         BatchDetail
  ageDay:        number
  missingSaisie: boolean
  userRole:      string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchHeader({
  batch,
  ageDay,
  missingSaisie,
  userRole,
}: BatchHeaderProps) {
  const isActive   = batch.status === "ACTIVE"
  const statusCfg  = STATUS_CONFIG[batch.status] ?? STATUS_CONFIG.CLOSED
  const typeLabel  = TYPE_LABELS[batch.type] ?? batch.type
  const canManage  = MANAGER_OR_ABOVE.includes(userRole as (typeof MANAGER_OR_ABOVE)[number])

  return (
    <div className="space-y-3">

      {/* ── Alerte saisie manquante ─────────────────────────────────────── */}
      {missingSaisie && (
        <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 flex items-center justify-between gap-3 text-sm">
          <p className="text-orange-800 flex-1">
            <span className="font-semibold">Saisie manquante.</span>
            {" "}Aucune saisie enregistrée depuis plus d&apos;un jour.
          </p>
          <Link
            href={`/daily?batchId=${batch.id}`}
            className="shrink-0 rounded-lg bg-orange-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-orange-700 transition-colors"
          >
            Saisir
          </Link>
        </div>
      )}

      {/* ── Card principale ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">

        {/* Ligne 1 : numéro + badge statut */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">
              {batch.number}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{typeLabel}</p>
          </div>
          <span
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
              statusCfg.bgClass,
              statusCfg.textClass,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dotClass)} aria-hidden />
            {statusCfg.label}
          </span>
        </div>

        {/* Ligne 2 : localisation */}
        <p className="text-sm text-gray-500">
          {batch.building.farm.name}
          <span className="mx-1.5 text-gray-300">·</span>
          {batch.building.name}
        </p>

        {/* Ligne 3 : KPI de contexte */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-gray-400 mb-0.5">
              {isActive ? "Âge aujourd'hui" : "Durée cycle"}
            </div>
            <div className="font-semibold text-gray-800 tabular-nums">
              Jour {ageDay}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Effectif initial</div>
            <div className="font-semibold text-gray-800 tabular-nums">
              {formatNumber(batch.entryCount)} sujets
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Entrée</div>
            <div className="font-semibold text-gray-800">
              {formatDate(batch.entryDate)}
            </div>
          </div>
        </div>

        {/* Clôture : date + motif (lots terminés) */}
        {!isActive && batch.closedAt && (
          <div className="pt-2 border-t border-gray-100 text-sm">
            <span className="text-gray-400">Clôturé le</span>
            {" "}
            <span className="text-gray-700 font-medium">{formatDate(batch.closedAt)}</span>
            {batch.closeReason && (
              <span className="text-gray-500 ml-2">— {batch.closeReason}</span>
            )}
          </div>
        )}

        {/* Notes */}
        {batch.notes && (
          <p className="text-sm text-gray-500 pt-2 border-t border-gray-100">
            {batch.notes}
          </p>
        )}

        {/* Actions */}
        {isActive && (
          <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <Link
              href={`/daily?batchId=${batch.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 text-white text-sm font-medium px-4 py-2.5 hover:bg-green-700 transition-colors"
            >
              Saisir aujourd&apos;hui
            </Link>
            {canManage && (
              <CloseBatchForm
                organizationId={batch.organizationId}
                batchId={batch.id}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
