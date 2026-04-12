"use client"

import { useState } from "react"
import {
  getOfflineUserMessage,
  getOfflineGlobalErrorMessage,
} from "@/src/lib/offline/user-messages"

interface SyncItem {
  id: string
  label: string
  createdAt: string
  status: "pending" | "syncing" | "failed" | "conflict"
  /** Type de mutation (ex: CREATE_DAILY_RECORD) — optionnel pour rétrocompat */
  type?: string
  /** Scope du module (ex: daily, stock, health) — optionnel */
  scope?: string
  lastError?: string
  /** Payload brut — utilisé pour afficher le résumé des données saisies */
  payload?: unknown
}

interface OfflineSyncCardProps {
  isOnline: boolean
  pendingCount: number
  failedCount: number
  isSyncing: boolean
  lastSyncedAt: string | null
  lastError: string | null
  items?: SyncItem[]
  onSync: () => void
  onRetryItem?: (itemId: string) => void
  onRemoveItem?: (itemId: string) => void
  onPurgeItem?: (itemId: string) => void
}

function formatLastSync(value: string | null) {
  if (!value) return "Aucune synchronisation encore"

  try {
    return new Intl.DateTimeFormat("fr-SN", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value))
  } catch {
    return "Synchronisation récente"
  }
}

function formatPayloadSummary(
  type: string | undefined,
  payload: unknown,
): Array<{ label: string; value: string }> {
  if (!payload || typeof payload !== "object") return []
  const p = payload as Record<string, unknown>

  switch (type) {
    case "CREATE_DAILY_RECORD":
      return [
        { label: "Date", value: String(p.dateIso ?? "—") },
        { label: "Mortalité", value: p.mortality != null ? String(p.mortality) : "—" },
        { label: "Aliment", value: p.feedKg != null ? `${p.feedKg} kg` : "—" },
      ]
    case "CREATE_EXPENSE":
      return [
        { label: "Date", value: String(p.date ?? "—") },
        { label: "Description", value: String(p.description ?? "—") },
        {
          label: "Montant",
          value: p.amountFcfa != null ? `${Number(p.amountFcfa).toLocaleString("fr-SN")} FCFA` : "—",
        },
      ]
    case "CREATE_VACCINATION":
      return [
        { label: "Date", value: String(p.date ?? "—") },
        { label: "Vaccin", value: String(p.vaccineName ?? "—") },
        { label: "Sujets", value: p.countVaccinated != null ? String(p.countVaccinated) : "—" },
      ]
    case "CREATE_TREATMENT":
      return [
        { label: "Début", value: String(p.startDate ?? "—") },
        { label: "Médicament", value: String(p.medicineName ?? "—") },
        ...(p.durationDays != null ? [{ label: "Durée", value: `${p.durationDays} j.` }] : []),
      ]
    case "CREATE_SALE":
      return [
        { label: "Date", value: String(p.saleDate ?? "—") },
        { label: "Produit", value: String(p.productType ?? "—") },
        { label: "Lignes", value: Array.isArray(p.items) ? String(p.items.length) : "—" },
      ]
    case "CREATE_FEED_MOVEMENT":
      return [
        { label: "Date", value: String(p.date ?? "—") },
        { label: "Type", value: String(p.type ?? "—") },
        { label: "Quantité", value: p.quantityKg != null ? `${p.quantityKg} kg` : "—" },
      ]
    case "CREATE_MEDICINE_MOVEMENT":
      return [
        { label: "Date", value: String(p.date ?? "—") },
        { label: "Type", value: String(p.type ?? "—") },
        { label: "Quantité", value: p.quantity != null ? String(p.quantity) : "—" },
      ]
    case "CREATE_EGG_RECORD":
      return [
        { label: "Date", value: String(p.date ?? "—") },
        { label: "Œufs totaux", value: p.totalEggs != null ? String(p.totalEggs) : "—" },
        { label: "Commercialisables", value: p.sellableEggs != null ? String(p.sellableEggs) : "—" },
      ]
    case "CREATE_PURCHASE":
      return [
        { label: "Date", value: String(p.purchaseDate ?? "—") },
        { label: "Lignes", value: Array.isArray(p.items) ? String(p.items.length) : "—" },
      ]
    default:
      return []
  }
}

