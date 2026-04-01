"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CircleAlert, Plus, Trash2 } from "lucide-react"
import { createSale } from "@/src/actions/sales"
import { formatMoneyFCFA } from "@/src/lib/formatters"
import { OfflineSyncCard } from "@/app/(dashboard)/daily/_components/OfflineSyncCard"
import {
  deleteOfflineDailyQueueItem,
  enqueueOfflineSale,
  flushOfflineDailyQueue,
  listPendingOfflineQueueItemsByScope,
  readOfflineDailySyncMeta,
  retryOfflineDailyQueueItem,
  subscribeToOfflineDailyQueue,
} from "@/src/lib/offline-daily-queue"

type Props = {
  organizationId: string
  customers: Array<{
    id: string
    name: string
    phone: string | null
  }>
  batches: Array<{
    id: string
    number: string
    type: string
    farmName: string
  }>
}

type ProductType = "POULET_VIF" | "OEUF" | "FIENTE"
type SaleUnit = "KG" | "PIECE" | "PLATEAU" | "CAISSE"

type Item = {
  batchId: string
  description: string
  quantity: number
  unit: SaleUnit
  unitPriceFcfa: number
}

const PRODUCT_TYPE_OPTIONS: Array<{ value: ProductType; label: string; hint: string }> = [
  { value: "POULET_VIF", label: "Poulet vif", hint: "Vente par sujet ou par caisse." },
  { value: "OEUF", label: "Oeuf", hint: "Vente par plateau, piece ou caisse." },
  { value: "FIENTE", label: "Fiente", hint: "Vente au kilo ou au sac." },
]

const UNIT_OPTIONS: SaleUnit[] = ["KG", "PIECE", "PLATEAU", "CAISSE"]

function getDefaultItem(productType: ProductType): Item {
  if (productType === "OEUF") {
    return {
      batchId: "",
      description: "Oeufs de table",
      quantity: 1,
      unit: "PLATEAU",
      unitPriceFcfa: 0,
    }
  }

  if (productType === "FIENTE") {
    return {
      batchId: "",
      description: "Fiente de volaille",
      quantity: 1,
      unit: "KG",
      unitPriceFcfa: 0,
    }
  }

  return {
    batchId: "",
    description: "Poulets vifs",
    quantity: 1,
    unit: "PIECE",
    unitPriceFcfa: 0,
  }
}

function computeItemTotal(item: Item) {
  return Math.round(item.quantity * item.unitPriceFcfa)
}

