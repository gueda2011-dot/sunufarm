"use client"

import { useMemo, useState, useTransition } from "react"
import { CircleAlert, PackagePlus, Plus, Trash2 } from "lucide-react"
import {
  formatDate,
  formatMoneyFCFA,
  formatMoneyFCFACompact,
} from "@/src/lib/formatters"
import { createPurchase, deletePurchase } from "@/src/actions/purchases"
import type { PurchaseSummary } from "@/src/actions/purchases"

interface Supplier {
  id: string
  name: string
  type: string | null
}

interface LineItem {
  description: string
  quantity: string
  unit: string
  unitPriceFcfa: string
}

interface Props {
  organizationId: string
  userRole: string
  purchases: PurchaseSummary[]
  suppliers: Supplier[]
  totalFcfa: number
  paidFcfa: number
  balanceFcfa: number
}

const UNIT_OPTIONS = ["KG", "SAC", "PIECE", "DOSE", "LITRE", "BOITE"] as const

function emptyLine(): LineItem {
  return {
    description: "",
    quantity: "",
    unit: "SAC",
    unitPriceFcfa: "",
  }
}

function lineTotal(line: LineItem): number {
  const quantity = parseFloat(line.quantity) || 0
  const unitPriceFcfa = parseInt(line.unitPriceFcfa.replace(/\D/g, ""), 10) || 0
  return Math.round(quantity * unitPriceFcfa)
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
  const accentClass =
    accent === "green" ? "text-green-700" :
    accent === "red" ? "text-red-600" :
    accent === "blue" ? "text-blue-600" :
    "text-gray-900"

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${accentClass}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-400">{sub}</p> : null}
    </div>
  )
}

