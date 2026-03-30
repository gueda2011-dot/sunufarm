"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, ShieldCheck, Wrench } from "lucide-react"
import { resolveStockOrphanIssue, type StockOrphanIssue } from "@/src/actions/admin-stock-integrity"
import { Button } from "@/src/components/ui/button"
import { formatDateTime, formatMoneyFCFA, formatNumber } from "@/src/lib/formatters"

interface AdminStockIntegrityPanelProps {
  issues: StockOrphanIssue[]
}

export function AdminStockIntegrityPanel({
  issues: initialIssues,
}: AdminStockIntegrityPanelProps) {
  const router = useRouter()
  const [issues, setIssues] = useState(initialIssues)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"ALL" | "SAFE">("ALL")
  const [isPending, startTransition] = useTransition()

  const filteredIssues = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return issues.filter((issue) => {
      const matchesFilter = filter === "ALL" ? true : issue.safeToResolve
      const haystack = [
        issue.organizationName,
        issue.stockName,
        issue.reference,
        issue.kind,
      ].join(" ").toLowerCase()

      const matchesQuery =
        normalizedQuery.length === 0 || haystack.includes(normalizedQuery)

      return matchesFilter && matchesQuery
    })
  }, [filter, issues, query])

  function handleResolve(issue: StockOrphanIssue) {
    startTransition(async () => {
      const result = await resolveStockOrphanIssue({
        kind: issue.kind,
        movementId: issue.movementId,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setIssues((current) => current.filter((item) => item.movementId !== issue.movementId))
      toast.success("Orphelin de stock corrige")
      router.refresh()
    })
  }

  return (
    <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Integrite du stock</h2>
              <p className="text-sm text-gray-500">
                Detecte les stocks orphelins issus d&apos;achats supprimes et propose une correction admin traçable.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFilter("ALL")}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${filter === "ALL" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              Tous
            </button>
            <button
              type="button"
              onClick={() => setFilter("SAFE")}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${filter === "SAFE" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              Corrigeables
            </button>
          </div>
        </div>

        <div className="mt-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une organisation, un stock ou une reference..."
            className="h-[52px] w-full rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600 lg:max-w-xl"
          />
        </div>
      </div>

      <div className="px-6 py-5">
        {filteredIssues.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
            Aucun orphelin de stock detecte pour ces filtres.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredIssues.map((issue) => (
              <div key={issue.id} className="rounded-2xl border border-gray-100 p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{issue.stockName}</p>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                        {issue.organizationName}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${issue.safeToResolve ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                        {issue.safeToResolve ? "Correction auto OK" : "Analyse manuelle"}
                      </span>
                    </div>

                    <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <span className="text-gray-400">Type :</span>{" "}
                        <span className="font-medium text-gray-900">{issue.kind}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Entree orpheline :</span>{" "}
                        <span className="font-medium text-gray-900">
                          {formatNumber(issue.quantity)} {issue.unit}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Stock courant :</span>{" "}
                        <span className="font-medium text-gray-900">
                          {formatNumber(issue.currentStockQuantity)} {issue.unit}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Montant :</span>{" "}
                        <span className="font-medium text-gray-900">
                          {formatMoneyFCFA(issue.totalFcfa)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Date :</span>{" "}
                        <span className="font-medium text-gray-900">{formatDateTime(issue.movementDate)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Mouvements stock :</span>{" "}
                        <span className="font-medium text-gray-900">{issue.movementCount}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Usages relies :</span>{" "}
                        <span className="font-medium text-gray-900">{issue.linkedUsageCount}</span>
                      </div>
                      <div className="sm:col-span-2 xl:col-span-1">
                        <span className="text-gray-400">Reference :</span>{" "}
                        <span className="font-mono text-xs text-gray-900">{issue.reference}</span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      {issue.resolutionHint}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {issue.safeToResolve ? (
                      <Button
                        size="sm"
                        loading={isPending}
                        onClick={() => handleResolve(issue)}
                      >
                        <Wrench className="h-4 w-4" />
                        Corriger
                      </Button>
                    ) : (
                      <div className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <AlertTriangle className="h-4 w-4" />
                        Manuelle
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
