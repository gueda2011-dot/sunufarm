"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { listCachedResources } from "@/src/lib/offline-cache"
import { listOptimisticItems } from "@/src/lib/offline-optimistic"
import { useOfflineSessionContext } from "@/src/hooks/useOfflineSessionContext"
import { useOfflineSyncStatus } from "@/src/hooks/useOfflineSyncStatus"
import { OfflineScopeBadge } from "@/src/components/offline/OfflineScopeBadge"

const OFFLINE_SHORTCUTS = [
  { href: "/daily", label: "Saisie journaliere" },
  { href: "/health", label: "Sante" },
  { href: "/stock", label: "Stock" },
  { href: "/sales/new", label: "Nouvelle vente" },
  { href: "/eggs", label: "Oeufs" },
  { href: "/purchases", label: "Achats" },
]

function formatDateTime(value: string | null) {
  if (!value) return "Jamais"

  try {
    return new Intl.DateTimeFormat("fr-SN", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value))
  } catch {
    return value
  }
}

export default function OfflinePage() {
  const { context } = useOfflineSessionContext()
  const { isOnline, pendingCount, failedCount, groupedCounts, lastSyncedAt, lastError } = useOfflineSyncStatus()
  const [cachedKeys, setCachedKeys] = useState<string[]>([])
  const [localEntries, setLocalEntries] = useState<Array<{ id: string; label?: string; updatedAt?: string }>>([])

  useEffect(() => {
    async function refreshOfflineHub() {
      if (context?.organizationId) {
        const [resources, optimistic] = await Promise.all([
          listCachedResources(context.organizationId),
          listOptimisticItems(context.organizationId),
        ])

        setCachedKeys(resources.slice(0, 8).map((entry) => entry.key))
        setLocalEntries(
          optimistic.slice(0, 6).map((item) => ({
            id: item.id,
            label: item.label,
            updatedAt: item.updatedAt,
          })),
        )
      }
    }

    void refreshOfflineHub()
  }, [context?.organizationId])

  const statusLabel = useMemo(() => (
    isOnline ? "Connexion active" : "Mode hors ligne actif"
  ), [isOnline])

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-700">
          Hors ligne
        </p>
        <h1 className="mt-3 text-3xl font-bold text-gray-900">Hub offline SunuFarm</h1>
        <p className="mt-3 max-w-2xl text-sm text-gray-600">
          Retrouvez votre contexte local, vos saisies en attente et les ecrans critiques
          qui restent exploitables sur cet appareil.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Etat reseau</p>
          <p className="mt-2 text-xl font-bold text-gray-900">{statusLabel}</p>
          <p className="mt-1 text-xs text-gray-500">Derniere synchro: {formatDateTime(lastSyncedAt)}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Organisation active</p>
          <p className="mt-2 text-xl font-bold text-gray-900">
            {context?.organizationName ?? "Non disponible hors ligne"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Role: {context?.userRole ?? "Inconnu"}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Elements en attente</p>
          <p className="mt-2 text-xl font-bold text-amber-700">{pendingCount}</p>
          <p className="mt-1 text-xs text-gray-500">{failedCount} erreur(s) a reprendre</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Derniere erreur</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">{lastError ?? "Aucune"}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Raccourcis utilisables offline</h2>
            <p className="mt-1 text-sm text-gray-500">
              Ces pages sont prioritaires pour le terrain et peuvent se rouvrir sans reseau apres une visite online.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {OFFLINE_SHORTCUTS.map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800 transition hover:border-green-200 hover:bg-green-50 hover:text-green-800"
              >
                {shortcut.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">References en cache</h2>
            <p className="mt-1 text-sm text-gray-500">
              Dernieres ressources locales detectees pour votre organisation.
            </p>
          </div>

          {cachedKeys.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">
              Aucune reference n&apos;a encore ete mise en cache sur cet appareil.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {cachedKeys.map((key) => (
                <span
                  key={key}
                  className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                >
                  {key}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>

      {Object.keys(groupedCounts).length > 0 ? (
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">File de synchro par module</h2>
            <p className="mt-1 text-sm text-gray-500">
              Repartition des elements encore presents dans l&apos;outbox locale.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(groupedCounts).map(([scope, count]) => (
              <OfflineScopeBadge key={scope} scope={scope} count={count} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Dernieres saisies locales</h2>
          <p className="mt-1 text-sm text-gray-500">
            Elements optimistes ou en attente de resynchronisation sur cet appareil.
          </p>
        </div>

        {localEntries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">
            Aucune saisie locale recente.
          </p>
        ) : (
          <div className="space-y-2">
            {localEntries.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-900">{entry.label ?? entry.id}</p>
                <p className="mt-1 text-xs text-gray-500">
                  Mise a jour: {formatDateTime(entry.updatedAt ?? null)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
