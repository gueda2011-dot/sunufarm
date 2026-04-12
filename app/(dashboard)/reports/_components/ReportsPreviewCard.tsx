import Link from "next/link"
import { Download, Lock } from "lucide-react"
import { cn } from "@/src/lib/utils"
import type { CommercialPlan } from "@/src/lib/offer-catalog"
import type { MonthlyReportData } from "@/src/lib/monthly-report-view"
import {
  buildMonthlyReportsPreview,
  type MonthlyReportsPreviewModel,
} from "@/src/lib/reports-preview"

interface ReportsPreviewCardProps {
  report: MonthlyReportData
  commercialPlan: CommercialPlan
}

function ExportHint({
  report,
  commercialPlan,
}: {
  report: MonthlyReportData
  commercialPlan: CommercialPlan
}) {
  if (commercialPlan === "STARTER") {
    return (
      <Link
        href={`/api/reports/monthly?month=${report.month}&year=${report.year}&format=pdf`}
        className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
      >
        <Download className="h-4 w-4" />
        Export PDF avec watermark
      </Link>
    )
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
      <Lock className="h-4 w-4" />
      Export preview disponible a partir de Starter
    </div>
  )
}

function PreviewColumn({
  title,
  value,
  caption,
  className,
}: {
  title: string
  value: string
  caption: string
  className: string
}) {
  return (
    <div className={`rounded-xl border p-4 ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-wide">
        {title}
      </div>
      <div className="mt-2 text-lg font-semibold">
        {value}
      </div>
      <p className="mt-1 text-xs">
        {caption}
      </p>
    </div>
  )
}

export function ReportsPreviewCard({
  report,
  commercialPlan,
}: ReportsPreviewCardProps) {
  const preview: MonthlyReportsPreviewModel = buildMonthlyReportsPreview(report, commercialPlan)

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <div className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {preview.statusLabel}
        </div>
        <h2 className="mt-3 text-lg font-semibold text-gray-900">{preview.headline}</h2>
        <p className="mt-2 text-sm text-gray-700">{preview.explanation}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <PreviewColumn
          title="Apercu gratuit"
          value={preview.statusLabel}
          caption={preview.freeSignalCaption}
          className="border-slate-200 bg-slate-50 text-slate-800"
        />
        <PreviewColumn
          title="Apercu Starter"
          value={preview.starterRangeLabel}
          caption={preview.starterRangeCaption}
          className="border-blue-200 bg-blue-50 text-blue-900"
        />
        {/* Colonne Pro — blurée pour créer un signal de valeur cachée */}
        <div className={cn("relative overflow-hidden rounded-xl border p-4", "border-amber-200 bg-amber-50 text-amber-950")}>
          <div className="text-xs font-semibold uppercase tracking-wide">
            Lecture Pro
          </div>
          <div className="mt-2 select-none text-lg font-semibold blur-sm">
            Rapport complet
          </div>
          <p className="mt-1 select-none text-xs blur-sm">
            KPIs exacts, comparatifs et exports avances sans watermark.
          </p>
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-amber-50/60">
            <Lock className="h-5 w-5 text-amber-600" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {preview.drivers.map((driver) => (
          <div
            key={driver}
            className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700"
          >
            {driver}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <ExportHint report={report} commercialPlan={commercialPlan} />
        <p className="text-xs text-gray-500">
          La preview montre la tendance du mois. Pro sert a voir ou la marge se construit ou se degrade avant qu il soit trop tard.
        </p>
      </div>
    </div>
  )
}
