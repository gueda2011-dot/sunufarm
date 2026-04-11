"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { listCachedResources } from "@/src/lib/offline-cache"
import { getOfflineBootstrapMeta, prepareOfflineWorkspace } from "@/src/lib/offline/bootstrap"
import { subscribeOfflineEvent, OFFLINE_EVENTS } from "@/src/lib/offline/events"
import { listSyncErrors } from "@/src/lib/offline/sync/errors"
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

function formatDateTime(value: string | null | undefined) {
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

function formatDebugPayload(value: unknown) {
  if (value === null || value === undefined) return null

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export default function OfflinePage() {
  const { context } = useOfflineSessionContext()
  const {
    isOnline,
    pendingCount,
    failedCount,
    groupedCounts,
    lastSyncedAt,
    lastError,
    items,
    sync,
    isSyncing,
  } = useOfflineSyncStatus()
  const [cachedKeys, setCachedKeys] = useState<string[]>([])
  const [bootstrapMeta, setBootstrapMeta] = useState<Awaited<ReturnType<typeof getOfflineBootstrapMeta>>>(null)
  const [syncErrors, setSyncErrors] = useState<Array<{
    id: string
    message: string
    backendReason?: string | null
    backendStatus?: number | null
    backendCode?: string | null
    scope: string
    createdAt: string
    payload?: unknown
    mappedPayload?: unknown
    finalPayload?: unknown
    backendResponse?: unknown
    fieldErrors?: Record<string, string[]>
  }>>([])
  const [isPreparing, setIsPreparing] = useState(false)
  const organizationId = context?.organizationId

  useEffect(() => {
    if (!organizationId) return
    const orgId = organizationId

    async function refreshHub() {
      const [resources, bootstrap, errors] = await Promise.all([
        listCachedResources(orgId),
        getOfflineBootstrapMeta(orgId),
        listSyncErrors(orgId),
      ])

      setCachedKeys(resources.slice(0, 12).map((entry) => entry.key))
      setBootstrapMeta(bootstrap)
      setSyncErrors(errors.slice(0, 10))
    }

    void refreshHub()
    const unsubStorage = subscribeOfflineEvent(OFFLINE_EVENTS.storageChanged, () => {
      void refreshHub()
    })
    const unsubBootstrap = subscribeOfflineEvent(OFFLINE_EVENTS.bootstrapChanged, () => {
      void refreshHub()
    })
    const unsubSync = subscribeOfflineEvent(OFFLINE_EVENTS.syncChanged, () => {
      void refreshHub()
    })

    return () => {
      unsubStorage()
      unsubBootstrap()
      unsubSync()
    }
  }, [organizationId])

  const statusLabel = useMemo(() => (
    isOnline ? "Connexion active" : "Mode hors ligne actif"
  ), [isOnline])

  const modulesReady = bootstrapMeta?.modulesReady ?? []

  async function handlePrepare() {
    if (!organizationId) return
    setIsPreparing(true)
    try {
      await prepareOfflineWorkspace(organizationId)
    } finally {
      setIsPreparing(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-700">
          Hors ligne
        </p>
        <h1 className="mt-3 text-3xl font-bold text-gray-900">Centre de controle offline</h1>
        <p className="mt-3 max-w-3xl text-sm text-gray-600">
          Prepare l&apos;appareil, suis la synchronisation, controle les elements en attente
          et verifie quels modules terrain sont vraiment prets sans reseau.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Etat reseau</p>
          <p className="mt-2 text-xl font-bold text-gray-900">{statusLabel}</p>
          <p className="mt-1 text-xs text-gray-500">Derniere synchro: {formatDateTime(lastSyncedAt)}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Preparation appareil</p>
          <p className="mt-2 text-xl font-bold text-gray-900">
            {bootstrapMeta?.status ?? "idle"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Dernier bootstrap: {formatDateTime(bootstrapMeta?.lastBootstrapAt)}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Elements en attente</p>
          <p className="mt-2 text-xl font-bold text-amber-700">{pendingCount}</p>
          <p className="mt-1 text-xs text-gray-500">{failedCount} erreur(s) a reprendre</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Session locale</p>
          <p className="mt-2 text-xl font-bold text-gray-900">
            {context?.devicePrepared ? "Preparee" : "A preparer"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Validee: {formatDateTime(context?.lastValidatedAt)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            void handlePrepare()
          }}
          disabled={!context?.organizationId || isPreparing}
          className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
        >
          {isPreparing ? "Preparation..." : "Preparer pour le hors ligne"}
        </button>
        <button
          type="button"
          onClick={() => {
            void sync()
          }}
          disabled={!isOnline || isSyncing}
          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSyncing ? "Synchronisation..." : "Forcer la synchronisation"}
        </button>
        <button
          type="button"
          onClick={() => {
            void handlePrepare()
          }}
          disabled={!isOnline || isPreparing}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Actualiser les donnees locales
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Modules disponibles offline</h2>
            <p className="mt-1 text-sm text-gray-500">
              Les raccourcis ci-dessous n&apos;ont plus besoin d&apos;une visite page par page
              apres bootstrap.
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

          <div className="flex flex-wrap gap-2">
            {modulesReady.length > 0 ? (
              modulesReady.map((module) => (
                <span
                  key={module}
                  className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700"
                >
                  {module}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                Aucun module prepare
              </span>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">References locales</h2>
            <p className="mt-1 text-sm text-gray-500">
              Apercu du contenu deja present en local.
            </p>
          </div>

          {cachedKeys.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">
              Aucune ressource locale detectee.
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
            <h2 className="text-base font-semibold text-gray-900">File de sync par module</h2>
            <p className="mt-1 text-sm text-gray-500">
              Repartition actuelle des commandes pending, failed ou conflict.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(groupedCounts).map(([scope, count]) => (
              <OfflineScopeBadge key={scope} scope={scope} count={count} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Elements en attente</h2>
            <p className="mt-1 text-sm text-gray-500">
              Les creations locales sont visibles ici avec leur statut de synchro.
            </p>
          </div>

          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">
              Aucun element pending ou failed.
            </p>
          ) : (
            <div className="space-y-2">
              {items.slice(0, 12).map((item) => (
                <div key={item.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {item.scope} - {formatDateTime(item.updatedAt)}
                  </p>
                  {item.lastError ? (
                    <p className="mt-1 text-xs text-red-700">{item.lastError}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Erreurs et diagnostics</h2>
            <p className="mt-1 text-sm text-gray-500">
              Derniere erreur sync: {lastError ?? "Aucune"}
            </p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            <p>Reseau: {isOnline ? "online" : "offline"}</p>
            <p>Bootstrap: {bootstrapMeta?.status ?? "idle"}</p>
            <p>Dernier bootstrap: {formatDateTime(bootstrapMeta?.lastBootstrapAt)}</p>
            <p>Erreur bootstrap: {bootstrapMeta?.error ?? "Aucune"}</p>
          </div>

          {syncErrors.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">
              Aucun journal d&apos;erreur.
            </p>
          ) : (
            <div className="space-y-2">
              {syncErrors.map((error) => (
                <div key={error.id} className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-red-900">{error.message}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-red-700">
                      {error.scope}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-red-700">
                    {formatDateTime(error.createdAt)}
                  </p>
                  {error.backendReason ? (
                    <p className="mt-2 text-xs text-red-800">
                      Raison backend: {error.backendReason}
                    </p>
                  ) : null}
                  {error.backendStatus ? (
                    <p className="mt-1 text-xs text-red-800">
                      Status: {error.backendStatus}
                      {error.backendCode ? ` - ${error.backendCode}` : ""}
                    </p>
                  ) : null}
                  {error.fieldErrors && Object.keys(error.fieldErrors).length > 0 ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-white/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                        Champs invalides
                      </p>
                      <div className="mt-2 space-y-1">
                        {Object.entries(error.fieldErrors).map(([field, messages]) => (
                          <p key={field} className="text-[11px] text-red-900">
                            <span className="font-semibold">{field}</span>: {messages.join(", ")}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {formatDebugPayload(error.payload) ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-white/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                        Payload original
                      </p>
                      <pre className="mt-2 overflow-x-auto text-[11px] text-red-900 whitespace-pre-wrap">
                        {formatDebugPayload(error.payload)}
                      </pre>
                    </div>
                  ) : null}
                  {formatDebugPayload(error.mappedPayload) ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-white/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                        Payload mappe
                      </p>
                      <pre className="mt-2 overflow-x-auto text-[11px] text-red-900 whitespace-pre-wrap">
                        {formatDebugPayload(error.mappedPayload)}
                      </pre>
                    </div>
                  ) : null}
                  {formatDebugPayload(error.finalPayload) ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-white/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                        Payload final API
                      </p>
                      <pre className="mt-2 overflow-x-auto text-[11px] text-red-900 whitespace-pre-wrap">
                        {formatDebugPayload(error.finalPayload)}
                      </pre>
                    </div>
                  ) : null}
                  {formatDebugPayload(error.backendResponse) ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-white/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                        Reponse backend
                      </p>
                      <pre className="mt-2 overflow-x-auto text-[11px] text-red-900 whitespace-pre-wrap">
                        {formatDebugPayload(error.backendResponse)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