function ItemErrorDetail({ item }: { item: SyncItem }) {
  const [showRaw, setShowRaw] = useState(false)

  if (item.status !== "failed" && item.status !== "conflict") return null

  const payloadLines = formatPayloadSummary(item.type, item.payload)
  const userMsg = item.lastError
    ? getOfflineUserMessage({
        action: item.type,
        scope: item.scope,
        status: item.status,
        error: item.lastError,
      })
    : null

  return (
    <div className="mt-2 space-y-2">
      {/* Données saisies — toujours affiché pour les conflits */}
      {payloadLines.length > 0 ? (
        <div className="rounded-lg bg-gray-50 px-2.5 py-2 space-y-1">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            Données saisies
          </p>
          {payloadLines.map((line) => (
            <div key={line.label} className="flex justify-between gap-2 text-[11px]">
              <span className="text-gray-400">{line.label}</span>
              <span className="font-medium text-gray-700 text-right">{line.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Message d'erreur traduit */}
      {userMsg ? (
        <div className="space-y-1">
          <p
            className={`text-[11px] font-medium ${
              userMsg.severity === "error" ? "text-red-700" : "text-orange-700"
            }`}
          >
            {userMsg.title}
          </p>
          <p className="text-[11px] text-gray-500">{userMsg.description}</p>

          {userMsg.retryable ? (
            <p className="text-[11px] text-gray-400 italic">
              Cette opération peut être retentée.
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="text-[10px] text-gray-300 underline hover:text-gray-500 transition-colors"
          >
            {showRaw ? "Masquer le détail technique" : "Afficher le détail technique"}
          </button>

          {showRaw ? (
            <p className="rounded bg-gray-50 px-2 py-1 font-mono text-[10px] text-gray-400 break-all">
              {item.lastError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SyncItemCard({
  item,
  isOnline,
  isSyncing,
  onRetryItem,
  onRemoveItem,
  onPurgeItem,
}: {
  item: SyncItem
  isOnline: boolean
  isSyncing: boolean
  onRetryItem?: (id: string) => void
  onRemoveItem?: (id: string) => void
  onPurgeItem?: (id: string) => void
}) {
  return (
    <div className="rounded-xl bg-white px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-gray-900">{item.label}</p>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
            item.status === "failed"
              ? "bg-red-100 text-red-700"
              : item.status === "conflict"
                ? "bg-orange-100 text-orange-700"
                : "bg-amber-100 text-amber-700"
          }`}
        >
          {item.status === "failed"
            ? "Erreur"
            : item.status === "conflict"
              ? "Conflit"
              : "En attente"}
        </span>
      </div>

      <p className="mt-1 text-[11px] text-gray-500">
        Créé le {formatLastSync(item.createdAt)}
      </p>

      <ItemErrorDetail item={item} />

      {(onRetryItem || onRemoveItem || onPurgeItem) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {(item.status === "failed" || item.status === "conflict") && onRetryItem ? (
            <button
              type="button"
              onClick={() => onRetryItem(item.id)}
              disabled={!isOnline || isSyncing}
              className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
            >
              Réessayer
            </button>
          ) : null}
          {(item.status === "failed" || item.status === "conflict") && onRemoveItem ? (
            <button
              type="button"
              onClick={() => onRemoveItem(item.id)}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Supprimer
            </button>
          ) : null}
          {item.status === "pending" && onRemoveItem ? (
            <button
              type="button"
              onClick={() => onRemoveItem(item.id)}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 transition hover:bg-gray-50"
            >
              Annuler
            </button>
          ) : null}
          {(item.status === "failed" || item.status === "conflict") && onPurgeItem ? (
            <button
              type="button"
              onClick={() => onPurgeItem(item.id)}
              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-100"
            >
              Purger localement
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function OfflineSyncCard({
  isOnline,
  pendingCount,
  isSyncing,
  lastSyncedAt,
  lastError,
  items = [],
  onSync,
  onRetryItem,
  onRemoveItem,
  onPurgeItem,
}: OfflineSyncCardProps) {
  if (pendingCount === 0 && !lastError) {
    return null
  }

  // Counts derived from items — source of truth for display
  const errorItems    = items.filter((i) => i.status === "failed")
  const conflictItems = items.filter((i) => i.status === "conflict")
  const pendingItems  = items.filter((i) => i.status !== "failed" && i.status !== "conflict")
  const hasGroups     = errorItems.length > 0 && conflictItems.length > 0

  const translatedGlobalError = getOfflineGlobalErrorMessage(lastError)

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold">
            {pendingCount > 0
              ? `${pendingCount} saisie(s) en attente de synchronisation`
              : "Synchronisation à vérifier"}
          </p>
          <p className="text-xs text-amber-800">
            {isOnline
              ? "La connexion est disponible. Vous pouvez lancer la synchronisation maintenant."
              : "Mode hors ligne actif. Les nouvelles saisies seront conservées puis envoyées au retour du réseau."}
          </p>
          <p className="text-xs text-amber-700">
            Dernière synchro : {formatLastSync(lastSyncedAt)}
          </p>
          {errorItems.length > 0 ? (
            <p className="text-xs text-red-700">
              {errorItems.length} saisie(s) en échec — vérification requise.
            </p>
          ) : null}
          {conflictItems.length > 0 ? (
            <p className="text-xs text-orange-700">
              {conflictItems.length} saisie(s) en conflit — données déjà modifiées sur le serveur.
            </p>
          ) : null}
          {translatedGlobalError ? (
            <p className="text-xs text-red-700">{translatedGlobalError}</p>
          ) : null}
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

      {items.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-amber-200 pt-3">

          {/* ── Conflits ────────────────────────────────────────────────── */}
          {conflictItems.length > 0 ? (
            <div className="space-y-2">
              {hasGroups ? (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-600">
                  Conflits ({conflictItems.length})
                </p>
              ) : null}
              {conflictItems.map((item) => (
                <SyncItemCard
                  key={item.id}
                  item={item}
                  isOnline={isOnline}
                  isSyncing={isSyncing}
                  onRetryItem={onRetryItem}
                  onRemoveItem={onRemoveItem}
                  onPurgeItem={onPurgeItem}
                />
              ))}
            </div>
          ) : null}

          {/* ── Échecs ──────────────────────────────────────────────────── */}
          {errorItems.length > 0 ? (
            <div className="space-y-2">
              {hasGroups ? (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500">
                  Échecs ({errorItems.length})
                </p>
              ) : null}
              {errorItems.map((item) => (
                <SyncItemCard
                  key={item.id}
                  item={item}
                  isOnline={isOnline}
                  isSyncing={isSyncing}
                  onRetryItem={onRetryItem}
                  onRemoveItem={onRemoveItem}
                  onPurgeItem={onPurgeItem}
                />
              ))}
            </div>
          ) : null}

          {/* ── En attente ──────────────────────────────────────────────── */}
          {pendingItems.length > 0 ? (
            <div className="space-y-2">
              {pendingItems.map((item) => (
                <SyncItemCard
                  key={item.id}
                  item={item}
                  isOnline={isOnline}
                  isSyncing={isSyncing}
                  onRetryItem={onRetryItem}
                  onRemoveItem={onRemoveItem}
                  onPurgeItem={onPurgeItem}
                />
              ))}
            </div>
          ) : null}

        </div>
      ) : null}
    </div>
  )
}
