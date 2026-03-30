"use client"

import { useMemo, useState, useTransition } from "react"
import { CircleAlert, PackagePlus, Plus, Trash2 } from "lucide-react"
import {
  createPurchase,
  deletePurchase,
  linkPurchaseItemToStock,
  recordPurchasePayment,
  type PurchaseSummary,
} from "@/src/actions/purchases"
import type {
  FeedStockSummary,
  MedicineStockSummary,
} from "@/src/actions/stock"
import {
  formatDate,
  formatMoneyFCFA,
  formatMoneyFCFACompact,
} from "@/src/lib/formatters"

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

interface StockLinkDraft {
  stockType: "" | "FEED" | "MEDICINE"
  stockId: string
  quantity: string
  notes: string
}

interface Props {
  organizationId: string
  userRole: string
  canManageStock: boolean
  purchases: PurchaseSummary[]
  suppliers: Supplier[]
  feedStocks: FeedStockSummary[]
  medicineStocks: MedicineStockSummary[]
}

const UNIT_OPTIONS = ["KG", "SAC", "PIECE", "DOSE", "LITRE", "BOITE"] as const
const PAYMENT_METHODS = [
  { value: "ESPECES", label: "Especes" },
  { value: "VIREMENT", label: "Virement" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "MOBILE_MONEY", label: "Mobile money" },
  { value: "AUTRE", label: "Autre" },
] as const

function emptyLine(): LineItem {
  return {
    description: "",
    quantity: "",
    unit: "SAC",
    unitPriceFcfa: "",
  }
}

function lineTotal(line: LineItem): number {
  const quantity = Number.parseFloat(line.quantity) || 0
  const unitPriceFcfa = Number.parseInt(line.unitPriceFcfa.replace(/\D/g, ""), 10) || 0
  return Math.round(quantity * unitPriceFcfa)
}

