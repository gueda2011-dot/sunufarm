"use client"

/**
 * SunuFarm — Page Achats (Client Component)
 *
 * Formulaire de création avec lignes d'articles dynamiques (+ / −).
 * Total recalculé à chaque frappe.
 */

import { useState, useTransition } from "react"
import {
  formatMoneyFCFA,
  formatMoneyFCFACompact,
  formatDate,
}                                  from "@/src/lib/formatters"
import { createPurchase, deletePurchase } from "@/src/actions/purchases"
import type { PurchaseSummary }           from "@/src/actions/purchases"

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------

interface Supplier {
  id:   string
  name: string
  type: string | null
}

interface LineItem {
  description:   string
  quantity:      string
  unit:          string
  unitPriceFcfa: string
}

function emptyLine(): LineItem {
  return { description: "", quantity: "", unit: "KG", unitPriceFcfa: "" }
}

function lineTotal(line: LineItem): number {
  const qty   = parseFloat(line.quantity)  || 0
  const price = parseInt(line.unitPriceFcfa.replace(/\D/g, ""), 10) || 0
  return Math.round(qty * price)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  organizationId: string
  userRole:       string
  purchases:      PurchaseSummary[]
  suppliers:      Supplier[]
  totalFcfa:      number
  paidFcfa:       number
  balanceFcfa:    number
}

// ---------------------------------------------------------------------------
// KpiCard
// ---------------------------------------------------------------------------

function KpiCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: "green" | "red" | "blue"
}) {
  const cls =
    accent === "green" ? "text-green-700" :
    accent === "red"   ? "text-red-600"   :
    accent === "blue"  ? "text-blue-600"  :
    "text-gray-900"
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums leading-tight ${cls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const [showForm,  setShowForm]  = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [lines,     setLines]     = useState<LineItem[]>([emptyLine()])
  const [isPending, startTransition] = useTransition()

  const today = new Date().toISOString().slice(0, 10)

  // ---------------------------------------------------------------------------
  // Gestion des lignes
  // ---------------------------------------------------------------------------

  function updateLine(idx: number, field: keyof LineItem, value: string) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  }

  const formTotal = lines.reduce((s, l) => s + lineTotal(l), 0)

  // ---------------------------------------------------------------------------
  // Création
  // ---------------------------------------------------------------------------

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    const fd = new FormData(e.currentTarget)

    const supplierId = (fd.get("supplierId") as string) || undefined

    const items = lines.map((l) => ({
      description:   l.description,
      quantity:      parseFloat(l.quantity) || 0,
      unit:          l.unit,
      unitPriceFcfa: parseInt(l.unitPriceFcfa.replace(/\D/g, ""), 10) || 0,
    }))

    startTransition(async () => {
      const result = await createPurchase({
        organizationId,
        supplierId,
        purchaseDate: new Date(fd.get("purchaseDate") as string),
        reference:    fd.get("reference") as string,
        notes:        fd.get("notes") as string,
        items,
      })

      if (!result.success) { setFormError(result.error); return }

      const supplier = suppliers.find((s) => s.id === supplierId) ?? null

      const newPurchase: PurchaseSummary = {
        id:           result.data.id,
        purchaseDate: new Date(fd.get("purchaseDate") as string),
        reference:    (fd.get("reference") as string) || null,
        totalFcfa:    formTotal,
        paidFcfa:     0,
        balanceFcfa:  formTotal,
        notes:        (fd.get("notes") as string) || null,
        createdAt:    new Date(),
        supplier:     supplier ? { id: supplier.id, name: supplier.name, type: supplier.type } : null,
        items:        items.map((item) => ({
          ...item,
          totalFcfa: Math.round(item.quantity * item.unitPriceFcfa),
        })),
      }

      setPurchases((prev) => [newPurchase, ...prev])
      setShowForm(false)
      setLines([emptyLine()])
      ;(e.target as HTMLFormElement).reset()
    })
  }

  // ---------------------------------------------------------------------------
  // Suppression
  // ---------------------------------------------------------------------------

  function handleDelete(purchase: PurchaseSummary) {
    if (!window.confirm(`Supprimer cet achat de ${formatMoneyFCFA(purchase.totalFcfa)} ?`)) return

    startTransition(async () => {
      const result = await deletePurchase({ organizationId, purchaseId: purchase.id })
      if (!result.success) { alert(result.error); return }
      setPurchases((prev) => prev.filter((p) => p.id !== purchase.id))
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-3xl space-y-6">

      {/* ── En-tête ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Achats</h1>
          <p className="text-sm text-gray-500 mt-0.5">Commandes fournisseurs</p>
        </div>
        {canMutate && (
          <button
            onClick={() => { setShowForm((v) => !v); setFormError(null); setLines([emptyLine()]) }}
            className="shrink-0 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 active:scale-95 transition-all"
          >
            {showForm ? "Annuler" : "+ Nouvel achat"}
          </button>
        )}
      </div>

      {/* ── KPI ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label="Total achats"
          value={formatMoneyFCFACompact(totalFcfa)}
          sub={`${purchases.length} commandes`}
        />
        <KpiCard label="Payé" value={formatMoneyFCFACompact(paidFcfa)} accent="green" />
        <KpiCard
          label="Solde dû"
          value={formatMoneyFCFACompact(balanceFcfa)}
          sub="fournisseurs"
          accent={balanceFcfa > 0 ? "red" : undefined}
        />
      </div>

      {/* ── Formulaire ─────────────────────────────────────────────────────── */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-4"
        >
          <h2 className="text-sm font-semibold text-green-800">Nouvel achat</h2>

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
          )}

          {/* Date + Fournisseur */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                name="purchaseDate"
                type="date"
                required
                defaultValue={today}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fournisseur</label>
              <select
                name="supplierId"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">— Sans fournisseur —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Référence */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">N° facture fournisseur</label>
            <input
              name="reference"
              placeholder="FAC-2025-001"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Lignes d'articles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500">
                Lignes ({lines.length})
              </p>
              <button
                type="button"
                onClick={addLine}
                className="text-xs text-green-700 font-medium hover:underline"
              >
                + Ajouter une ligne
              </button>
            </div>

            {lines.map((line, idx) => (
              <div key={idx} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Ligne {idx + 1}</span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={line.description}
                    onChange={(e) => updateLine(idx, "description", e.target.value)}
                    placeholder="Aliment croissance, Poussins, Vaccin Newcastle..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Quantité <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                      placeholder="50"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Unité</label>
                    <select
                      value={line.unit}
                      onChange={(e) => updateLine(idx, "unit", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="KG">kg</option>
                      <option value="SAC">sac</option>
                      <option value="PIECE">pièce</option>
                      <option value="DOSE">dose</option>
                      <option value="LITRE">litre</option>
                      <option value="BOITE">boîte</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Prix/unit (FCFA) <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      type="number"
                      min="1"
                      value={line.unitPriceFcfa}
                      onChange={(e) => updateLine(idx, "unitPriceFcfa", e.target.value)}
                      placeholder="15000"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
                {lineTotal(line) > 0 && (
                  <p className="text-xs text-right text-gray-500 tabular-nums">
                    Sous-total : <strong>{formatMoneyFCFA(lineTotal(line))}</strong>
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input
              name="notes"
              placeholder="Remarques optionnelles..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Total + bouton */}
          {formTotal > 0 && (
            <div className="rounded-lg bg-white border border-gray-200 px-4 py-2 flex items-center justify-between">
              <span className="text-sm text-gray-500">Total commande</span>
              <span className="font-bold text-gray-900 tabular-nums">{formatMoneyFCFA(formTotal)}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Enregistrement…" : "Enregistrer l'achat"}
          </button>
        </form>
      )}

      {/* ── Liste ──────────────────────────────────────────────────────────── */}
      {purchases.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
          Aucun achat enregistré.
        </div>
      ) : (
        <div className="space-y-2">
          {purchases.map((purchase) => (
            <div key={purchase.id} className="rounded-xl border border-gray-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">
                      {purchase.supplier?.name ?? "Sans fournisseur"}
                    </span>
                    {purchase.reference && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {purchase.reference}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    {purchase.items.length} ligne{purchase.items.length > 1 ? "s" : ""}
                    {" · "}
                    {purchase.items.map((i) => i.description).join(", ")}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-gray-900 tabular-nums">
                    {formatMoneyFCFACompact(purchase.totalFcfa)}
                  </div>
                  {purchase.balanceFcfa > 0 ? (
                    <div className="text-xs text-red-600">Dû : {formatMoneyFCFA(purchase.balanceFcfa)}</div>
                  ) : (
                    <div className="text-xs text-green-600">Payé</div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2">
                <span className="text-xs text-gray-300">{formatDate(purchase.purchaseDate)}</span>
                {canMutate && (
                  <button
                    onClick={() => handleDelete(purchase)}
                    disabled={isPending || purchase.paidFcfa > 0}
                    title={purchase.paidFcfa > 0 ? "Impossible de supprimer un achat avec des paiements" : "Supprimer"}
                    className="text-xs text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
