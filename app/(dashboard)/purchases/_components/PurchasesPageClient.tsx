"use client"

import { useMemo, useState, useTransition } from "react"
import {
  formatMoneyFCFA,
  formatMoneyFCFACompact,
  formatDate,
} from "@/src/lib/formatters"
import {
  createPurchase,
  deletePurchase,
  getPurchases,
  updatePurchase,
  type PurchaseSummary,
} from "@/src/actions/purchases"
import type {
  FeedStockSummary,
  MedicineStockSummary,
} from "@/src/actions/stock"
import { stripPurchaseStockImpactFromNotes } from "@/src/lib/purchase-stock-impact"

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
  feedStocks: FeedStockSummary[]
  medicineStocks: MedicineStockSummary[]
}

type StockTargetType = "ALIMENT" | "MEDICAMENT"

function emptyLine(): LineItem {
  return { description: "", quantity: "", unit: "KG", unitPriceFcfa: "" }
}

function linesFromPurchase(purchase: PurchaseSummary): LineItem[] {
  return purchase.items.map((item) => ({
    description: item.description,
    quantity: String(item.quantity),
    unit: item.unit,
    unitPriceFcfa: String(item.unitPriceFcfa),
  }))
}

function lineTotal(line: LineItem): number {
  const quantity = parseFloat(line.quantity) || 0
  const price = parseInt(line.unitPriceFcfa.replace(/\D/g, ""), 10) || 0
  return Math.round(quantity * price)
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
  const className =
    accent === "green"
      ? "text-green-700"
      : accent === "red"
        ? "text-red-600"
        : accent === "blue"
          ? "text-blue-600"
          : "text-gray-900"

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-1 text-xs text-gray-400">{label}</div>
      <div className={`text-lg font-bold tabular-nums leading-tight ${className}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-gray-400">{sub}</div> : null}
    </div>
  )
}

export function PurchasesPageClient({
  organizationId,
  userRole,
  purchases: initialPurchases,
  suppliers,
  feedStocks,
  medicineStocks,
}: Props) {
  const canMutate = ["SUPER_ADMIN", "OWNER", "MANAGER"].includes(userRole)

  const [purchases, setPurchases] = useState<PurchaseSummary[]>(initialPurchases)
  const [showForm, setShowForm] = useState(false)
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])
  const [impactStock, setImpactStock] = useState(false)
  const [targetStockType, setTargetStockType] = useState<StockTargetType>("ALIMENT")
  const [targetStockId, setTargetStockId] = useState("")
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [supplierId, setSupplierId] = useState("")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [isPending, startTransition] = useTransition()

  const totalPurchasesFcfa = purchases.reduce((sum, purchase) => sum + purchase.totalFcfa, 0)
  const paidPurchasesFcfa = purchases.reduce((sum, purchase) => sum + purchase.paidFcfa, 0)
  const balancePurchasesFcfa = purchases.reduce(
    (sum, purchase) => sum + purchase.balanceFcfa,
    0,
  )

  const formTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0)
  const selectedMedicineStock = medicineStocks.find((stock) => stock.id === targetStockId)

  const stockTargetOptions = useMemo(() => {
    if (targetStockType === "ALIMENT") {
      return feedStocks.map((stock) => ({
        id: stock.id,
        label: `${stock.name} - ${stock.feedType.name} (${stock.quantityKg} kg dispo)`,
      }))
    }

    return medicineStocks.map((stock) => ({
      id: stock.id,
      label: `${stock.name} (${stock.quantityOnHand} ${stock.unit} dispo)`,
    }))
  }, [feedStocks, medicineStocks, targetStockType])

  function resetFormState() {
    setEditingPurchaseId(null)
    setShowForm(false)
    setFormError(null)
    setLines([emptyLine()])
    setImpactStock(false)
    setTargetStockType("ALIMENT")
    setTargetStockId("")
    setPurchaseDate(new Date().toISOString().slice(0, 10))
    setSupplierId("")
    setReference("")
    setNotes("")
  }

  function openCreateForm() {
    resetFormState()
    setShowForm(true)
  }

  function openEditForm(purchase: PurchaseSummary) {
    setEditingPurchaseId(purchase.id)
    setShowForm(true)
    setFormError(null)
    setLines(linesFromPurchase(purchase))
    setImpactStock(purchase.stockImpact.enabled)
    setTargetStockType(purchase.stockImpact.targetType ?? "ALIMENT")
    setTargetStockId(purchase.stockImpact.targetStockId ?? "")
    setPurchaseDate(new Date(purchase.purchaseDate).toISOString().slice(0, 10))
    setSupplierId(purchase.supplier?.id ?? "")
    setReference(purchase.reference ?? "")
    setNotes(stripPurchaseStockImpactFromNotes(purchase.notes) ?? "")
  }

  function updateLine(index: number, field: keyof LineItem, value: string) {
    setLines((prev) =>
      prev.map((line, currentIndex) =>
        currentIndex === index ? { ...line, [field]: value } : line,
      ),
    )
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  async function refreshPurchases() {
    const refreshed = await getPurchases({ organizationId, limit: 50 })
    if (refreshed.success) {
      setPurchases(refreshed.data)
    }
  }

  function submitPurchase() {
    setFormError(null)

    const items = lines.map((line) => ({
      description: line.description,
      quantity: parseFloat(line.quantity) || 0,
      unit: line.unit,
      unitPriceFcfa: parseInt(line.unitPriceFcfa.replace(/\D/g, ""), 10) || 0,
    }))

    startTransition(async () => {
      const payload = {
        organizationId,
        supplierId: supplierId || undefined,
        purchaseDate: new Date(`${purchaseDate}T00:00:00Z`),
        reference,
        notes,
        items,
        stockImpact: {
          enabled: impactStock,
          targetType: impactStock ? targetStockType : null,
          targetStockId: impactStock ? targetStockId : undefined,
        },
      }

      const result = editingPurchaseId
        ? await updatePurchase({ ...payload, purchaseId: editingPurchaseId })
        : await createPurchase(payload)

      if (!result.success) {
        setFormError(result.error)
        return
      }

      await refreshPurchases()
      resetFormState()
    })
  }

  function handleDelete(purchase: PurchaseSummary) {
    if (!window.confirm(`Supprimer cet achat de ${formatMoneyFCFA(purchase.totalFcfa)} ?`)) {
      return
    }

    startTransition(async () => {
      const result = await deletePurchase({ organizationId, purchaseId: purchase.id })
      if (!result.success) {
        alert(result.error)
        return
      }

      setPurchases((prev) => prev.filter((item) => item.id !== purchase.id))
    })
  }

  const stockImpactHint = impactStock
    ? targetStockType === "ALIMENT"
      ? "Cet achat creera ou reconciliera proprement une entree de stock aliment. La ligne doit etre en kg et le formulaire doit contenir une seule ligne."
      : `Cet achat creera ou reconciliera proprement une entree de stock medicament. La ligne doit utiliser l'unite du stock cible${selectedMedicineStock ? ` (${selectedMedicineStock.unit})` : ""} et le formulaire doit contenir une seule ligne.`
    : "Cet achat reste comptable uniquement et n'entree pas en stock."

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Achats</h1>
          <p className="mt-0.5 text-sm text-gray-500">Commandes fournisseurs</p>
        </div>
        {canMutate ? (
          <button
            onClick={() => {
              if (showForm) {
                resetFormState()
              } else {
                openCreateForm()
              }
            }}
            className="shrink-0 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-green-700 active:scale-95"
          >
            {showForm ? "Annuler" : "+ Nouvel achat"}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label="Total achats"
          value={formatMoneyFCFACompact(totalPurchasesFcfa)}
          sub={`${purchases.length} commandes`}
        />
        <KpiCard
          label="Paye"
          value={formatMoneyFCFACompact(paidPurchasesFcfa)}
          accent="green"
        />
        <KpiCard
          label="Solde du"
          value={formatMoneyFCFACompact(balancePurchasesFcfa)}
          sub="fournisseurs"
          accent={balancePurchasesFcfa > 0 ? "red" : undefined}
        />
      </div>

      {showForm ? (
        <div className="space-y-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <h2 className="text-sm font-semibold text-green-800">
            {editingPurchaseId ? "Modifier l'achat" : "Nouvel achat"}
          </h2>

          {formError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {formError}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(event) => setPurchaseDate(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Fournisseur</label>
              <select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">— Sans fournisseur —</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">
              N° facture fournisseur
            </label>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="FAC-2025-001"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="rounded-lg border border-white/80 bg-white/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Impacte le stock</p>
                <p className="text-xs text-gray-500">
                  Active une entree de stock automatique source ACHAT.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={impactStock}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setImpactStock(checked)
                    if (!checked) {
                      setTargetStockId("")
                    }
                  }}
                />
                {impactStock ? "Oui" : "Non"}
              </label>
            </div>

            {impactStock ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Type de stock cible
                  </label>
                  <select
                    value={targetStockType}
                    onChange={(event) => {
                      setTargetStockType(event.target.value as StockTargetType)
                      setTargetStockId("")
                    }}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="ALIMENT">Stock aliment</option>
                    <option value="MEDICAMENT">Stock medicament</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Stock cible
                  </label>
                  <select
                    value={targetStockId}
                    onChange={(event) => setTargetStockId(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Selectionner un stock</option>
                    {stockTargetOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            <p
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                impactStock
                  ? "bg-amber-50 text-amber-800"
                  : "bg-gray-50 text-gray-600"
              }`}
            >
              {stockImpactHint}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500">
                Lignes ({lines.length})
              </p>
              {!impactStock ? (
                <button
                  type="button"
                  onClick={addLine}
                  className="text-xs font-medium text-green-700 hover:underline"
                >
                  + Ajouter une ligne
                </button>
              ) : null}
            </div>

            {impactStock && lines.length > 1 ? (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Le mode impact stock exige une seule ligne dachat pour cette
                premiere integration.
              </div>
            ) : null}

            {lines.map((line, index) => (
              <div
                key={index}
                className="space-y-2 rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Ligne {index + 1}</span>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Supprimer
                    </button>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={line.description}
                    onChange={(event) =>
                      updateLine(index, "description", event.target.value)
                    }
                    placeholder="Aliment croissance, poussins, vaccin Newcastle..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">
                      Quantite <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(index, "quantity", event.target.value)
                      }
                      placeholder="50"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Unite</label>
                    <select
                      value={line.unit}
                      onChange={(event) => updateLine(index, "unit", event.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="KG">kg</option>
                      <option value="SAC">sac</option>
                      <option value="PIECE">piece</option>
                      <option value="DOSE">dose</option>
                      <option value="LITRE">litre</option>
                      <option value="BOITE">boite</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-gray-500">
                      Prix/unit (FCFA) <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      type="number"
                      min="1"
                      value={line.unitPriceFcfa}
                      onChange={(event) =>
                        updateLine(index, "unitPriceFcfa", event.target.value)
                      }
                      placeholder="15000"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                {lineTotal(line) > 0 ? (
                  <p className="text-right text-xs text-gray-500 tabular-nums">
                    Sous-total : <strong>{formatMoneyFCFA(lineTotal(line))}</strong>
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Notes</label>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={
                impactStock
                  ? "Commentaires achat + reception de stock..."
                  : "Remarques optionnelles..."
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {formTotal > 0 ? (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2">
              <span className="text-sm text-gray-500">Total commande</span>
              <span className="font-bold text-gray-900 tabular-nums">
                {formatMoneyFCFA(formTotal)}
              </span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={submitPurchase}
            disabled={isPending}
            className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {isPending
              ? "Enregistrement..."
              : editingPurchaseId
                ? "Enregistrer les modifications"
                : "Enregistrer l'achat"}
          </button>
        </div>
      ) : null}

      {purchases.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
          Aucun achat enregistre.
        </div>
      ) : (
        <div className="space-y-2">
          {purchases.map((purchase) => (
            <div key={purchase.id} className="rounded-xl border border-gray-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {purchase.supplier?.name ?? "Sans fournisseur"}
                    </span>
                    {purchase.reference ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {purchase.reference}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        purchase.stockImpact.enabled
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {purchase.stockImpact.enabled
                        ? `Impact stock ${purchase.stockImpact.targetType === "ALIMENT" ? "aliment" : "medicament"}`
                        : "Sans impact stock"}
                    </span>
                  </div>

                  <div className="mt-0.5 text-xs text-gray-400">
                    {purchase.items.length} ligne{purchase.items.length > 1 ? "s" : ""}
                    {" · "}
                    {purchase.items.map((item) => item.description).join(", ")}
                  </div>

                  {stripPurchaseStockImpactFromNotes(purchase.notes) ? (
                    <p className="mt-2 text-sm text-gray-500">
                      {stripPurchaseStockImpactFromNotes(purchase.notes)}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-gray-900 tabular-nums">
                    {formatMoneyFCFACompact(purchase.totalFcfa)}
                  </div>
                  {purchase.balanceFcfa > 0 ? (
                    <div className="text-xs text-red-600">
                      Du : {formatMoneyFCFA(purchase.balanceFcfa)}
                    </div>
                  ) : (
                    <div className="text-xs text-green-600">Paye</div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2">
                <span className="text-xs text-gray-300">
                  {formatDate(purchase.purchaseDate)}
                </span>
                {canMutate ? (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openEditForm(purchase)}
                      disabled={isPending || purchase.paidFcfa > 0}
                      title={
                        purchase.paidFcfa > 0
                          ? "Impossible de modifier un achat avec des paiements"
                          : "Modifier"
                      }
                      className="text-xs text-gray-300 transition-colors hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(purchase)}
                      disabled={isPending || purchase.paidFcfa > 0}
                      title={
                        purchase.paidFcfa > 0
                          ? "Impossible de supprimer un achat avec des paiements"
                          : "Supprimer"
                      }
                      className="text-xs text-gray-300 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Supprimer
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
