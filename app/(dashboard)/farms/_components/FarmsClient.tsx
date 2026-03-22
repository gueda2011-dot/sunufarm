"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Plus, ChevronDown, ChevronUp, Pencil, Trash2, Warehouse, Building2 } from "lucide-react"
import { Button } from "@/src/components/ui/button"
import { Input }  from "@/src/components/ui/input"
import { Label }  from "@/src/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import {
  getFarms,
  createFarm,
  updateFarm,
  deleteFarm,
  type FarmSummary,
} from "@/src/actions/farms"
import {
  getBuildings,
  createBuilding,
  deleteBuilding,
  type BuildingSummary,
} from "@/src/actions/buildings"

// ---------------------------------------------------------------------------
// Schémas
// ---------------------------------------------------------------------------

const farmSchema = z.object({
  name:          z.string().min(1, "Nom requis").max(100),
  code:          z.string().max(20).optional(),
  address:       z.string().max(255).optional(),
  totalCapacity: z.coerce.number().int().positive().optional().or(z.literal("")),
})

const buildingSchema = z.object({
  name:     z.string().min(1, "Nom requis").max(100),
  code:     z.string().max(20).optional(),
  type:     z.enum(["POULAILLER_OUVERT", "POULAILLER_FERME", "POULAILLER_SEMI_FERME"]),
  capacity: z.coerce.number().int().positive("Capacité requise"),
})

type FarmForm     = z.infer<typeof farmSchema>
type BuildingForm = z.infer<typeof buildingSchema>

