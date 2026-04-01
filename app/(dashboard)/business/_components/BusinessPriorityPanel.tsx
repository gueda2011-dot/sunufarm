import Link from "next/link"
import { AlertTriangle, Bird, Package2 } from "lucide-react"
import { formatNumber } from "@/src/lib/formatters"
import type {
  BusinessCriticalStockItem,
  BusinessPriorityLot,
} from "@/src/lib/business-dashboard"

function toneClasses(level: "critical" | "warning" | "ok") {
  if (level === "critical") return "border-red-200 bg-red-50 text-red-700"
  if (level === "warning") return "border-orange-200 bg-orange-50 text-orange-700"
  return "border-green-200 bg-green-50 text-green-700"
}

export function BusinessPriorityPanel({
  negativeMarginLots,
  mortalityRiskLots,
  criticalStockItems,
}: {
  negativeMarginLots: BusinessPriorityLot[]
  mortalityRiskLots: BusinessPriorityLot[]
  criticalStockItems: BusinessCriticalStockItem[]
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-red-50 p-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Lots a surveiller</h2>
            <p className="text-sm text-gray-500">Projection de marge negative en priorite.</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {negativeMarginLots.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500">
              Aucun lot ne projette une marge negative pour l&apos;instant.
            </p>
          ) : (
            negativeMarginLots.slice(0, 5).map((lot) => (
              <Link
                key={lot.id}
                href={`/batches/${lot.id}`}
                className="block rounded-2xl border border-red-100 bg-red-50 px-4 py-3 transition-colors hover:border-red-200"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-gray-900">{lot.number}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${toneClasses(lot.level)}`}>
                    {lot.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{lot.farmName}</p>
                <p className="mt-2 text-sm text-gray-700">{lot.detail}</p>
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-orange-50 p-2 text-orange-600">
            <Bird className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Risque sanitaire</h2>
            <p className="text-sm text-gray-500">Lots avec mortalite a surveiller ou critique.</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {mortalityRiskLots.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500">
              Aucun lot ne remonte de signal sanitaire fort aujourd&apos;hui.
            </p>
          ) : (
            mortalityRiskLots.slice(0, 5).map((lot) => (
              <Link
                key={lot.id}
                href={`/batches/${lot.id}`}
                className="block rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 transition-colors hover:border-orange-200"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-gray-900">{lot.number}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${toneClasses(lot.level)}`}>
                    {lot.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{lot.farmName}</p>
                <p className="mt-2 text-sm text-gray-700">{lot.detail}</p>
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-50 p-2 text-amber-700">
            <Package2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Stocks critiques</h2>
            <p className="text-sm text-gray-500">Articles a reapprovisionner sans attendre.</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {criticalStockItems.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500">
              Aucun article de stock n&apos;est en rupture critique.
            </p>
          ) : (
            criticalStockItems.slice(0, 5).map((item) => (
              <Link
                key={item.id}
                href="/stock"
                className="block rounded-2xl border border-red-100 bg-red-50 px-4 py-3 transition-colors hover:border-red-200"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-gray-900">{item.name}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${toneClasses("critical")}`}>
                    {item.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {item.type === "feed" ? "Aliment" : "Medicament"} · {item.farmName}
                </p>
                <p className="mt-2 text-sm text-gray-700">
                  {item.daysToStockout == null
                    ? "Pas de projection exploitable"
                    : `${formatNumber(Math.round(item.daysToStockout))} jour(s) restants estimes`}
                </p>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
