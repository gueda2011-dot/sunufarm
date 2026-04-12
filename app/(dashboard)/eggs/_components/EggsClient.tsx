"use client"

import { useEffect, useState, useTransition } from "react"
import { useForm, type SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Egg, Plus, Target, Trash2, TrendingUp } from "lucide-react"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"
import { Label } from "@/src/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import {
  createEggRecord,
  deleteEggRecord,
  getEggRecords,
  type EggRecordSummary,
} from "@/src/actions/eggs"
import {
  createClientMutationId,
  enqueueOfflineEggRecord,
} from "@/src/lib/offline-mutation-outbox"
import {
  addOptimisticItem,
  listOptimisticItems,
  subscribeToOptimisticItems,
} from "@/src/lib/offline-optimistic"
import { useOfflineData } from "@/src/hooks/useOfflineData"
import { useOfflineSyncStatus } from "@/src/hooks/useOfflineSyncStatus"
import { OFFLINE_RESOURCE_KEYS } from "@/src/lib/offline-keys"
import { OFFLINE_TTL_MS } from "@/src/lib/offline-ttl"
import { loadEggRecordsFromLocal } from "@/src/lib/offline/repositories/transactionLoaders"
import type { BatchSummary } from "@/src/actions/batches"
import { formatDate, formatNumber, formatPercent } from "@/src/lib/formatters"
import { layingRate as calculateLayingRate } from "@/src/lib/kpi"
import { OfflineSyncCard } from "@/app/(dashboard)/daily/_components/OfflineSyncCard"

const schema = z.object({
  batchId: z.string().min(1, "Lot requis"),
  date: z.string().min(1, "Date requise"),
  totalEggs: z.coerce.number().int().nonnegative("Valeur invalide"),
  sellableEggs: z.coerce.number().int().nonnegative("Valeur invalide"),
  brokenEggs: z.coerce.number().int().nonnegative().default(0),
  dirtyEggs: z.coerce.number().int().nonnegative().default(0),
  smallEggs: z.coerce.number().int().nonnegative().default(0),
  passageCount: z.coerce.number().int().min(1).max(10).default(1),
  observations: z.string().max(1000).optional(),
})

type FormValues = z.input<typeof schema>
type SubmitValues = z.output<typeof schema>

export interface LayerBatchMetric {
  batchId: string
  entryCount: number
  liveHensToday: number
  mortalityCheckpoints: Array<{
    date: string
    cumulativeMortality: number
  }>
}

interface Props {
  organizationId: string
  userRole: string
  pondeuseBatches: BatchSummary[]
  initialRecords: EggRecordSummary[]
  layerBatchMetrics: LayerBatchMetric[]
}

function toDateKey(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10)
}

function getLiveHensForDate(
  batchId: string,
  dateKey: string,
  metricsByBatchId: Map<string, LayerBatchMetric>,
): number | null {
  const metrics = metricsByBatchId.get(batchId)
  if (!metrics) return null

  let cumulativeMortality = 0
  for (const checkpoint of metrics.mortalityCheckpoints) {
    if (checkpoint.date > dateKey) break
    cumulativeMortality = checkpoint.cumulativeMortality
  }

  return Math.max(0, metrics.entryCount - cumulativeMortality)
}

function getRecentDateThreshold(days: number): Date {
  const threshold = new Date()
  threshold.setHours(0, 0, 0, 0)
  threshold.setDate(threshold.getDate() - (days - 1))
  return threshold
}

