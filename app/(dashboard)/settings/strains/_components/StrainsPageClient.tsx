"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import type {
  PoultryProductionType,
  PoultrySpecies,
  UserRole,
} from "@/src/generated/prisma/client"
import { updatePoultryStrain } from "@/src/actions/poultry-strains"

const PRODUCTION_TYPE_LABELS: Record<PoultryProductionType, string> = {
  BROILER: "Chair",
  LAYER: "Ponte",
  LOCAL: "Locale",
  DUAL: "Mixte",
}

const SPECIES_LABELS: Record<PoultrySpecies, string> = {
  CHICKEN: "Poulet",
  GUINEA_FOWL: "Pintade",
}

const CAN_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "OWNER", "MANAGER"]

interface StrainRecord {
  id: string
  name: string
  productionType: PoultryProductionType
  species: PoultrySpecies
  isActive: boolean
  notes: string | null
}

interface Props {
  organizationId: string
  userRole: UserRole
  strains: StrainRecord[]
  schemaUnavailable?: boolean
}

export function StrainsPageClient({
  organizationId,
  userRole,
  strains,
  schemaUnavailable = false,
}: Props) {
  const canManage = CAN_MANAGE_ROLES.includes(userRole)
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState(strains)

  const groupedItems = useMemo(() => {
    const groups = new Map<PoultryProductionType, StrainRecord[]>()
    for (const item of items) {
      const current = groups.get(item.productionType) ?? []
      current.push(item)
      groups.set(item.productionType, current)
    }
    return groups
  }, [items])

  const toggleStrain = (strain: StrainRecord) => {
    if (!canManage) return

    startTransition(async () => {
      const nextActive = !strain.isActive
      const res = await updatePoultryStrain({
        organizationId,
        strainId: strain.id,
        isActive: nextActive,
      })

      if (!res.success) {
        toast.error(res.error)
        return
      }

      setItems((current) =>
        current.map((item) =>
          item.id === strain.id ? { ...item, isActive: nextActive } : item,
        ),
      )
      toast.success(
        nextActive
          ? `${strain.name} reactivee`
          : `${strain.name} desactivee`,
      )
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Souches avicoles</h1>
          <p className="mt-1 text-sm text-gray-500">
            Referentiel des souches utilisees pour les lots et les futures recommandations metier.
          </p>
        </div>
        <Link
          href="/settings"
          className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
        >
          Retour aux parametres
        </Link>
      </div>

      {schemaUnavailable && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          Le referentiel des souches n&apos;est pas encore disponible sur cette base de donnees.
          La page reste accessible, mais il faut appliquer la mise a jour Prisma pour voir et gerer les souches.
        </div>
      )}

      {!schemaUnavailable && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-sm text-gray-500">
          Aucune souche enregistree pour le moment.
        </div>
      )}

      {[...groupedItems.entries()].map(([productionType, group]) => (
        <section
          key={productionType}
          className="rounded-2xl border border-gray-200 bg-white p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {PRODUCTION_TYPE_LABELS[productionType]}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {group.length} souche{group.length > 1 ? "s" : ""} dans ce groupe.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {group.map((strain) => (
              <div
                key={strain.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {strain.name}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs text-gray-600">
                      {SPECIES_LABELS[strain.species]}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        strain.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {strain.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {strain.notes && (
                    <p className="mt-2 text-sm text-gray-500">{strain.notes}</p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!canManage || isPending}
                  onClick={() => toggleStrain(strain)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    !canManage
                      ? "cursor-not-allowed bg-gray-100 text-gray-400"
                      : strain.isActive
                        ? "bg-gray-900 text-white hover:bg-gray-800"
                        : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                >
                  {strain.isActive ? "Desactiver" : "Activer"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
