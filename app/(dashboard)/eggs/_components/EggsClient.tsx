"use client"

import { useState, useTransition } from "react"
import { useForm, type SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Plus, Egg, Trash2, TrendingUp } from "lucide-react"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"
import { Label } from "@/src/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import {
  getEggRecords,
  createEggRecord,
  deleteEggRecord,
  type EggRecordSummary,
} from "@/src/actions/eggs"
import type { BatchSummary } from "@/src/actions/batches"
import { formatDate, formatNumber, formatPercent } from "@/src/lib/formatters"

// ---------------------------------------------------------------------------
// Schéma
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  organizationId: string
  userRole: string
  pondeuseBatches: BatchSummary[]
  initialRecords: EggRecordSummary[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function layingRate(totalEggs: number, batchEntryCount: number): number {
  if (batchEntryCount <= 0) return 0
  return (totalEggs / batchEntryCount) * 100
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function EggsClient({ organizationId, userRole, pondeuseBatches, initialRecords }: Props) {
  const [records, setRecords] = useState<EggRecordSummary[]>(initialRecords)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const canEdit = ["SUPER_ADMIN", "OWNER", "MANAGER", "TECHNICIAN", "DATA_ENTRY"].includes(userRole)

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
      const res = await createEggRecord({
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
        toast.success("Record d'œufs enregistré")
        const refreshed = await getEggRecords({ organizationId, limit: 50 })
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
        toast.success("Record supprimé")
        setRecords((r) => r.filter((x) => x.id !== recordId))
      } else {
        toast.error(res.error)
      }
    })
  }

  // ── Stats globales ──────────────────────────────────────────────────────

  const todayStr = new Date().toISOString().split("T")[0]
  const todayRecords = records.filter(
    (r) => new Date(r.date).toISOString().split("T")[0] === todayStr,
  )
  const totalTodayEggs = todayRecords.reduce((s, r) => s + r.totalEggs, 0)
  const totalTodaySellable = todayRecords.reduce((s, r) => s + r.sellableEggs, 0)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Production d&apos;œufs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pondeuseBatches.length} lot{pondeuseBatches.length !== 1 ? "s" : ""} pondeuse actif{pondeuseBatches.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canEdit && pondeuseBatches.length > 0 && (
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Saisir
          </Button>
        )}
      </div>

      {todayRecords.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total œufs aujourd&apos;hui</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(totalTodayEggs)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Commercialisables</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatNumber(totalTodaySellable)}</p>
              {totalTodayEggs > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatPercent((totalTodaySellable / totalTodayEggs) * 100, 0)} du total
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {showForm && canEdit && (
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
                    <option value="">Sélectionner un lot</option>
                    {pondeuseBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.number} — {b.building.name}
                      </option>
                    ))}
                  </select>
                  {errors.batchId && (
                    <p className="mt-1 text-xs text-red-600">{errors.batchId.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="egg-date" required>Date</Label>
                  <Input
                    id="egg-date"
                    type="date"
                    error={errors.date?.message}
                    {...register("date")}
                  />
                </div>

                <div>
                  <Label htmlFor="total-eggs" required>Total œufs ramassés</Label>
                  <Input
                    id="total-eggs"
                    type="number"
                    error={errors.totalEggs?.message}
                    {...register("totalEggs")}
                  />
                </div>

                <div>
                  <Label htmlFor="sellable-eggs" required>Commercialisables</Label>
                  <Input
                    id="sellable-eggs"
                    type="number"
                    error={errors.sellableEggs?.message}
                    {...register("sellableEggs")}
                  />
                </div>

                <div>
                  <Label htmlFor="broken">Cassés</Label>
                  <Input
                    id="broken"
                    type="number"
                    error={errors.brokenEggs?.message}
                    {...register("brokenEggs")}
                  />
                </div>

                <div>
                  <Label htmlFor="dirty">Sales</Label>
                  <Input
                    id="dirty"
                    type="number"
                    error={errors.dirtyEggs?.message}
                    {...register("dirtyEggs")}
                  />
                </div>

                <div>
                  <Label htmlFor="small">Petits / Déclassés</Label>
                  <Input
                    id="small"
                    type="number"
                    error={errors.smallEggs?.message}
                    {...register("smallEggs")}
                  />
                </div>

                <div>
                  <Label htmlFor="passages">Nb passages</Label>
                  <Input
                    id="passages"
                    type="number"
                    min="1"
                    max="10"
                    error={errors.passageCount?.message}
                    {...register("passageCount")}
                  />
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
      )}

      {pondeuseBatches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Egg className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-900">Aucun lot pondeuse actif</p>
            <p className="text-sm text-gray-500 mt-1">
              Créez un lot de type Pondeuse pour saisir la production.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Historique de production
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {records.length === 0 ? (
              <p className="text-sm text-gray-500 px-4 py-6 text-center">
                Aucun record encore. Commencez à saisir la production.
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {records.map((rec) => {
                  const batch = pondeuseBatches.find((b) => b.id === rec.batchId)
                  const rate = batch ? layingRate(rec.totalEggs, batch.entryCount) : null

                  return (
                    <div key={rec.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {formatDate(rec.date)}
                          </span>
                          {rate !== null && (
                            <span
                              className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                                rate >= 70
                                  ? "bg-green-50 text-green-700"
                                  : rate >= 50
                                    ? "bg-orange-50 text-orange-700"
                                    : "bg-red-50 text-red-700"
                              }`}
                            >
                              {formatPercent(rate, 0)} ponte
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {rec.batch.number} — {rec.totalEggs} œufs
                          {rec.brokenEggs + rec.dirtyEggs + rec.smallEggs > 0 && (
                            <span className="text-orange-500">
                              {" "}({rec.brokenEggs} cassés, {rec.dirtyEggs} sales)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 ml-2 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-700">{formatNumber(rec.sellableEggs)}</p>
                          <p className="text-xs text-gray-400">vendables</p>
                        </div>
                        {canEdit && (
                          <button
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                            onClick={() => onDelete(rec.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
