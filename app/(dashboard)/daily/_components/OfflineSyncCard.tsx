"use client"

interface OfflineSyncCardProps {
  isOnline: boolean
  pendingCount: number
  failedCount: number
  isSyncing: boolean
  lastSyncedAt: string | null
  lastError: string | null
  items?: Array<{
    id: string
    label: string
    createdAt: string
    status: "pending" | "failed"
    lastError?: string
  }>
  onSync: () => void
}

function formatLastSync(value: string | null) {
  if (!value) return "Aucune synchronisation encore"

  try {
    return new Intl.DateTimeFormat("fr-SN", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value))
  } catch {
    return "Synchronisation recente"
  }
}

export function OfflineSyncCard({
  isOnline,
  pendingCount,
  failedCount,
  isSyncing,
  lastSyncedAt,
  lastError,
  items = [],
  onSync,
}: OfflineSyncCardProps) {
  if (pendingCount === 0 && !lastError) {
    return null
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold">
            {pendingCount > 0
              ? `${pendingCount} saisie(s) en attente de synchronisation`
              : "Synchronisation a verifier"}
          </p>
          <p className="text-xs text-amber-800">
            {isOnline
              ? "La connexion est disponible. Vous pouvez lancer la synchronisation maintenant."
              : "Mode hors ligne actif. Les nouvelles saisies seront conservees puis envoyees au retour du reseau."}
          </p>
          <p className="text-xs text-amber-700">
            Derniere synchro: {formatLastSync(lastSyncedAt)}
          </p>
          {failedCount > 0 && (
            <p className="text-xs text-red-700">
              {failedCount} saisie(s) necessitent une verification.
            </p>
          )}
          {lastError && (
            <p className="text-xs text-red-700">
              Derniere erreur: {lastError}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onSync}
          disabled={!isOnline || isSyncing}
          className="shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
        >
          {isSyncing ? "Synchro..." : "Resynchroniser"}
        </button>
      </div>

      {items.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-amber-200 pt-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl bg-white px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-gray-900">{item.label}</p>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                    item.status === "failed"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {item.status === "failed" ? "Erreur" : "En attente"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                Cree le {formatLastSync(item.createdAt)}
              </p>
              {item.lastError && (
                <p className="mt-1 text-[11px] text-red-700">{item.lastError}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
