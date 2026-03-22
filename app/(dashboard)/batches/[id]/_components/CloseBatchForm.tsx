"use client"

/**
 * SunuFarm — Formulaire de clôture d'un lot (Client Component)
 *
 * Accessible uniquement aux MANAGER+ (filtré côté parent BatchHeader).
 * Le backend vérifie également les permissions — ce composant n'est pas autoritaire.
 *
 * Statuts de destination possibles :
 *   CLOSED      → fin normale sans vente
 *   SOLD        → lot vendu
 *   SLAUGHTERED → lot abattu
 *
 * Après clôture réussie : redirection vers /batches.
 */

import { useState }           from "react"
import { useRouter }          from "next/navigation"
import { closeBatch }         from "@/src/actions/batches"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CloseBatchFormProps {
  organizationId: string
  batchId:        string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CloseBatchForm({ organizationId, batchId }: CloseBatchFormProps) {
  const router = useRouter()

  const [open,        setOpen]        = useState(false)
  const [closeStatus, setCloseStatus] = useState<"CLOSED" | "SOLD" | "SLAUGHTERED">("CLOSED")
  const [closeReason, setCloseReason] = useState("")
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const result = await closeBatch({
      organizationId,
      batchId,
      closeStatus,
      closeReason: closeReason.trim() || undefined,
    })

    if (result.success) {
      router.push("/batches")
    } else {
      setError(result.error ?? "Erreur lors de la clôture")
      setLoading(false)
    }
  }

  // ── Bouton d'ouverture ──────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl px-4 py-2.5 hover:border-gray-300 transition-colors"
      >
        Clôturer le lot
      </button>
    )
  }

  // ── Formulaire ─────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      className="w-full mt-1 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3"
    >
      <h3 className="text-sm font-semibold text-gray-800">Clôturer ce lot</h3>

      {/* Statut de destination */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-gray-600">
          Statut final
        </label>
        <div className="flex flex-wrap gap-2">
          {(["CLOSED", "SOLD", "SLAUGHTERED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setCloseStatus(s)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                closeStatus === s
                  ? "bg-gray-800 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {s === "CLOSED" ? "Clôturé" : s === "SOLD" ? "Vendu" : "Abattu"}
            </button>
          ))}
        </div>
      </div>

      {/* Motif optionnel */}
      <div className="space-y-1.5">
        <label htmlFor="close-reason" className="block text-xs font-medium text-gray-600">
          Motif (optionnel)
        </label>
        <input
          id="close-reason"
          type="text"
          value={closeReason}
          onChange={(e) => setCloseReason(e.target.value)}
          maxLength={500}
          placeholder="Ex : fin de cycle, vente au marché..."
          className="w-full h-[44px] rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
        />
      </div>

      {/* Erreur */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 h-[44px] rounded-xl bg-gray-800 text-white text-sm font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors"
        >
          {loading ? "Clôture en cours…" : "Confirmer la clôture"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          disabled={loading}
          className="h-[44px] px-4 rounded-xl border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}