const BUILDING_TYPE_LABELS: Record<string, string> = {
  POULAILLER_OUVERT:      "Ouvert",
  POULAILLER_FERME:       "Fermé",
  POULAILLER_SEMI_FERME:  "Semi-fermé",
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  organizationId: string
  userRole:       string
  initialFarms:   FarmSummary[]
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function FarmsClient({ organizationId, userRole, initialFarms }: Props) {
  const [farms, setFarms]           = useState<FarmSummary[]>(initialFarms)
  const [expandedFarm, setExpanded] = useState<string | null>(null)
  const [buildings, setBuildings]   = useState<Record<string, BuildingSummary[]>>({})
  const [showFarmForm, setShowFarm] = useState(false)
  const [editingFarm, setEditFarm]  = useState<FarmSummary | null>(null)
  const [addBldgFor, setAddBldg]    = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const canEdit = ["SUPER_ADMIN", "OWNER", "MANAGER"].includes(userRole)

  // Formulaire ferme
  const farmForm = useForm<FarmForm>({
    resolver: zodResolver(farmSchema),
    defaultValues: { name: "", code: "", address: "", totalCapacity: "" },
  })

  // Formulaire bâtiment
  const bldgForm = useForm<BuildingForm>({
    resolver: zodResolver(buildingSchema),
    defaultValues: { name: "", code: "", type: "POULAILLER_FERME", capacity: 0 },
  })

  // ── Fermes ─────────────────────────────────────────────────────────────

  async function loadBuildings(farmId: string) {
    if (buildings[farmId]) return
    const res = await getBuildings({ organizationId, farmId })
    if (res.success) {
      setBuildings((prev) => ({ ...prev, [farmId]: res.data }))
    }
  }

  function toggleFarm(farmId: string) {
    if (expandedFarm === farmId) {
      setExpanded(null)
    } else {
      setExpanded(farmId)
      loadBuildings(farmId)
    }
  }

  function openEditFarm(farm: FarmSummary) {
    setEditFarm(farm)
    farmForm.reset({
      name:          farm.name,
      code:          farm.code ?? "",
      address:       farm.address ?? "",
      totalCapacity: farm.totalCapacity ?? "",
    })
    setShowFarm(true)
  }

  function resetFarmForm() {
    setShowFarm(false)
    setEditFarm(null)
    farmForm.reset({ name: "", code: "", address: "", totalCapacity: "" })
  }

  async function onFarmSubmit(data: FarmForm) {
    startTransition(async () => {
      const payload = {
        organizationId,
        name:          data.name,
        code:          data.code || undefined,
        address:       data.address || undefined,
        totalCapacity: data.totalCapacity ? Number(data.totalCapacity) : undefined,
      }

      const res = editingFarm
        ? await updateFarm({ ...payload, farmId: editingFarm.id })
        : await createFarm(payload)

      if (res.success) {
        toast.success(editingFarm ? "Ferme modifiée" : "Ferme créée")
        const refreshed = await getFarms({ organizationId })
        if (refreshed.success) setFarms(refreshed.data)
        resetFarmForm()
      } else {
        toast.error(res.error)
      }
    })
  }

  async function onDeleteFarm(farmId: string) {
    if (!confirm("Supprimer cette ferme ? Cette action est irréversible.")) return
    startTransition(async () => {
      const res = await deleteFarm({ organizationId, farmId })
      if (res.success) {
        toast.success("Ferme supprimée")
        setFarms((f) => f.filter((x) => x.id !== farmId))
        if (expandedFarm === farmId) setExpanded(null)
      } else {
        toast.error(res.error)
      }
    })
  }

  // ── Bâtiments ──────────────────────────────────────────────────────────

  function openAddBuilding(farmId: string) {
    setAddBldg(farmId)
    bldgForm.reset({ name: "", code: "", type: "POULAILLER_FERME", capacity: 0 })
  }

  async function onBuildingSubmit(data: BuildingForm) {
    if (!addBldgFor) return
    startTransition(async () => {
      const res = await createBuilding({
        organizationId,
        farmId:   addBldgFor,
        name:     data.name,
        code:     data.code || undefined,
        type:     data.type as "POULAILLER_OUVERT" | "POULAILLER_FERME" | "POULAILLER_SEMI_FERME",
        capacity: data.capacity,
      })

      if (res.success) {
        toast.success("Bâtiment créé")
        // Rafraîchir les bâtiments de cette ferme
        const refreshed = await getBuildings({ organizationId, farmId: addBldgFor })
        if (refreshed.success) {
          setBuildings((prev) => ({ ...prev, [addBldgFor]: refreshed.data }))
        }
        // Mettre à jour le compteur de bâtiments dans la liste des fermes
        const refreshedFarms = await getFarms({ organizationId })
        if (refreshedFarms.success) setFarms(refreshedFarms.data)
        setAddBldg(null)
        bldgForm.reset()
      } else {
        toast.error(res.error)
      }
    })
  }

  async function onDeleteBuilding(farmId: string, buildingId: string) {
    if (!confirm("Supprimer ce bâtiment ?")) return
    startTransition(async () => {
      const res = await deleteBuilding({ organizationId, farmId, buildingId })
      if (res.success) {
        toast.success("Bâtiment supprimé")
        setBuildings((prev) => ({
          ...prev,
          [farmId]: (prev[farmId] ?? []).filter((b) => b.id !== buildingId),
        }))
      } else {
        toast.error(res.error)
      }
    })
  }

  // ── Rendu ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fermes & Bâtiments</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {farms.length} ferme{farms.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canEdit && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              resetFarmForm()
              setShowFarm(true)
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nouvelle ferme
          </Button>
        )}
      </div>

      {/* Formulaire de création / modification de ferme */}
      {showFarmForm && canEdit && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editingFarm ? "Modifier la ferme" : "Nouvelle ferme"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={farmForm.handleSubmit(onFarmSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="farm-name" required>Nom</Label>
                  <Input
                    id="farm-name"
                    placeholder="Ferme de Thiès"
                    error={farmForm.formState.errors.name?.message}
                    {...farmForm.register("name")}
                  />
                </div>
                <div>
                  <Label htmlFor="farm-code">Code court</Label>
                  <Input
                    id="farm-code"
                    placeholder="THIS-01"
                    {...farmForm.register("code")}
                  />
                </div>
                <div>
                  <Label htmlFor="farm-address">Adresse</Label>
                  <Input
                    id="farm-address"
                    placeholder="Route de Tivaouane, Thiès"
                    {...farmForm.register("address")}
                  />
                </div>
                <div>
                  <Label htmlFor="farm-capacity">Capacité totale (sujets)</Label>
                  <Input
                    id="farm-capacity"
                    type="number"
                    placeholder="5000"
                    {...farmForm.register("totalCapacity")}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  loading={isPending}
                >
                  {editingFarm ? "Enregistrer" : "Créer la ferme"}
                </Button>
                <Button type="button" variant="outline" onClick={resetFarmForm}>
                  Annuler
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Liste des fermes */}
      {farms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Warehouse className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-900">Aucune ferme</p>
            <p className="text-sm text-gray-500 mt-1">
              Créez votre première ferme pour commencer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {farms.map((farm) => (
            <Card key={farm.id} className="overflow-hidden">
              {/* Ligne ferme */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleFarm(farm.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && toggleFarm(farm.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50">
                    <Warehouse className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{farm.name}</p>
                    <p className="text-xs text-gray-500">
                      {farm.code && <span className="mr-2">{farm.code}</span>}
                      {farm._count.buildings} bâtiment{farm._count.buildings !== 1 ? "s" : ""}
                      {farm.totalCapacity && ` · ${farm.totalCapacity.toLocaleString("fr-SN")} sujets max`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  {canEdit && (
                    <>
                      <button
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                        onClick={(e) => { e.stopPropagation(); openEditFarm(farm) }}
                        aria-label="Modifier la ferme"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                        onClick={(e) => { e.stopPropagation(); onDeleteFarm(farm.id) }}
                        aria-label="Supprimer la ferme"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {expandedFarm === farm.id
                    ? <ChevronUp className="h-4 w-4 text-gray-400" />
                    : <ChevronDown className="h-4 w-4 text-gray-400" />
                  }
                </div>
              </div>

              {/* Bâtiments (dépliés) */}
              {expandedFarm === farm.id && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                  {farm.address && (
                    <p className="text-xs text-gray-500 mb-3">{farm.address}</p>
                  )}

                  {/* Liste des bâtiments */}
                  {(buildings[farm.id] ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">Aucun bâtiment.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(buildings[farm.id] ?? []).map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{b.name}</p>
                              <p className="text-xs text-gray-500">
                                {BUILDING_TYPE_LABELS[b.type] ?? b.type}
                                {" · "}{b.capacity.toLocaleString("fr-SN")} sujets
                                {b.code && ` · ${b.code}`}
                              </p>
                            </div>
                          </div>
                          {canEdit && (
                            <button
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors shrink-0 ml-2"
                              onClick={() => onDeleteBuilding(farm.id, b.id)}
                              aria-label="Supprimer le bâtiment"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Formulaire bâtiment */}
                  {addBldgFor === farm.id ? (
                    <form
                      onSubmit={bldgForm.handleSubmit(onBuildingSubmit)}
                      className="bg-white rounded-lg p-3 shadow-sm space-y-3 mt-2"
                    >
                      <p className="text-sm font-medium text-gray-900">Nouveau bâtiment</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label htmlFor="bldg-name" required>Nom</Label>
                          <Input
                            id="bldg-name"
                            placeholder="Poulailler A"
                            error={bldgForm.formState.errors.name?.message}
                            {...bldgForm.register("name")}
                          />
                        </div>
                        <div>
                          <Label htmlFor="bldg-code">Code</Label>
                          <Input
                            id="bldg-code"
                            placeholder="BAT-A"
                            {...bldgForm.register("code")}
                          />
                        </div>
                        <div>
                          <Label htmlFor="bldg-type" required>Type</Label>
                          <select
                            id="bldg-type"
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            {...bldgForm.register("type")}
                          >
                            <option value="POULAILLER_FERME">Fermé</option>
                            <option value="POULAILLER_OUVERT">Ouvert</option>
                            <option value="POULAILLER_SEMI_FERME">Semi-fermé</option>
                          </select>
                        </div>
                        <div>
                          <Label htmlFor="bldg-cap" required>Capacité</Label>
                          <Input
                            id="bldg-cap"
                            type="number"
                            placeholder="2500"
                            error={bldgForm.formState.errors.capacity?.message}
                            {...bldgForm.register("capacity")}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" variant="primary" size="sm" loading={isPending}>
                          Créer
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setAddBldg(null)}>
                          Annuler
                        </Button>
                      </div>
                    </form>
                  ) : (
                    canEdit && (
                      <button
                        className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium mt-1"
                        onClick={() => openAddBuilding(farm.id)}
                      >
                        <Plus className="h-4 w-4" />
                        Ajouter un bâtiment
                      </button>
                    )
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