function emptyStockLinkDraft(quantity: number): StockLinkDraft {
  return {
    stockType: "",
    stockId: "",
    quantity: String(quantity),
    notes: "",
  }
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
  canManageStock,
  purchases: initialPurchases,
  suppliers,
  feedStocks,
  medicineStocks,
}: Props) {
  const canMutate = ["SUPER_ADMIN", "OWNER", "MANAGER"].includes(userRole)
  const canRecordPayment = ["SUPER_ADMIN", "OWNER", "MANAGER", "ACCOUNTANT"].includes(userRole)

  const [purchases, setPurchases] = useState<PurchaseSummary[]>(initialPurchases)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [supplierId, setSupplierId] = useState("")
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])

  const [paymentPurchaseId, setPaymentPurchaseId] = useState<string | null>(null)
  const [paymentAmountFcfa, setPaymentAmountFcfa] = useState("")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]["value"]>("ESPECES")
  const [paymentReference, setPaymentReference] = useState("")
  const [paymentNotes, setPaymentNotes] = useState("")
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const [stockPurchaseId, setStockPurchaseId] = useState<string | null>(null)
  const [stockDrafts, setStockDrafts] = useState<Record<string, StockLinkDraft>>({})
  const [stockError, setStockError] = useState<string | null>(null)

  const formTotal = useMemo(
    () => lines.reduce((sum, line) => sum + lineTotal(line), 0),
    [lines],
  )

  const totals = useMemo(() => {
    return purchases.reduce(
      (acc, purchase) => {
        acc.totalFcfa += purchase.totalFcfa
        acc.paidFcfa += purchase.paidFcfa
        acc.balanceFcfa += purchase.balanceFcfa
        return acc
      },
      { totalFcfa: 0, paidFcfa: 0, balanceFcfa: 0 },
    )
  }, [purchases])

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? null

  function resetForm() {
    setFormError(null)
    setSupplierId("")
    setPurchaseDate(new Date().toISOString().slice(0, 10))
    setReference("")
    setNotes("")
    setLines([emptyLine()])
  }

  function updatePurchase(updatedPurchase: PurchaseSummary) {
    setPurchases((current) =>
      current.map((purchase) =>
        purchase.id === updatedPurchase.id ? updatedPurchase : purchase,
      ),
    )
  }

  function updatePurchaseItemLinked(purchaseId: string, purchaseItemId: string) {
    setPurchases((current) =>
      current.map((purchase) =>
        purchase.id !== purchaseId
          ? purchase
          : {
              ...purchase,
              items: purchase.items.map((item) =>
                item.id === purchaseItemId ? { ...item, stockLinked: true } : item,
              ),
            },
      ),
    )
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
    setLines((current) =>
      current.length > 1 ? current.filter((_, lineIndex) => lineIndex !== index) : current,
    )
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
      quantity: Number.parseFloat(line.quantity) || 0,
      unit: line.unit,
      unitPriceFcfa: Number.parseInt(line.unitPriceFcfa.replace(/\D/g, ""), 10) || 0,
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

      setPurchases((current) => [result.data, ...current])
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
        window.alert(result.error)
        return
      }

      setPurchases((current) => current.filter((item) => item.id !== purchase.id))
    })
  }

  function openPaymentForm(purchase: PurchaseSummary) {
    setPaymentPurchaseId((current) => current === purchase.id ? null : purchase.id)
    setPaymentAmountFcfa(String(purchase.balanceFcfa))
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPaymentMethod("ESPECES")
    setPaymentReference("")
    setPaymentNotes("")
    setPaymentError(null)
  }

  function handleRecordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!paymentPurchaseId) return

    const amountFcfa = Number.parseInt(paymentAmountFcfa.replace(/\D/g, ""), 10) || 0
    if (amountFcfa <= 0) {
      setPaymentError("Le montant de paiement doit etre superieur a 0.")
      return
    }

    setPaymentError(null)
    startTransition(async () => {
      const result = await recordPurchasePayment({
        organizationId,
        purchaseId: paymentPurchaseId,
        amountFcfa,
        paymentDate: new Date(paymentDate),
        method: paymentMethod,
        reference: paymentReference,
        notes: paymentNotes,
      })

      if (!result.success) {
        setPaymentError(result.error)
        return
      }

      updatePurchase(result.data)
      setPaymentPurchaseId(null)
      setPaymentAmountFcfa("")
      setPaymentReference("")
      setPaymentNotes("")
    })
  }

  function openStockPanel(purchase: PurchaseSummary) {
    setStockError(null)
    setStockPurchaseId((current) => current === purchase.id ? null : purchase.id)
    setStockDrafts(
      Object.fromEntries(
        purchase.items.map((item) => [item.id, emptyStockLinkDraft(item.quantity)]),
      ),
    )
  }

  function updateStockDraft(
    purchaseItemId: string,
    field: keyof StockLinkDraft,
    value: string,
  ) {
    setStockDrafts((current) => ({
      ...current,
      [purchaseItemId]: {
        ...(current[purchaseItemId] ?? emptyStockLinkDraft(0)),
        [field]: value,
      },
    }))
  }

  function handleLinkItemToStock(purchaseId: string, purchaseItemId: string) {
    const draft = stockDrafts[purchaseItemId]
    if (!draft?.stockType || !draft.stockId) {
      setStockError("Choisis le type de stock et l'article de destination.")
      return
    }

    const quantity = Number.parseFloat(draft.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStockError("La quantite a ajouter au stock doit etre valide.")
      return
    }

    setStockError(null)
    startTransition(async () => {
      const result = await linkPurchaseItemToStock({
        organizationId,
        purchaseId,
        purchaseItemId,
        stockType: draft.stockType,
        stockId: draft.stockId,
        quantity,
        notes: draft.notes,
      })

      if (!result.success) {
        setStockError(result.error)
        return
      }

      updatePurchaseItemLinked(purchaseId, purchaseItemId)
    })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Achats fournisseur</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Garde les commandes, les paiements et l&apos;integration au stock dans un seul flux.
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
          value={formatMoneyFCFACompact(totals.totalFcfa)}
          sub={`${purchases.length} commandes`}
          accent="blue"
        />
        <KpiCard
          label="Montant paye"
          value={formatMoneyFCFACompact(totals.paidFcfa)}
          accent="green"
        />
        <KpiCard
          label="Reste a payer"
          value={formatMoneyFCFACompact(totals.balanceFcfa)}
          sub="Solde fournisseur"
          accent={totals.balanceFcfa > 0 ? "red" : undefined}
        />
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Les achats fournisseur se gerent ici. Les autres sorties d&apos;argent restent dans la page
        `Depenses` pour eviter les doublons.
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
                    Chaque ligne pourra ensuite etre reglee et envoyee au stock.
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
                  <div key={index} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
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
                placeholder="Informations utiles sur la livraison ou la destination interne."
                className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-green-500"
              />
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Resume de l&apos;achat</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{formatMoneyFCFA(formTotal)}</p>

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
                  Une fois l&apos;achat cree, tu peux enregistrer un paiement et envoyer chaque ligne
                  au stock quand la marchandise est effectivement recue.
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
              Chaque achat garde son solde fournisseur et peut alimenter le stock.
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {purchases.map((purchase) => (
              <div key={purchase.id} className="px-5 py-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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

                    <p className="mt-1 text-sm text-gray-500">{formatDate(purchase.purchaseDate)}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {purchase.items.map((item) => (
                        <span
                          key={item.id}
                          className={`rounded-full px-3 py-1 text-xs ${
                            item.stockLinked
                              ? "bg-green-50 text-green-700"
                              : "bg-gray-50 text-gray-600"
                          }`}
                        >
                          {item.description}
                          {item.stockLinked ? " - stocke" : ""}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-stretch gap-2 md:items-end">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatMoneyFCFACompact(purchase.totalFcfa)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Paye: {formatMoneyFCFA(purchase.paidFcfa)}
                      </p>
                      <p className={`text-xs ${purchase.balanceFcfa > 0 ? "text-red-600" : "text-green-600"}`}>
                        {purchase.balanceFcfa > 0
                          ? `Reste: ${formatMoneyFCFA(purchase.balanceFcfa)}`
                          : "Entierement regle"}
                      </p>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      {canRecordPayment && purchase.balanceFcfa > 0 ? (
                        <button
                          onClick={() => openPaymentForm(purchase)}
                          className="rounded-xl border border-green-200 px-3 py-2 text-sm font-medium text-green-700 transition hover:bg-green-50"
                        >
                          Enregistrer paiement
                        </button>
                      ) : null}

                      {canManageStock ? (
                        <button
                          onClick={() => openStockPanel(purchase)}
                          className="rounded-xl border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
                        >
                          Envoyer au stock
                        </button>
                      ) : null}

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
                </div>

                {paymentPurchaseId === purchase.id ? (
                  <form onSubmit={handleRecordPayment} className="mt-4 rounded-2xl border border-green-100 bg-green-50/70 p-4">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700">Montant</label>
                        <input
                          type="number"
                          min="1"
                          value={paymentAmountFcfa}
                          onChange={(event) => setPaymentAmountFcfa(event.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Date</label>
                        <input
                          type="date"
                          value={paymentDate}
                          onChange={(event) => setPaymentDate(event.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Methode</label>
                        <select
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value as (typeof PAYMENT_METHODS)[number]["value"])}
                          className="mt-1.5 w-full rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                        >
                          {PAYMENT_METHODS.map((method) => (
                            <option key={method.value} value={method.value}>
                              {method.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Reference</label>
                        <input
                          value={paymentReference}
                          onChange={(event) => setPaymentReference(event.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="text-sm font-medium text-gray-700">Notes</label>
                      <textarea
                        rows={2}
                        value={paymentNotes}
                        onChange={(event) => setPaymentNotes(event.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                      />
                    </div>

                    {paymentError ? (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {paymentError}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={isPending}
                        className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
                      >
                        Valider le paiement
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentPurchaseId(null)}
                        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-white"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                ) : null}

                {stockPurchaseId === purchase.id ? (
                  <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                    <p className="text-sm font-medium text-blue-900">
                      Choisis la destination de stock pour chaque ligne recue.
                    </p>

                    {stockError ? (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {stockError}
                      </div>
                    ) : null}

                    <div className="mt-4 space-y-4">
                      {purchase.items.map((item) => {
                        const draft = stockDrafts[item.id] ?? emptyStockLinkDraft(item.quantity)
                        const stockOptions = draft.stockType === "FEED" ? feedStocks : medicineStocks

                        return (
                          <div key={item.id} className="rounded-2xl border border-blue-100 bg-white p-4">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="font-medium text-gray-900">{item.description}</p>
                                <p className="text-sm text-gray-500">
                                  {item.quantity} {item.unit} - {formatMoneyFCFA(item.totalFcfa)}
                                </p>
                              </div>
                              {item.stockLinked ? (
                                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                                  Deja envoyee au stock
                                </span>
                              ) : null}
                            </div>

                            {!item.stockLinked ? (
                              <div className="mt-4 grid gap-4 md:grid-cols-4">
                                <div>
                                  <label className="text-sm font-medium text-gray-700">Type de stock</label>
                                  <select
                                    value={draft.stockType}
                                    onChange={(event) => {
                                      updateStockDraft(item.id, "stockType", event.target.value)
                                      updateStockDraft(item.id, "stockId", "")
                                    }}
                                    className="mt-1.5 w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500"
                                  >
                                    <option value="">Choisir</option>
                                    <option value="FEED">Aliment</option>
                                    <option value="MEDICINE">Medicament</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="text-sm font-medium text-gray-700">Article de stock</label>
                                  <select
                                    value={draft.stockId}
                                    onChange={(event) => updateStockDraft(item.id, "stockId", event.target.value)}
                                    disabled={!draft.stockType}
                                    className="mt-1.5 w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
                                  >
                                    <option value="">
                                      {draft.stockType ? "Selectionner" : "Choisir un type d'abord"}
                                    </option>
                                    {stockOptions.map((stock) => (
                                      <option key={stock.id} value={stock.id}>
                                        {"feedType" in stock ? stock.name : `${stock.name} (${stock.unit})`}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="text-sm font-medium text-gray-700">Quantite a stocker</label>
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={draft.quantity}
                                    onChange={(event) => updateStockDraft(item.id, "quantity", event.target.value)}
                                    className="mt-1.5 w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500"
                                  />
                                </div>

                                <div>
                                  <label className="text-sm font-medium text-gray-700">Notes</label>
                                  <input
                                    value={draft.notes}
                                    onChange={(event) => updateStockDraft(item.id, "notes", event.target.value)}
                                    className="mt-1.5 w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500"
                                  />
                                </div>
                              </div>
                            ) : null}

                            {!item.stockLinked && draft.stockType && stockOptions.length === 0 ? (
                              <p className="mt-3 text-sm text-amber-700">
                                Aucun article de stock disponible pour ce type. Cree d&apos;abord un stock.
                              </p>
                            ) : null}

                            {!item.stockLinked ? (
                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleLinkItemToStock(purchase.id, item.id)}
                                  disabled={isPending}
                                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                                >
                                  Ajouter au stock
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
