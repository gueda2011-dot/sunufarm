"use client"

/**
 * FarmAdjustmentPanel — Panneau d'ajustement ferme (Phase 4)
 *
 * Affiche l'état du FarmAdjustmentProfile d'une ferme et permet
 * de déclencher le calcul, valider ou réinitialiser l'ajustement.
 *
 * Transitions d'état :
 *   OBSERVING → [Calculer] → SUGGESTED → [Activer] → ACTIVE
 *   ACTIVE/SUGGESTED → [Réinitialiser] → OBSERVING
 *
 * L'ajustement ACTIVE est pris en compte automatiquement dans :
 *   - Les courbes de référence de consommation
 *   - Le FCR de référence
 *   - Les diagnostics business
 */

import { useState, useTransition } from "react"
import {
  computeAndSuggestFarmAdjustment,
  activateFarmAdjustment,
  resetFarmAdjustment,
  type FarmAdjustmentProfileData,
} from "@/src/actions/farm-adjustment"

interface FarmAdjustmentPanelProps {
  organizationId: string
  farmId: string
  farmName: string
  initialProfile: FarmAdjustmentProfileData | null
}

const STATUS_LABELS: Record<string, string> = {
  OBSERVING: "Observation",
  SUGGESTED: "Ajustement suggéré",
  ACTIVE: "Ajustement actif",
}

const STATUS_COLORS: Record<string, string> = {
  OBSERVING: "text-gray-500 bg-gray-50 border-gray-200",
  SUGGESTED: "text-amber-700 bg-amber-50 border-amber-200",
  ACTIVE: "text-green-700 bg-green-50 border-green-200",
}

function formatFactor(value: number | null): string {
  if (value === null) return "—"
  const pct = Math.round((value - 1) * 100)
  const sign = pct >= 0 ? "+" : ""
  return `${sign}${pct}% (×${value.toFixed(3)})`
}

export function FarmAdjustmentPanel({
  organizationId,
  farmId,
  farmName,
  initialProfile,
}: FarmAdjustmentPanelProps) {
  const [profile, setProfile] = useState<FarmAdjustmentProfileData | null>(initialProfile)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const status = profile?.status ?? "OBSERVING"

  function handleCompute() {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await computeAndSuggestFarmAdjustment({ organizationId, farmId })
      if (result.success) {
        setMessage(result.data.message)
        // Recharger le profil depuis la DB pour avoir les valeurs à jour
        const refreshed = await import("@/src/actions/farm-adjustment").then((m) =>
          m.getFarmAdjustmentProfile({ organizationId, farmId }),
        )
        if (refreshed.success) setProfile(refreshed.data)
      } else {
        setError(result.error)
      }
    })
  }

  function handleActivate() {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await activateFarmAdjustment({ organizationId, farmId })
      if (result.success) {
        setMessage("Ajustement activé avec succès.")
        setProfile((prev) => prev ? { ...prev, status: "ACTIVE" } : prev)
      } else {
        setError(result.error)
      }
    })
  }

  function handleReset() {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await resetFarmAdjustment({ organizationId, farmId })
      if (result.success) {
        setMessage("Ajustement réinitialisé.")
        setProfile(null)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Ajustement ferme — {farmName}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Calibre la référence zootechnique sur l&apos;historique de votre ferme.
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[status]}`}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* Facteurs calculés */}
      {profile && (profile.feedFactor !== null || profile.weightFactor !== null) && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <p className="text-gray-500">Consommation aliment</p>
            <p className="font-medium">{formatFactor(profile.feedFactor)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-gray-500">Croissance (poids)</p>
            <p className="font-medium">{formatFactor(profile.weightFactor)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-gray-500">Indice de consommation (FCR)</p>
            <p className="font-medium">{formatFactor(profile.fcrFactor)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-gray-500">Taux de ponte</p>
            <p className="font-medium">{formatFactor(profile.layingFactor)}</p>
          </div>
          {profile.basedOnBatchCount > 0 && (
            <div className="col-span-2 text-xs text-gray-400">
              Calculé depuis {profile.basedOnBatchCount} lot(s) clôturé(s)
              {profile.calculatedAt
                ? ` · ${new Date(profile.calculatedAt).toLocaleDateString("fr-FR")}`
                : ""}
            </div>
          )}
        </div>
      )}

      {/* État OBSERVING sans données */}
      {status === "OBSERVING" && !profile?.feedFactor && (
        <p className="text-sm text-gray-500">
          L&apos;application collecte des données depuis vos lots clôturés.
          Cliquez sur &quot;Calculer&quot; pour analyser l&apos;historique disponible.
        </p>
      )}

      {/* Messages de feedback */}
      {message && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Avertissement SUGGESTED */}
      {status === "SUGGESTED" && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
          Un ajustement a été calculé. Vérifiez les facteurs ci-dessus avant d&apos;activer —
          l&apos;activation s&apos;appliquera immédiatement aux diagnostics de tous vos lots.
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={handleCompute}
          disabled={isPending}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Calcul en cours…" : "Calculer"}
        </button>

        {status === "SUGGESTED" && (
          <button
            onClick={handleActivate}
            disabled={isPending}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Activer l&apos;ajustement
          </button>
        )}

        {(status === "ACTIVE" || status === "SUGGESTED") && (
          <button
            onClick={handleReset}
            disabled={isPending}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Réinitialiser
          </button>
        )}
      </div>
    </div>
  )
}
