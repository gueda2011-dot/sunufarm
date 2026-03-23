"use client"

/**
 * SunuFarm — Page Clients (Client Component)
 *
 * Fonctionnalités :
 *   - KPI : nombre de clients, CA total, créances en cours
 *   - Liste filtrée (recherche + filtre type)
 *   - Formulaire inline d'ajout de client
 *   - Suppression avec confirmation
 */

import { useState, useTransition } from "react"
import {
  formatMoneyFCFACompact,
  formatMoneyFCFA,
  formatDate,
}                                  from "@/src/lib/formatters"
import { createCustomer, deleteCustomer } from "@/src/actions/customers"
import type { CustomerSummary }    from "@/src/actions/customers"

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  PROFESSIONNEL: "Professionnel",
  REVENDEUR:     "Revendeur",
  PARTICULIER:   "Particulier",
}

const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  PROFESSIONNEL: "bg-blue-100 text-blue-700",
  REVENDEUR:     "bg-purple-100 text-purple-700",
  PARTICULIER:   "bg-gray-100 text-gray-600",
}

function getOptionalFormValue(formData: FormData, key: string) {
  const value = formData.get(key)
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label:   string
  value:   string
  sub?:    string
  accent?: "green" | "red" | "blue"
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
// Props
// ---------------------------------------------------------------------------

interface Props {
  organizationId:  string
  userRole:        string
  customers:       CustomerSummary[]
  totalCustomers:  number
  totalRevenueFcfa: number
  totalBalanceFcfa: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CustomersPageClient({
  organizationId,
  userRole,
  customers: initialCustomers,
  totalCustomers,
  totalRevenueFcfa,
  totalBalanceFcfa,
}: Props) {
  const canMutate = ["SUPER_ADMIN", "OWNER", "MANAGER"].includes(userRole)

  const [customers, setCustomers] = useState<CustomerSummary[]>(initialCustomers)
  const [search,    setSearch]    = useState("")
  const [typeFilter, setTypeFilter] = useState("")

  // Formulaire création
  const [showForm, setShowForm]   = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ---------------------------------------------------------------------------
  // Filtrage local
  // ---------------------------------------------------------------------------

  const filtered = customers.filter((c) => {
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? "").includes(search) ||
      (c.email ?? "").toLowerCase().includes(search.toLowerCase())

    const matchType = !typeFilter || c.type === typeFilter

    return matchSearch && matchType
  })

  // ---------------------------------------------------------------------------
  // Création
  // ---------------------------------------------------------------------------

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createCustomer({
        organizationId,
        name: getOptionalFormValue(fd, "name") ?? "",
        phone: getOptionalFormValue(fd, "phone"),
        email: getOptionalFormValue(fd, "email"),
        address: getOptionalFormValue(fd, "address"),
        type: getOptionalFormValue(fd, "type") as
          | "PROFESSIONNEL"
          | "REVENDEUR"
          | "PARTICULIER"
          | undefined,
        notes: getOptionalFormValue(fd, "notes"),
      })

      if (!result.success) {
        setFormError(result.error)
        return
      }

      // Optimistic : ajouter le nouveau client avec des agrégats vides
      const newCustomer: CustomerSummary = {
        id:          result.data.id,
        name:        result.data.name,
        phone:       getOptionalFormValue(fd, "phone") ?? null,
        email:       getOptionalFormValue(fd, "email") ?? null,
        address:     getOptionalFormValue(fd, "address") ?? null,
        type:        getOptionalFormValue(fd, "type") ?? null,
        notes:       getOptionalFormValue(fd, "notes") ?? null,
        createdAt:   new Date(),
        salesCount:  0,
        totalFcfa:   0,
        paidFcfa:    0,
        balanceFcfa: 0,
      }

      setCustomers((prev) =>
        [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name))
      )
      setShowForm(false)
      ;(e.target as HTMLFormElement).reset()
    })
  }

  // ---------------------------------------------------------------------------
  // Suppression
  // ---------------------------------------------------------------------------

  function handleDelete(customer: CustomerSummary) {
    if (customer.salesCount > 0) return // bouton désactivé côté UI aussi

    if (!window.confirm(`Supprimer le client "${customer.name}" ?`)) return

    startTransition(async () => {
      const result = await deleteCustomer({ organizationId, customerId: customer.id })
      if (!result.success) {
        alert(result.error)
        return
      }
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id))
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
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Carnet clients et suivi des créances
          </p>
        </div>
        {canMutate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="shrink-0 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 active:scale-95 transition-all"
          >
            {showForm ? "Annuler" : "+ Nouveau client"}
          </button>
        )}
      </div>

      {/* ── KPI ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label="Clients"
          value={String(totalCustomers)}
          sub="enregistrés"
          accent="blue"
        />
        <KpiCard
          label="CA total"
          value={formatMoneyFCFACompact(totalRevenueFcfa)}
          sub="toutes ventes"
          accent="green"
        />
        <KpiCard
          label="Créances"
          value={formatMoneyFCFACompact(totalBalanceFcfa)}
          sub="reste à encaisser"
          accent={totalBalanceFcfa > 0 ? "red" : undefined}
        />
      </div>

      {/* ── Formulaire création ────────────────────────────────────────────── */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3"
        >
          <h2 className="text-sm font-semibold text-green-800">Nouveau client</h2>

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                name="name"
                required
                placeholder="Mamadou Diallo"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                name="type"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">— Choisir —</option>
                <option value="PROFESSIONNEL">Professionnel</option>
                <option value="REVENDEUR">Revendeur</option>
                <option value="PARTICULIER">Particulier</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Téléphone</label>
              <input
                name="phone"
                type="tel"
                placeholder="77 000 00 00"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input
                name="email"
                type="email"
                placeholder="client@exemple.com"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Adresse</label>
            <input
              name="address"
              placeholder="Quartier, ville..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Enregistrement…" : "Enregistrer le client"}
          </button>
        </form>
      )}

      {/* ── Filtres ────────────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <input
          type="search"
          placeholder="Rechercher un client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Tous les types</option>
          <option value="PROFESSIONNEL">Professionnel</option>
          <option value="REVENDEUR">Revendeur</option>
          <option value="PARTICULIER">Particulier</option>
        </select>
      </div>

      {/* ── Liste ──────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-8 text-center">
          <p className="text-sm text-gray-400">
            {customers.length === 0
              ? "Aucun client enregistré. Ajoutez votre premier client."
              : "Aucun résultat pour cette recherche."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((customer) => (
            <div
              key={customer.id}
              className="rounded-xl border border-gray-100 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{customer.name}</span>
                    {customer.type && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CUSTOMER_TYPE_COLORS[customer.type] ?? "bg-gray-100 text-gray-600"}`}>
                        {CUSTOMER_TYPE_LABELS[customer.type] ?? customer.type}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400 space-x-3">
                    {customer.phone && <span>{customer.phone}</span>}
                    {customer.email && <span>{customer.email}</span>}
                    {customer.address && <span>{customer.address}</span>}
                  </div>
                </div>

                {/* Stats ventes */}
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-gray-900 tabular-nums">
                    {formatMoneyFCFACompact(customer.totalFcfa)}
                  </div>
                  <div className="text-xs text-gray-400">
                    {customer.salesCount} vente{customer.salesCount !== 1 ? "s" : ""}
                  </div>
                  {customer.balanceFcfa > 0 && (
                    <div className="text-xs text-red-600 font-medium">
                      Reste {formatMoneyFCFA(customer.balanceFcfa)}
                    </div>
                  )}
                </div>
              </div>

              {/* Pied de carte */}
              <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2">
                <span className="text-xs text-gray-300">
                  Depuis {formatDate(customer.createdAt)}
                </span>
                {canMutate && (
                  <button
                    onClick={() => handleDelete(customer)}
                    disabled={customer.salesCount > 0 || isPending}
                    title={
                      customer.salesCount > 0
                        ? "Impossible de supprimer un client avec des ventes"
                        : "Supprimer ce client"
                    }
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
