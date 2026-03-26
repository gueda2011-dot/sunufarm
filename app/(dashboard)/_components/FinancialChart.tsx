"use client"

/**
 * SunuFarm — Graphique financier mensuel (page rapports)
 *
 * Bar chart simple : Revenus / Dépenses / Achats du mois sélectionné.
 * Masqué si toutes les valeurs sont à 0.
 */

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortFcfa(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)     return `${Math.round(value / 1_000)}K`
  return String(value)
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
  payload?: Array<{ value: number; payload: { color: string } }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-gray-500 mb-0.5">{label}</p>
      <p className="font-semibold text-gray-900">{shortFcfa(val)} FCFA</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props & données
// ---------------------------------------------------------------------------

interface Props {
  totalSales:     number
  totalExpenses:  number
  totalPurchases: number
}

const COLORS = {
  Revenus:   "#16a34a",
  Dépenses:  "#ea580c",
  Achats:    "#2563eb",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FinancialChart({ totalSales, totalExpenses, totalPurchases }: Props) {
  const data = [
    { name: "Revenus",  value: totalSales,     color: COLORS.Revenus },
    { name: "Dépenses", value: totalExpenses,   color: COLORS.Dépenses },
    { name: "Achats",   value: totalPurchases,  color: COLORS.Achats },
  ].filter((d) => d.value > 0)

  if (data.length === 0) return null

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Vue financière du mois
      </h2>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />

          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
          />

          <YAxis
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={shortFcfa}
            width={40}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f9fafb" }} />

          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={60}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
