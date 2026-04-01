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

function sectionTone(border: "red" | "orange" | "amber") {
  if (border === "red") return "border-red-200 bg-red-50/40"
  if (border === "orange") return "border-orange-200 bg-orange-50/40"
  return "border-amber-200 bg-amber-50/40"
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
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Ce qui menace l&apos;exploitation</h2>
        <p className="mt-1 text-sm text-gray-500">
          Une lecture immediate des problemes qui peuvent degrader la marge, la sante ou la continuite terrain.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className={`rounded-3xl border p-5 shadow-sm ${sectionTone("red")}`}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-red-50 p-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Lots qui menacent la marge</h2>
              <p className="text-sm text-gray-500">Les dossiers qui peuvent faire perdre de l&apos;argent rapidement.</p>
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

        <div className={`rounded-3xl border p-5 shadow-sm ${sectionTone("orange")}`}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-orange-50 p-2 text-orange-600">
              <Bird className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Pressions sanitaires</h2>
              <p className="text-sm text-gray-500">Les lots dont le risque mortalite peut vite se transformer en perte.</p>
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

        <div className={`rounded-3xl border p-5 shadow-sm ${sectionTone("amber")}`}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-amber-50 p-2 text-amber-700">
              <Package2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Approvisionnements sous tension</h2>
              <p className="text-sm text-gray-500">Les reapprovisionnements a traiter avant qu&apos;ils ne bloquent l&apos;activite.</p>
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
                    {item.type === "feed" ? "Aliment" : "Medicament"} - {item.farmName}
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
      </div>
    </section>
  )
}
