"use client"

/**
 * SunuFarm — Graphique mortalité 30 derniers jours (dashboard)
 *
 * Area chart recharts — rendu uniquement si au moins 1 mort enregistré.
 * Les jours sans saisie affichent 0 (gaps remplis côté serveur).
 */

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MortalityChartPoint {
  /** "dd/MM" */
  date: string
  mort: number
}

interface Props {
  data: MortalityChartPoint[]
}

// ---------------------------------------------------------------------------
// Tooltip personnalisé
// ---------------------------------------------------------------------------

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-gray-500 mb-0.5">{label}</p>
      <p className={val > 0 ? "font-semibold text-red-600" : "text-gray-400"}>
        {val} mort{val > 1 ? "s" : ""}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MortalityChart({ data }: Props) {
  const hasAnyMortality = data.some((d) => d.mort > 0)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Mortalité — 30 derniers jours
      </h2>

      {!hasAnyMortality ? (
        <div className="flex items-center justify-center h-24 text-sm text-gray-400">
          Aucune mortalité enregistrée sur la période
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <defs>
              <linearGradient id="mortGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#dc2626" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />

            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />

            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={28}
            />

            <Tooltip content={<CustomTooltip />} />

            <Area
              type="monotone"
              dataKey="mort"
              stroke="#dc2626"
              strokeWidth={2}
              fill="url(#mortGrad)"
              dot={false}
              activeDot={{ r: 4, fill: "#dc2626", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