export function CreateSaleForm({ organizationId, customers, batches }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [productType, setProductType] = useState<ProductType>("POULET_VIF")
  const [customerId, setCustomerId] = useState("")
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<Item[]>([getDefaultItem("POULET_VIF")])
  const [isOnline, setIsOnline] = useState<boolean>(() => (
    typeof navigator === "undefined" ? true : navigator.onLine
  ))
  const [pendingItems, setPendingItems] = useState<Array<{
    id: string
    label: string
    createdAt: string
    status: "pending" | "failed"
    lastError?: string
  }>>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)

  const totalFcfa = useMemo(
    () => items.reduce((sum, item) => sum + computeItemTotal(item), 0),
    [items],
  )

  const selectedProduct = PRODUCT_TYPE_OPTIONS.find((item) => item.value === productType)

  const refreshOfflineState = useCallback(async () => {
    const nextItems = await listPendingOfflineQueueItemsByScope("sales")
    setPendingItems(nextItems)
    const meta = readOfflineDailySyncMeta()
    setLastSyncedAt(meta.lastSyncedAt)
    setLastSyncError(meta.lastError)
  }, [])

  const syncOfflineQueue = useCallback(async () => {
    if (!isOnline || isSyncing) return

    setIsSyncing(true)
    try {
      await flushOfflineDailyQueue()
      await refreshOfflineState()
      router.refresh()
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, refreshOfflineState, router])

  const retryOfflineItem = useCallback(async (itemId: string) => {
    if (!isOnline || isSyncing) return

    setIsSyncing(true)
    try {
      await retryOfflineDailyQueueItem(itemId)
      await flushOfflineDailyQueue({ itemId })
      await refreshOfflineState()
      router.refresh()
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, refreshOfflineState, router])

  const removeOfflineItem = useCallback(async (itemId: string) => {
    await deleteOfflineDailyQueueItem(itemId)
    await refreshOfflineState()
  }, [refreshOfflineState])

  useEffect(() => {
    void refreshOfflineState()

    const unsubscribe = subscribeToOfflineDailyQueue(() => {
      void refreshOfflineState()
    })
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      unsubscribe()
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [refreshOfflineState])

  useEffect(() => {
    if (!isOnline || pendingItems.length === 0) return
    void syncOfflineQueue()
  }, [isOnline, pendingItems.length, syncOfflineQueue])

  function updateItem(index: number, field: keyof Item, value: string | number) {
    setItems((current) => {
      const next = [...current]
      next[index] = {
        ...next[index],
        [field]: value,
      }
      return next
    })
  }

  function addItem() {
    setItems((current) => [...current, getDefaultItem(productType)])
  }

  function removeItem(index: number) {
    setItems((current) => {
      if (current.length === 1) {
        return current
      }
      return current.filter((_, itemIndex) => itemIndex !== index)
    })
  }

  function handleProductTypeChange(nextType: ProductType) {
    setProductType(nextType)
    setItems((current) =>
      current.map((item, index) =>
        index === 0 && current.length === 1
          ? getDefaultItem(nextType)
          : item,
      ),
    )
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const cleanedItems = items.map((item) => ({
      batchId: item.batchId || undefined,
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPriceFcfa: Number(item.unitPriceFcfa),
    }))

    const hasInvalidItem = cleanedItems.some((item) =>
      !item.description || item.quantity <= 0 || item.unitPriceFcfa < 0,
    )

    if (hasInvalidItem) {
      setError("Chaque ligne doit avoir une description, une quantite valide et un prix correct.")
      return
    }

    const payload = {
      organizationId,
      customerId: customerId || undefined,
      productType,
      saleDate,
      notes: notes.trim() || undefined,
      items: cleanedItems,
    }

    const queueSale = async () => {
      await enqueueOfflineSale(payload)
      setSuccess("Vente enregistree hors ligne et mise en attente.")
      await refreshOfflineState()
    }

    setLoading(true)

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queueSale()
        return
      }

      const result = await createSale(payload)

      if (!result.success) {
        setError(result.error)
        return
      }

      setSuccess("Vente enregistree.")
      router.push(`/sales/${result.data.id}`)
      router.refresh()
    } catch (submitError) {
      const offlineFailure =
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        (submitError instanceof Error && /fetch|network|offline|failed to fetch/i.test(submitError.message))

      if (!offlineFailure) {
        throw submitError
      }

      await queueSale()
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Informations generales</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Choisis le type de vente, la date et le client concerne.
                </p>
              </div>
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                {selectedProduct?.hint}
              </span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700">Type de produit</label>
                <select
                  value={productType}
                  onChange={(event) => handleProductTypeChange(event.target.value as ProductType)}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                >
                  {PRODUCT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Date de vente</label>
                <input
                  type="date"
                  required
                  value={saleDate}
                  onChange={(event) => setSaleDate(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-700">Client</label>
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                >
                  <option value="">Client divers / non selectionne</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}{customer.phone ? ` - ${customer.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Lignes de vente</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Associe un lot si besoin et saisis les quantites vendues.
                </p>
              </div>

              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-green-700"
              >
                <Plus className="h-4 w-4" />
                Ajouter une ligne
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {items.map((item, index) => {
                const itemTotal = computeItemTotal(item)

                return (
                  <div
                    key={index}
                    className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900">
                        Ligne {index + 1}
                      </p>

                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 transition hover:text-red-700 disabled:cursor-not-allowed disabled:text-gray-300"
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                      <div className="xl:col-span-2">
                        <label className="text-sm font-medium text-gray-700">Description</label>
                        <input
                          required
                          value={item.description}
                          onChange={(event) => updateItem(index, "description", event.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                          placeholder="Ex: 50 poulets vendus au marche"
                        />
                      </div>

                      <div className="xl:col-span-2">
                        <label className="text-sm font-medium text-gray-700">Lot associe</label>
                        <select
                          value={item.batchId}
                          onChange={(event) => updateItem(index, "batchId", event.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                        >
                          <option value="">Aucun lot precise</option>
                          {batches.map((batch) => (
                            <option key={batch.id} value={batch.id}>
                              {batch.number} - {batch.farmName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700">Total ligne</label>
                        <div className="mt-1.5 rounded-xl border border-dashed border-green-200 bg-green-50 px-3 py-2.5 text-sm font-semibold text-green-800">
                          {formatMoneyFCFA(itemTotal)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="text-sm font-medium text-gray-700">Quantite</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={(event) => updateItem(index, "quantity", Number(event.target.value))}
                          className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700">Unite</label>
                        <select
                          value={item.unit}
                          onChange={(event) => updateItem(index, "unit", event.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                        >
                          {UNIT_OPTIONS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700">Prix unitaire (FCFA)</label>
                        <input
                          type="number"
                          min="0"
                          value={item.unitPriceFcfa}
                          onChange={(event) => updateItem(index, "unitPriceFcfa", Number(event.target.value))}
                          className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <label className="text-sm font-medium text-gray-700">Notes internes</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Informations utiles pour la facturation ou le suivi du client."
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-green-500"
            />
          </div>
        </section>

        <aside className="space-y-5">
          <OfflineSyncCard
            isOnline={isOnline}
            pendingCount={pendingItems.length}
            failedCount={pendingItems.filter((item) => item.status === "failed").length}
            isSyncing={isSyncing}
            lastSyncedAt={lastSyncedAt}
            lastError={lastSyncError}
            items={pendingItems}
            onSync={() => {
              void syncOfflineQueue()
            }}
            onRetryItem={(itemId) => {
              void retryOfflineItem(itemId)
            }}
            onRemoveItem={(itemId) => {
              void removeOfflineItem(itemId)
            }}
          />

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Resume de la vente</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {formatMoneyFCFA(totalFcfa)}
            </p>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between text-gray-600">
                <span>Lignes</span>
                <span className="font-medium text-gray-900">{items.length}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Produit</span>
                <span className="font-medium text-gray-900">{selectedProduct?.label}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Client</span>
                <span className="max-w-[11rem] truncate font-medium text-gray-900">
                  {customers.find((customer) => customer.id === customerId)?.name ?? "Client divers"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Le total est calcule automatiquement a partir des lignes. Si tu lies un lot,
                la rentabilite du cycle sera plus juste dans les rapports.
              </p>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {success}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
          >
            {loading ? "Enregistrement..." : "Creer la vente"}
          </button>
        </aside>
      </div>
    </form>
  )
}
