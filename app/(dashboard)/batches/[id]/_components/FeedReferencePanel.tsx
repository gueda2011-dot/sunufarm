"use client"

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export interface FeedReferencePanelPoint {
  id: string
  label: string
  date: string
  ageDay: number
  actualKg: number
  referenceKg: number | null
  actualGPerBird: number | null
  referenceGPerBird: number | null
  source: "MANUAL_KG" | "ESTIMATED_FROM_BAG" | "ADVANCED_SACS_PER_DAY"
  confidence: "HIGH" | "MEDIUM" | "LOW" | null
}

interface FeedReferencePanelProps {
  points: FeedReferencePanelPoint[]
  manualFeedSharePct: number | null
  estimatedFeedSharePct: number | null
}

function compactKg(value: number): string {
  return `${value.toLocaleString("fr-SN", {
    minimumFractionDigits: value < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  })} kg`
}

function FeedTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string; value?: number; payload?: FeedReferencePanelPoint }>
  label?: string
}) {
  if (!active || !payload?.length || !payload[0]?.payload) return null

  const point = payload[0].payload

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-gray-900">{label} · Jour {point.ageDay}</p>
      <p className="mt-1 text-gray-600">Reel: {compactKg(point.actualKg)}</p>
      <p className="text-gray-600">
        Reference: {point.referenceKg != null ? compactKg(point.referenceKg) : "indisponible"}
      </p>
      <p className="mt-1 text-gray-500">
        Source: {point.source === "ESTIMATED_FROM_BAG" ? "Estime depuis sac" : "Saisie manuelle"}
      </p>
      {point.confidence ? (
        <p className="text-gray-500">Confiance: {point.confidence}</p>
      ) : null}
    </div>
  )
}

function buildQualityVerdict(manualFeedSharePct: number | null): string {
  if (manualFeedSharePct == null) return "Aucune donnee alimentaire exploitable"
  if (manualFeedSharePct >= 70) return "Lecture terrain solide"
  if (manualFeedSharePct >= 40) return "Lecture mixte manuel + estimation"
  return "Lecture surtout reconstruite"
}

export function FeedReferencePanel({
  points,
  manualFeedSharePct,
  estimatedFeedSharePct,
}: FeedReferencePanelProps) {
  if (points.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Aliment vs reference
        </h2>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
          Ajoute des saisies d&apos;aliment pour comparer le reel a la reference locale.
        </div>
      </section>
    )
  }

  const latestPoint = points[points.length - 1]

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Aliment vs reference
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Lecture locale de la consommation reelle comparee a la reference ajustee du lot.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Qualite des donnees</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            {buildQualityVerdict(manualFeedSharePct)}
          </p>
          <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">
            {manualFeedSharePct != null ? `${manualFeedSharePct}%` : "—"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            saisies manuelles · {estimatedFeedSharePct ?? 0}% estimees
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Dernier reel</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">
            {compactKg(latestPoint.actualKg)}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {latestPoint.actualGPerBird != null
              ? `${latestPoint.actualGPerBird.toLocaleString("fr-SN")} g/oiseau/jour`
              : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Derniere reference</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">
            {latestPoint.referenceKg != null ? compactKg(latestPoint.referenceKg) : "—"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {latestPoint.referenceGPerBird != null
              ? `${latestPoint.referenceGPerBird.toLocaleString("fr-SN")} g/oiseau/jour`
              : "Reference indisponible"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `${value}`}
              width={34}
            />
            <Tooltip content={<FeedTooltip />} />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Line
              type="monotone"
              dataKey="actualKg"
              name="Reel"
              stroke="#166534"
              strokeWidth={2.5}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="referenceKg"
              name="Reference"
              stroke="#0f766e"
              strokeDasharray="5 5"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