export function EggsClient({
  organizationId,
  userRole,
  pondeuseBatches,
  initialRecords,
  layerBatchMetrics,
}: Props) {
  const {
    isOnline,
    pendingCount,
    failedCount,
    items,
    isSyncing,
    lastSyncedAt,
    lastError,
    sync,
    retryItem,
    removeItem,
  } = useOfflineSyncStatus({ scope: "eggs" })
  const { data: cachedBatches = pondeuseBatches } = useOfflineData({
    key: OFFLINE_RESOURCE_KEYS.eggsBatches,
    organizationId,
    initialData: pondeuseBatches,
    ttlMs: OFFLINE_TTL_MS.references,
  })
  const { data: cachedRecords = initialRecords, isOfflineFallback: usesOfflineRecords } = useOfflineData({
    key: OFFLINE_RESOURCE_KEYS.eggsRecords,
    organizationId,
    initialData: initialRecords,
    ttlMs: OFFLINE_TTL_MS.records,
    localLoader: () => loadEggRecordsFromLocal(organizationId),
  })
  useOfflineData({
    key: OFFLINE_RESOURCE_KEYS.eggsMetrics,
    organizationId,
    initialData: layerBatchMetrics,
    ttlMs: OFFLINE_TTL_MS.records,
  })

  const [records, setRecords] = useState<EggRecordSummary[]>(cachedRecords)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [optimisticEntries, setOptimisticEntries] = useState<Array<{
    id: string
    label?: string
    updatedAt: string
    status: "pending" | "syncing" | "failed" | "synced"
    error?: string
  }>>([])

  const canEdit = ["SUPER_ADMIN", "OWNER", "MANAGER", "TECHNICIAN", "DATA_ENTRY"].includes(userRole)
  const metricsByBatchId = new Map(layerBatchMetrics.map((metric) => [metric.batchId, metric]))

  useEffect(() => {
    setRecords(cachedRecords)
  }, [cachedRecords])

  useEffect(() => {
    async function refreshOptimisticEntries() {
      const items = await listOptimisticItems(organizationId, "eggs")
      setOptimisticEntries(items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    }

    void refreshOptimisticEntries()
    const unsubscribe = subscribeToOptimisticItems(() => {
      void refreshOptimisticEntries()
    })

    return () => {
      unsubscribe()
    }
  }, [organizationId])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, SubmitValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      batchId: "",
      date: new Date().toISOString().split("T")[0],
      totalEggs: 0,
      sellableEggs: 0,
      brokenEggs: 0,
      dirtyEggs: 0,
      smallEggs: 0,
      passageCount: 1,
      observations: "",
    },
  })

  const onSubmit: SubmitHandler<SubmitValues> = async (data) => {
    startTransition(async () => {
      const clientMutationId = createClientMutationId("egg")
      const online = typeof navigator !== "undefined" ? navigator.onLine : true

      if (!online) {
        await addOptimisticItem({
          id: clientMutationId,
          organizationId,
          scope: "eggs",
          type: "CREATE_EGG_RECORD",
          label: `Production oeufs ${data.date}`,
          data: {
            batchId: data.batchId,
            totalEggs: data.totalEggs,
            sellableEggs: data.sellableEggs,
            date: data.date,
          },
        })
        await enqueueOfflineEggRecord({
          clientMutationId,
          organizationId,
          batchId: data.batchId,
          date: data.date,
          totalEggs: data.totalEggs,
          sellableEggs: data.sellableEggs,
          brokenEggs: data.brokenEggs,
          dirtyEggs: data.dirtyEggs,
          smallEggs: data.smallEggs,
          passageCount: data.passageCount,
          observations: data.observations || undefined,
        })
        toast.info("Hors ligne - record sauvegarde localement, synchro au retour du reseau")
        reset({
          batchId: "",
          date: new Date().toISOString().split("T")[0],
          totalEggs: 0,
          sellableEggs: 0,
          brokenEggs: 0,
          dirtyEggs: 0,
          smallEggs: 0,
          passageCount: 1,
          observations: "",
        })
        setShowForm(false)
        return
      }

      const res = await createEggRecord({
        clientMutationId,
        organizationId,
        batchId: data.batchId,
        date: new Date(data.date),
        totalEggs: data.totalEggs,
        sellableEggs: data.sellableEggs,
        brokenEggs: data.brokenEggs,
        dirtyEggs: data.dirtyEggs,
        smallEggs: data.smallEggs,
        passageCount: data.passageCount,
        observations: data.observations || undefined,
      })

      if (res.success) {
        toast.success("Record d'oeufs enregistre")
        const refreshed = await getEggRecords({ organizationId, limit: 100 })
        if (refreshed.success) setRecords(refreshed.data)
        reset({
          batchId: "",
          date: new Date().toISOString().split("T")[0],
          totalEggs: 0,
          sellableEggs: 0,
          brokenEggs: 0,
          dirtyEggs: 0,
          smallEggs: 0,
          passageCount: 1,
          observations: "",
        })
        setShowForm(false)
      } else {
        toast.error(res.error)
      }
    })
  }

  async function onDelete(recordId: string) {
    if (!confirm("Supprimer ce record ?")) return

    startTransition(async () => {
      const res = await deleteEggRecord({ organizationId, recordId })
      if (res.success) {
        toast.success("Record supprime")
        setRecords((current) => current.filter((record) => record.id !== recordId))
      } else {
        toast.error(res.error)
      }
    })
  }

  const todayKey = toDateKey(new Date())
  const recentThreshold = getRecentDateThreshold(7)
  const todayRecords = records.filter((record) => toDateKey(record.date) === todayKey)
  const recentRecords = records.filter((record) => new Date(record.date) >= recentThreshold)

  const totalTodayEggs = todayRecords.reduce((sum, record) => sum + record.totalEggs, 0)
  const totalTodaySellable = todayRecords.reduce((sum, record) => sum + record.sellableEggs, 0)
  const totalTodayLiveHens = layerBatchMetrics.reduce(
    (sum, metric) => sum + metric.liveHensToday,
    0,
  )
  const todayLayingRate = calculateLayingRate(totalTodayEggs, totalTodayLiveHens)
  const todaySellableRate =
    totalTodayEggs > 0 ? (totalTodaySellable / totalTodayEggs) * 100 : null

  const totalRecentEggs = recentRecords.reduce((sum, record) => sum + record.totalEggs, 0)
  const recentDates = new Set(recentRecords.map((record) => toDateKey(record.date)))
  const averageRecentEggs =
    recentDates.size > 0 ? Math.round(totalRecentEggs / recentDates.size) : 0

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Production d&apos;oeufs</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {cachedBatches.length} lot{cachedBatches.length !== 1 ? "s" : ""} pondeuse actif{cachedBatches.length !== 1 ? "s" : ""}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            Lecture terrain des couches: volume du jour, qualite vendable et taux de ponte
            estime sur les poules vivantes.
          </p>
          {!isOnline && usesOfflineRecords ? (
            <p className="mt-1 text-xs text-amber-700">
              Historique des oeufs affiche depuis le dernier etat connu.
            </p>
          ) : null}
        </div>

        {canEdit && cachedBatches.length > 0 ? (
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Saisir
          </Button>
        ) : null}
      </div>

      <OfflineSyncCard
        isOnline={isOnline}
        pendingCount={pendingCount}
        failedCount={failedCount}
        isSyncing={isSyncing}
        lastSyncedAt={lastSyncedAt}
        lastError={lastError}
        items={items}
        onSync={() => {
          void sync()
        }}
        onRetryItem={(itemId) => {
          void retryItem(itemId)
        }}
        onRemoveItem={(itemId) => {
          void removeItem(itemId)
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="border-yellow-200 bg-yellow-50/80">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-yellow-700">Oeufs aujourd&apos;hui</p>
            <p className="mt-1 text-2xl font-bold text-yellow-950">{formatNumber(totalTodayEggs)}</p>
            <p className="mt-1 text-xs text-yellow-800">
              sur {formatNumber(totalTodayLiveHens)} poules vivantes estimees
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Oeufs vendables</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{formatNumber(totalTodaySellable)}</p>
            <p className="mt-1 text-xs text-gray-500">volume exploitable du jour</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Taux de ponte</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {todayLayingRate != null ? formatPercent(todayLayingRate, 1) : "-"}
            </p>
            <p className="mt-1 text-xs text-gray-500">corrige par effectif vivant</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Taux vendable</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {todaySellableRate != null ? formatPercent(todaySellableRate, 1) : "-"}
            </p>
            <p className="mt-1 text-xs text-gray-500">part des oeufs commercialisables</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Moyenne recente</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{formatNumber(averageRecentEggs)}</p>
            <p className="mt-1 text-xs text-gray-500">oeufs par jour sur les 7 derniers jours</p>
          </CardContent>
        </Card>
      </div>

      {optimisticEntries.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Saisies locales en attente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {optimisticEntries.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-amber-100 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-gray-900">{entry.label ?? entry.id}</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                    entry.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {entry.status === "failed" ? "Erreur sync" : "En attente"}
                  </span>
                </div>
                {entry.error ? (
                  <p className="mt-1 text-xs text-red-700">{entry.error}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {showForm && canEdit ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Saisir la production</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="egg-batch" required>Lot</Label>
                  <select
                    id="egg-batch"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    {...register("batchId")}
                  >
                    <option value="">Selectionner un lot</option>
                    {cachedBatches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.number} - {batch.building.name}
                      </option>
                    ))}
                  </select>
                  {errors.batchId ? (
                    <p className="mt-1 text-xs text-red-600">{errors.batchId.message}</p>
                  ) : null}
                </div>

                <div>
                  <Label htmlFor="egg-date" required>Date</Label>
                  <Input id="egg-date" type="date" error={errors.date?.message} {...register("date")} />
                </div>

                <div>
                  <Label htmlFor="total-eggs" required>Total oeufs ramasses</Label>
                  <Input id="total-eggs" type="number" error={errors.totalEggs?.message} {...register("totalEggs")} />
                </div>

                <div>
                  <Label htmlFor="sellable-eggs" required>Commercialisables</Label>
                  <Input id="sellable-eggs" type="number" error={errors.sellableEggs?.message} {...register("sellableEggs")} />
                </div>

                <div>
                  <Label htmlFor="broken">Casses</Label>
                  <Input id="broken" type="number" error={errors.brokenEggs?.message} {...register("brokenEggs")} />
                </div>

                <div>
                  <Label htmlFor="dirty">Sales</Label>
                  <Input id="dirty" type="number" error={errors.dirtyEggs?.message} {...register("dirtyEggs")} />
                </div>

                <div>
                  <Label htmlFor="small">Petits / declasses</Label>
                  <Input id="small" type="number" error={errors.smallEggs?.message} {...register("smallEggs")} />
                </div>

                <div>
                  <Label htmlFor="passages">Nb passages</Label>
                  <Input id="passages" type="number" min="1" max="10" error={errors.passageCount?.message} {...register("passageCount")} />
                </div>
              </div>

              <div>
                <Label htmlFor="obs">Observations</Label>
                <Input
                  id="obs"
                  placeholder="Observations optionnelles..."
                  error={errors.observations?.message}
                  {...register("observations")}
                />
              </div>

              <div className="flex gap-3">
                <Button type="submit" variant="primary" loading={isPending}>
                  Enregistrer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false)
                    reset({
                      batchId: "",
                      date: new Date().toISOString().split("T")[0],
                      totalEggs: 0,
                      sellableEggs: 0,
                      brokenEggs: 0,
                      dirtyEggs: 0,
                      smallEggs: 0,
                      passageCount: 1,
                      observations: "",
                    })
                  }}
                >
                  Annuler
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {cachedBatches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Egg className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-900">Aucun lot pondeuse actif</p>
            <p className="mt-1 text-sm text-gray-500">
              Creez un lot de type Pondeuse pour saisir la production.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Historique de production
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {records.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-500">
                  Aucun record encore. Commencez a saisir la production.
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {records.map((record) => {
                    const batch = cachedBatches.find((item) => item.id === record.batchId)
                    const estimatedLiveHens = getLiveHensForDate(
                      record.batchId,
                      toDateKey(record.date),
                      metricsByBatchId,
                    )
                    const rate =
                      estimatedLiveHens != null
                        ? calculateLayingRate(record.totalEggs, estimatedLiveHens)
                        : null
                    const qualityRate =
                      record.totalEggs > 0
                        ? (record.sellableEggs / record.totalEggs) * 100
                        : null

                    return (
                      <div key={record.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{formatDate(record.date)}</span>
                            {rate != null ? (
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                                  rate >= 70
                                    ? "bg-green-50 text-green-700"
                                    : rate >= 50
                                      ? "bg-orange-50 text-orange-700"
                                      : "bg-red-50 text-red-700"
                                }`}
                              >
                                {formatPercent(rate, 0)} ponte
                              </span>
                            ) : null}
                            {qualityRate != null ? (
                              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                                {formatPercent(qualityRate, 0)} vendable
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {record.batch.number} - {formatNumber(record.totalEggs)} oeufs
                            {batch ? ` - ${batch.building.name}` : ""}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            Base estimee: {formatNumber(estimatedLiveHens ?? batch?.entryCount ?? 0)} poules vivantes
                          </p>
                        </div>

                        <div className="ml-2 flex shrink-0 items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-bold text-green-700">{formatNumber(record.sellableEggs)}</p>
                            <p className="text-xs text-gray-400">vendables</p>
                          </div>

                          {canEdit ? (
                            <button
                              className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              onClick={() => onDelete(record.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-amber-600" />
                Lecture rapide
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Lots actifs</p>
                <p className="mt-1 text-xl font-bold text-gray-900">{formatNumber(cachedBatches.length)}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {formatNumber(totalTodayLiveHens)} poules vivantes estimees a suivre
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm font-semibold text-gray-900">Ce que tu peux dire en demo</p>
                <p className="mt-2 text-sm text-gray-600">
                  Ici, on ne montre pas seulement combien d&apos;oeufs ont ete ramasses.
                  On voit aussi le taux de ponte reel et la part vendable, donc la qualite
                  economique de la journee.
                </p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">Correction metier</p>
                <p className="mt-2 text-sm text-amber-800">
                  Le taux de ponte n&apos;est plus lu sur l&apos;effectif d&apos;entree. Il est estime
                  sur les poules vivantes a partir de la mortalite cumulee du lot.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
