"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  createSale,
  deleteSale,
  updateSale,
  type SaleDetail,
} from "@/src/actions/sales"
import type { FeedStockSummary } from "@/src/actions/stock"
import { formatMoneyFCFA } from "@/src/lib/formatters"
import { stripSaleStockImpactFromNotes } from "@/src/lib/sale-stock-impact"

type Props = {
  organizationId: string
  feedStocks: FeedStockSummary[]
  initialSale?: SaleDetail
}

type Item = {
  description: string
  quantity: string
  unit: "KG" | "PIECE" | "PLATEAU" | "CAISSE"
  unitPriceFcfa: string
}

type ProductType = "POULET_VIF" | "OEUF" | "FIENTE"

function emptyItem(): Item {
  return {
    description: "",
    quantity: "1",
    unit: "PIECE",
    unitPriceFcfa: "",
  }
}

function itemFromSale(item: SaleDetail["items"][number]): Item {
  return {
    description: item.description,
    quantity: String(item.quantity),
    unit: item.unit as Item["unit"],
    unitPriceFcfa: String(item.unitPriceFcfa),
  }
}

export function CreateSaleForm({
  organizationId,
  feedStocks,
  initialSale,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const currentSaleId = initialSale?.id ?? null

  const [productType, setProductType] = useState<ProductType>(
    (initialSale?.productType as ProductType | undefined) ?? "POULET_VIF",
  )
  const [saleDate, setSaleDate] = useState(
    initialSale
      ? new Date(initialSale.saleDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  )
  const [notes, setNotes] = useState(
    initialSale ? stripSaleStockImpactFromNotes(initialSale.notes) ?? "" : "",
  )
  const [impactStock, setImpactStock] = useState(
    initialSale?.stockImpact.enabled ?? false,
  )
  const [feedStockId, setFeedStockId] = useState(
    initialSale?.stockImpact.feedStockId ?? "",
  )
  const [items, setItems] = useState<Item[]>(
    initialSale?.items.length
      ? initialSale.items.map(itemFromSale)
      : [emptyItem()],
  )
  const [formError, setFormError] = useState<string | null>(null)

  const isEditing = Boolean(initialSale)
  const canMutate = !initialSale || initialSale.paidFcfa === 0
  const selectedFeedStock = feedStocks.find((stock) => stock.id === feedStockId)

  const totalFcfa = useMemo(
    () =>
      items.reduce((sum, item) => {
        const quantity = parseFloat(item.quantity) || 0
        const unitPrice = parseInt(item.unitPriceFcfa, 10) || 0
        return sum + Math.round(quantity * unitPrice)
      }, 0),
    [items],
  )

  function updateItem(index: number, field: keyof Item, value: string) {
    setItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    )
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  function buildPayload() {
    return {
      organizationId,
      saleDate,
      productType,
      notes,
      items: items.map((item) => ({
        description: item.description,
        quantity: parseFloat(item.quantity) || 0,
        unit: item.unit,
        unitPriceFcfa: parseInt(item.unitPriceFcfa, 10) || 0,
      })),
      stockImpact: {
        enabled: impactStock,
        feedStockId: impactStock ? feedStockId : undefined,
      },
    }
  }

  function submit() {
    setFormError(null)

    startTransition(async () => {
      const result = isEditing
        ? await updateSale({
            ...buildPayload(),
            saleId: currentSaleId as string,
          })
        : await createSale(buildPayload())

      if (!result.success) {
        setFormError(result.error)
        return
      }

      router.push(isEditing ? `/sales/${result.data.id}` : "/sales")
      router.refresh()
    })
  }

  function handleDelete() {
    if (!currentSaleId) return
    if (!window.confirm("Supprimer cette vente ?")) return

    startTransition(async () => {
      const result = await deleteSale({
        organizationId,
        saleId: currentSaleId,
      })

      if (!result.success) {
        setFormError(result.error)
        return
      }

      router.push("/sales")
      router.refresh()
    })
  }

  const stockHint =
    productType !== "FIENTE"
      ? "Le stock n'est pas branche pour ce type de vente dans cette phase."
      : impactStock
        ? `Cette vente creera une sortie de stock source VENTE sur un FeedStock, de maniere transitoire pour la fiente${selectedFeedStock ? ` (${selectedFeedStock.name})` : ""}.`
        : "Cette vente de fiente restera comptable uniquement, sans impact stock."

  return (
    <div className="space-y-5">
      {formError ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </p>
      ) : null}

      {!canMutate ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Cette vente ne peut plus etre modifiee ni supprimee car un encaissement a
          deja ete enregistre.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm text-gray-600">Type de produit</label>
          <select
            value={productType}
            disabled={isPending || !canMutate}
            onChange={(event) => {
              const value = event.target.value as ProductType
              setProductType(value)
              if (value !== "FIENTE") {
                setImpactStock(false)
                setFeedStockId("")
              } else if (impactStock) {
                setItems((prev) =>
                  prev.map((item, index) =>
                    index === 0 ? { ...item, unit: "KG" } : item,
                  ),
                )
              }
            }}
            className="mt-1 w-full rounded-xl border px-3 py-2"
          >
            <option value="POULET_VIF">Poulet vif</option>
            <option value="OEUF">Oeuf</option>
            <option value="FIENTE">Fiente</option>
          </select>
        </div>

        <div>
          <label className="text-sm text-gray-600">Date</label>
          <input
            type="date"
            required
            disabled={isPending || !canMutate}
            value={saleDate}
            onChange={(event) => setSaleDate(event.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Impact stock</h2>
            <p className="text-sm text-gray-500">
              Active une sortie de stock uniquement pour les ventes de fiente.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={impactStock}
              disabled={isPending || !canMutate || productType !== "FIENTE"}
              onChange={(event) => {
                const checked = event.target.checked
                setImpactStock(checked)
                if (!checked) {
                  setFeedStockId("")
                } else {
                  setItems((prev) =>
                    prev.map((item, index) =>
                      index === 0 ? { ...item, unit: "KG" } : item,
                    ),
                  )
                }
              }}
            />
            {impactStock ? "Oui" : "Non"}
          </label>
        </div>

        {productType === "FIENTE" && impactStock ? (
          <div className="mt-4">
            <label className="text-sm text-gray-600">Stock cible</label>
            <select
              value={feedStockId}
              disabled={isPending || !canMutate}
              onChange={(event) => setFeedStockId(event.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
            >
              <option value="">Selectionner un stock aliment</option>
              {feedStocks.map((stock) => (
                <option key={stock.id} value={stock.id}>
                  {stock.name} - {stock.feedType.name} ({stock.quantityKg} kg dispo)
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-gray-600">
          {stockHint}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">Lignes de vente</h2>
          {!impactStock ? (
            <button
              type="button"
              disabled={isPending || !canMutate}
              onClick={addItem}
              className="text-sm text-green-600"
            >
              + Ajouter une ligne
            </button>
          ) : null}
        </div>

        {impactStock && items.length > 1 ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Le mode impact stock exige une seule ligne pour cette premiere phase.
          </p>
        ) : null}

        {items.map((item, index) => (
          <div
            key={`${index}-${item.description}`}
            className="grid gap-3 rounded-xl border p-3 md:grid-cols-5"
          >
            <input
              placeholder="Description"
              value={item.description}
              disabled={isPending || !canMutate}
              onChange={(event) => updateItem(index, "description", event.target.value)}
              className="rounded border px-2 py-1"
              required
            />

            <input
              type="number"
              min="0.01"
              step="0.01"
              value={item.quantity}
              disabled={isPending || !canMutate}
              onChange={(event) => updateItem(index, "quantity", event.target.value)}
              className="rounded border px-2 py-1"
            />

            <select
              value={item.unit}
              disabled={isPending || !canMutate || (impactStock && productType === "FIENTE")}
              onChange={(event) =>
                updateItem(index, "unit", event.target.value as Item["unit"])
              }
              className="rounded border px-2 py-1"
            >
              <option value="KG">KG</option>
              <option value="PIECE">PIECE</option>
              <option value="PLATEAU">PLATEAU</option>
              <option value="CAISSE">CAISSE</option>
            </select>

            <input
              type="number"
              min="1"
              value={item.unitPriceFcfa}
              disabled={isPending || !canMutate}
              onChange={(event) =>
                updateItem(index, "unitPriceFcfa", event.target.value)
              }
              className="rounded border px-2 py-1"
              placeholder="Prix"
            />

            <button
              type="button"
              disabled={isPending || !canMutate || items.length === 1}
              onClick={() => removeItem(index)}
              className="text-sm text-red-600 disabled:opacity-30"
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>

      <div>
        <label className="text-sm text-gray-600">Notes</label>
        <textarea
          value={notes}
          disabled={isPending || !canMutate}
          onChange={(event) => setNotes(event.target.value)}
          className="mt-1 w-full rounded-xl border px-3 py-2"
        />
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <p className="text-sm text-gray-500">Total de la vente</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">
          {formatMoneyFCFA(totalFcfa)}
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <button
          type="button"
          disabled={isPending || !canMutate}
          onClick={submit}
          className="w-full rounded-xl bg-green-600 py-3 font-medium text-white disabled:opacity-50"
        >
          {isPending
            ? "Enregistrement..."
            : isEditing
              ? "Enregistrer les modifications"
              : "Creer la vente"}
        </button>

        {isEditing ? (
          <button
            type="button"
            disabled={isPending || !canMutate}
            onClick={handleDelete}
            className="w-full rounded-xl border border-red-200 py-3 font-medium text-red-600 disabled:opacity-50"
          >
            Supprimer la vente
          </button>
        ) : null}
      </div>
    </div>
  )
}
