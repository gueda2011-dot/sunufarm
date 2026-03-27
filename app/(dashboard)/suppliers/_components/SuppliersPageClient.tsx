"use client"

import { useState, useTransition } from "react"
import {
  formatDate,
  formatMoneyFCFA,
  formatMoneyFCFACompact,
} from "@/src/lib/formatters"
import { createSupplier, deleteSupplier, type SupplierSummary } from "@/src/actions/suppliers"

const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  POUSSIN: "Poussin",
  ALIMENT: "Aliment",
  MEDICAMENT: "Medicament",
  AUTRE: "Autre",
}

const SUPPLIER_TYPE_COLORS: Record<string, string> = {
  POUSSIN: "bg-amber-100 text-amber-700",
  ALIMENT: "bg-green-100 text-green-700",
  MEDICAMENT: "bg-blue-100 text-blue-700",
  AUTRE: "bg-gray-100 text-gray-600",
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: "green" | "red" | "blue"
}) {
  const cls =
    accent === "green" ? "text-green-700" :
    accent === "red" ? "text-red-600" :
    accent === "blue" ? "text-blue-600" :
    "text-gray-900"

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-1 text-xs text-gray-400">{label}</div>
      <div className={`text-lg font-bold leading-tight tabular-nums ${cls}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-gray-400">{sub}</div> : null}
    </div>
  )
}

interface Props {
  organizationId: string
  userRole: string
  suppliers: SupplierSummary[]
  totalSuppliers: number
  totalPurchasedFcfa: number
  totalBalanceFcfa: number
}

export function SuppliersPageClient({
  organizationId,
  userRole,
  suppliers: initialSuppliers,
  totalSuppliers,
  totalPurchasedFcfa,
  totalBalanceFcfa,
}: Props) {
  const canMutate = ["SUPER_ADMIN", "OWNER", "MANAGER", "ACCOUNTANT"].includes(userRole)

  const [suppliers, setSuppliers] = useState<SupplierSummary[]>(initialSuppliers)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = suppliers.filter((supplier) => {
    const matchSearch =
      !search ||
      supplier.name.toLowerCase().includes(search.toLowerCase()) ||
      (supplier.phone ?? "").includes(search) ||
      (supplier.email ?? "").toLowerCase().includes(search.toLowerCase())

    const matchType = !typeFilter || supplier.type === typeFilter

    return matchSearch && matchType
  })

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await createSupplier({
        organizationId,
        name: formData.get("name") as string,
        phone: formData.get("phone") as string,
        email: formData.get("email") as string,
        address: formData.get("address") as string,
        type: (formData.get("type") as string) || undefined,
        notes: formData.get("notes") as string,
      })

      if (!result.success) {
        setFormError(result.error)
        return
      }

      const newSupplier: SupplierSummary = {
        id: result.data.id,
        name: result.data.name,
        phone: (formData.get("phone") as string) || null,
        email: (formData.get("email") as string) || null,
        address: (formData.get("address") as string) || null,
        type: (formData.get("type") as string) || null,
        notes: (formData.get("notes") as string) || null,
        createdAt: new Date(),
        purchasesCount: 0,
        batchesCount: 0,
        totalPurchasedFcfa: 0,
        paidFcfa: 0,
        balanceFcfa: 0,
      }

      setSuppliers((previous) => [...previous, newSupplier].sort((a, b) => a.name.localeCompare(b.name)))
      setShowForm(false)
      ;(event.target as HTMLFormElement).reset()
    })
  }

  function handleDelete(supplier: SupplierSummary) {
    if (supplier.purchasesCount > 0 || supplier.batchesCount > 0) return
    if (!window.confirm(`Supprimer le fournisseur "${supplier.name}" ?`)) return

    startTransition(async () => {
      const result = await deleteSupplier({
        organizationId,
        supplierId: supplier.id,
      })

      if (!result.success) {
        alert(result.error)
        return
      }

      setSuppliers((previous) => previous.filter((item) => item.id !== supplier.id))
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fournisseurs</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Carnet fournisseurs pour les achats, poussins, aliments et medicaments.
          </p>
        </div>
        {canMutate ? (
          <button
            onClick={() => setShowForm((value) => !value)}
            className="shrink-0 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-green-700 active:scale-95"
          >
            {showForm ? "Annuler" : "+ Nouveau fournisseur"}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Fournisseurs" value={String(totalSuppliers)} sub="enregistres" accent="blue" />
        <KpiCard label="Achats cumules" value={formatMoneyFCFACompact(totalPurchasedFcfa)} sub="toutes commandes" accent="green" />
        <KpiCard label="Solde restant" value={formatMoneyFCFACompact(totalBalanceFcfa)} sub="reste a payer" accent={totalBalanceFcfa > 0 ? "red" : undefined} />
      </div>

      {showForm ? (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4"
        >
          <h2 className="text-sm font-semibold text-green-800">Nouveau fournisseur</h2>

          {formError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                name="name"
                required
                placeholder="Avicoop Dakar"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Type</label>
              <select
                name="type"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">- Choisir -</option>
                <option value="POUSSIN">Poussin</option>
                <option value="ALIMENT">Aliment</option>
                <option value="MEDICAMENT">Medicament</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Telephone</label>
              <input
                name="phone"
                type="tel"
                placeholder="77 000 00 00"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Email</label>
              <input
                name="email"
                type="email"
                placeholder="contact@fournisseur.com"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Adresse</label>
            <input
              name="address"
              placeholder="Quartier, ville..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Notes</label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Specialite, delais, remarques..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {isPending ? "Enregistrement..." : "Enregistrer le fournisseur"}
          </button>
        </form>
      ) : null}

      <div className="flex gap-2">
        <input
          type="search"
          placeholder="Rechercher un fournisseur..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Tous les types</option>
          <option value="POUSSIN">Poussin</option>
          <option value="ALIMENT">Aliment</option>
          <option value="MEDICAMENT">Medicament</option>
          <option value="AUTRE">Autre</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-8 text-center">
          <p className="text-sm text-gray-400">
            {suppliers.length === 0
              ? "Aucun fournisseur enregistre. Ajoutez votre premier fournisseur."
              : "Aucun resultat pour cette recherche."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((supplier) => (
            <div key={supplier.id} className="rounded-xl border border-gray-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{supplier.name}</span>
                    {supplier.type ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SUPPLIER_TYPE_COLORS[supplier.type] ?? "bg-gray-100 text-gray-600"}`}>
                        {SUPPLIER_TYPE_LABELS[supplier.type] ?? supplier.type}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 space-x-3 text-xs text-gray-400">
                    {supplier.phone ? <span>{supplier.phone}</span> : null}
                    {supplier.email ? <span>{supplier.email}</span> : null}
                    {supplier.address ? <span>{supplier.address}</span> : null}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {supplier.purchasesCount} achat(s) · {supplier.batchesCount} lot(s) d&apos;approvisionnement
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold tabular-nums text-gray-900">
                    {formatMoneyFCFACompact(supplier.totalPurchasedFcfa)}
                  </div>
                  <div className="text-xs text-gray-400">Achats cumules</div>
                  {supplier.balanceFcfa > 0 ? (
                    <div className="text-xs font-medium text-red-600">
                      Reste {formatMoneyFCFA(supplier.balanceFcfa)}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2">
                <span className="text-xs text-gray-300">
                  Depuis {formatDate(supplier.createdAt)}
                </span>
                {canMutate ? (
                  <button
                    onClick={() => handleDelete(supplier)}
                    disabled={supplier.purchasesCount > 0 || supplier.batchesCount > 0 || isPending}
                    title={
                      supplier.purchasesCount > 0 || supplier.batchesCount > 0
                        ? "Impossible de supprimer un fournisseur lie a des achats ou des lots"
                        : "Supprimer ce fournisseur"
                    }
                    className="text-xs text-gray-300 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Supprimer
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
