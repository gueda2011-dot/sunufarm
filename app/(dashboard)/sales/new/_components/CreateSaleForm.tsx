"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { createSale } from "@/src/actions/sales"

type Props = {
  organizationId: string
}

type Item = {
  description: string
  quantity: number
  unit: "KG" | "PIECE" | "PLATEAU" | "CAISSE"
  unitPriceFcfa: number
}

export function CreateSaleForm({ organizationId }: Props) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)

  const [productType, setProductType] = useState<"POULET_VIF" | "OEUF" | "FIENTE">("POULET_VIF")
  const [saleDate, setSaleDate] = useState("")
  const [notes, setNotes] = useState("")

  const [items, setItems] = useState<Item[]>([
    {
      description: "",
      quantity: 1,
      unit: "PIECE",
      unitPriceFcfa: 0,
    },
  ])

  const addItem = () => {
    setItems([
      ...items,
      { description: "", quantity: 1, unit: "PIECE", unitPriceFcfa: 0 },
    ])
  }

  const updateItem = (index: number, field: keyof Item, value: Item[keyof Item]) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const result = await createSale({
      organizationId,
      productType,
      saleDate,
      notes,
      items,
    })

    setLoading(false)

    if (!result.success) {
      alert(result.error)
      return
    }

    router.push("/sales")
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Type + date */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm text-gray-600">Type de produit</label>
          <select
            value={productType}
            onChange={(e) => setProductType(e.target.value as any)}
            className="mt-1 w-full rounded-xl border px-3 py-2"
          >
            <option value="POULET_VIF">Poulet vif</option>
            <option value="OEUF">Œuf</option>
            <option value="FIENTE">Fiente</option>
          </select>
        </div>

        <div>
          <label className="text-sm text-gray-600">Date</label>
          <input
            type="date"
            required
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2"
          />
        </div>
      </div>

      {/* Lignes */}
      <div className="space-y-4">
        <h2 className="font-semibold text-gray-900">Lignes de vente</h2>

        {items.map((item, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-xl border p-3 md:grid-cols-5"
          >
            <input
              placeholder="Description"
              value={item.description}
              onChange={(e) => updateItem(index, "description", e.target.value)}
              className="rounded border px-2 py-1"
              required
            />

            <input
              type="number"
              value={item.quantity}
              onChange={(e) =>
                updateItem(index, "quantity", Number(e.target.value))
              }
              className="rounded border px-2 py-1"
            />

            <select
              value={item.unit}
              onChange={(e) => updateItem(index, "unit", e.target.value)}
              className="rounded border px-2 py-1"
            >
              <option value="KG">KG</option>
              <option value="PIECE">PIECE</option>
              <option value="PLATEAU">PLATEAU</option>
              <option value="CAISSE">CAISSE</option>
            </select>

            <input
              type="number"
              placeholder="Prix"
              value={item.unitPriceFcfa}
              onChange={(e) =>
                updateItem(index, "unitPriceFcfa", Number(e.target.value))
              }
              className="rounded border px-2 py-1"
            />

            <button
              type="button"
              onClick={() => removeItem(index)}
              className="text-red-600 text-sm"
            >
              Supprimer
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addItem}
          className="text-sm text-green-600"
        >
          + Ajouter une ligne
        </button>
      </div>

      {/* Notes */}
      <div>
        <label className="text-sm text-gray-600">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-xl border px-3 py-2"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-green-600 text-white py-3 font-medium"
      >
        {loading ? "Enregistrement..." : "Créer la vente"}
      </button>
    </form>
  )
}