export function PurchasesPageClient({
  organizationId,
  userRole,
  purchases: initialPurchases,
  suppliers,
  totalFcfa,
  paidFcfa,
  balanceFcfa,
}: Props) {
  const canMutate = ["SUPER_ADMIN", "OWNER", "MANAGER"].includes(userRole)
  const [purchases, setPurchases] = useState<PurchaseSummary[]>(initialPurchases)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [supplierId, setSupplierId] = useState("")
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])

  const formTotal = useMemo(
    () => lines.reduce((sum, line) => sum + lineTotal(line), 0),
    [lines],
  )

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? null

  function resetForm() {
    setFormError(null)
    setSupplierId("")
    setPurchaseDate(new Date().toISOString().slice(0, 10))
    setReference("")
    setNotes("")
    setLines([emptyLine()])
  }

  function updateLine(index: number, field: keyof LineItem, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    )
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()])
  }

  function removeLine(index: number) {
    setLines((current) => (
      current.length > 1 ? current.filter((_, lineIndex) => lineIndex !== index) : current
    ))
  }

  function handleToggleForm() {
    if (showForm) {
      resetForm()
      setShowForm(false)
      return
    }

    setFormError(null)
    setShowForm(true)
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const items = lines.map((line) => ({
      description: line.description.trim(),
      quantity: parseFloat(line.quantity) || 0,
      unit: line.unit,
      unitPriceFcfa: parseInt(line.unitPriceFcfa.replace(/\D/g, ""), 10) || 0,
    }))

    const hasInvalidLine = items.some((item) =>
      !item.description || item.quantity <= 0 || item.unitPriceFcfa <= 0,
    )

    if (hasInvalidLine) {
      setFormError("Chaque ligne doit avoir une description, une quantite et un prix valides.")
      return
    }

    startTransition(async () => {
      const result = await createPurchase({
        organizationId,
        supplierId: supplierId || undefined,
        purchaseDate: new Date(purchaseDate),
        reference,
        notes,
        items,
      })

      if (!result.success) {
        setFormError(result.error)
        return
      }

      const newPurchase: PurchaseSummary = {
        id: result.data.id,
        purchaseDate: new Date(purchaseDate),
        reference: reference || null,
        totalFcfa: formTotal,
        paidFcfa: 0,
        balanceFcfa: formTotal,
        notes: notes || null,
        createdAt: new Date(),
        supplier: selectedSupplier
          ? { id: selectedSupplier.id, name: selectedSupplier.name, type: selectedSupplier.type }
          : null,
        items: items.map((item) => ({
          ...item,
          totalFcfa: Math.round(item.quantity * item.unitPriceFcfa),
        })),
      }

      setPurchases((current) => [newPurchase, ...current])
      resetForm()
      setShowForm(false)
    })
  }

  function handleDelete(purchase: PurchaseSummary) {
    if (!window.confirm(`Supprimer cet achat de ${formatMoneyFCFA(purchase.totalFcfa)} ?`)) {
      return
    }

    startTransition(async () => {
      const result = await deletePurchase({
        organizationId,
        purchaseId: purchase.id,
      })

      if (!result.success) {
        alert(result.error)
        return
      }

      setPurchases((current) => current.filter((item) => item.id !== purchase.id))
    })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Achats fournisseur</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Gere ici les commandes fournisseur, les montants payes et les restes a regler.
          </p>
        </div>

        {canMutate ? (
          <button
            onClick={handleToggleForm}
            className="inline-flex w-fit items-center gap-2 rounded-2xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
          >
            <PackagePlus className="h-4 w-4" />
            {showForm ? "Fermer le formulaire" : "Nouvel achat"}
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          label="Total achats"
          value={formatMoneyFCFACompact(totalFcfa)}
          sub={`${purchases.length} commandes`}
          accent="blue"
        />
        <KpiCard
          label="Montant paye"
          value={formatMoneyFCFACompact(paidFcfa)}
          accent="green"
        />
        <KpiCard
          label="Solde fournisseur"
          value={formatMoneyFCFACompact(balanceFcfa)}
          sub="A regler"
          accent={balanceFcfa > 0 ? "red" : undefined}
        />
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Utilisez ce module pour les achats structures avec fournisseur et lignes d&apos;achat.
        Pour les autres sorties d&apos;argent sans bon d&apos;achat, utilisez <strong>Depenses</strong>.
      </div>

      {showForm ? (
        <form onSubmit={handleCreate} className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <section className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900">Informations achat</h2>
              <p className="mt-1 text-sm text-gray-500">
                Renseigne la commande, le fournisseur et la reference de facture.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-gray-700">Date d&apos;achat</label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(event) => setPurchaseDate(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Fournisseur</label>
                  <select
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  >
                    <option value="">Sans fournisseur precise</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">Reference / facture</label>
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="Ex: FAC-ALIM-2026-014"
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Lignes d&apos;achat</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Detaille ce qui a ete achete pour garder une base exploitable ensuite.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-green-700"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter une ligne
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {lines.map((line, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900">Ligne {index + 1}</p>
                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        disabled={lines.length === 1}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 transition hover:text-red-700 disabled:cursor-not-allowed disabled:text-gray-300"
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-[1.8fr_0.8fr_0.8fr_1fr]">
                      <div>
                        <label className="text-sm font-medium text-gray-700">Description</label>
                        <input
                          required
                          value={line.description}
                          onChange={(event) => updateLine(index, "description", event.target.value)}
                          placeholder="Ex: Aliment demarrage, vaccin, carton d'emballage..."
                          className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700">Quantite</label>
                        <input
                          required
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.quantity}
                          onChange={(event) => updateLine(index, "quantity", event.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700">Unite</label>
                        <select
                          value={line.unit}
                          onChange={(event) => updateLine(index, "unit", event.target.value)}
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
                        <label className="text-sm font-medium text-gray-700">Prix unitaire</label>
                        <input
                          required
                          type="number"
                          min="1"
                          value={line.unitPriceFcfa}
                          onChange={(event) => updateLine(index, "unitPriceFcfa", event.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                        />
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-dashed border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                      Sous-total ligne : <span className="font-semibold">{formatMoneyFCFA(lineTotal(line))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <label className="text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                placeholder="Informations utiles sur la livraison, la qualite ou la destination interne."
                className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-green-500"
              />
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Resume de l&apos;achat</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {formatMoneyFCFA(formTotal)}
              </p>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between text-gray-600">
                  <span>Lignes</span>
                  <span className="font-medium text-gray-900">{lines.length}</span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span>Fournisseur</span>
                  <span className="max-w-[11rem] truncate font-medium text-gray-900">
                    {selectedSupplier?.name ?? "Non precise"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span>Date</span>
                  <span className="font-medium text-gray-900">{purchaseDate || "-"}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Cet ecran structure l&apos;achat proprement. Si tu veux un impact stock automatique,
                  il faudra ensuite relier explicitement ces lignes au module stock.
                </p>
              </div>
            </div>

            {formError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {formError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-2xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
            >
              {isPending ? "Enregistrement..." : "Enregistrer l'achat"}
            </button>
          </aside>
        </form>
      ) : null}

      {purchases.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400">
          Aucun achat enregistre pour le moment.
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Historique des achats</h2>
            <p className="mt-1 text-sm text-gray-500">
              Vue d&apos;ensemble des commandes fournisseurs recentes.
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {purchases.map((purchase) => (
              <div
                key={purchase.id}
                className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-start md:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900">
                      {purchase.supplier?.name ?? "Sans fournisseur"}
                    </h3>
                    {purchase.reference ? (
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                        {purchase.reference}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 text-sm text-gray-500">
                    {formatDate(purchase.purchaseDate)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {purchase.items.map((item, index) => (
                      <span
                        key={`${purchase.id}-${index}`}
                        className="rounded-full bg-gray-50 px-3 py-1 text-xs text-gray-600"
                      >
                        {item.description}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatMoneyFCFACompact(purchase.totalFcfa)}
                    </p>
                    <p className={`text-xs ${purchase.balanceFcfa > 0 ? "text-red-600" : "text-green-600"}`}>
                      {purchase.balanceFcfa > 0
                        ? `Reste: ${formatMoneyFCFA(purchase.balanceFcfa)}`
                        : "Entierement regle"}
                    </p>
                  </div>

                  {canMutate ? (
                    <button
                      onClick={() => handleDelete(purchase)}
                      disabled={isPending || purchase.paidFcfa > 0}
                      title={purchase.paidFcfa > 0 ? "Impossible de supprimer un achat avec des paiements" : "Supprimer"}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Supprimer
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
