export type SaleStockImpact = {
  enabled: boolean
  feedStockId: string | null
}

const STOCK_IMPACT_TAG_PATTERN =
  /^\[SALE_STOCK_IMPACT:(OFF|FIENTE_FEED:[^\]\r\n]+)\]\s*/i
const SALE_LINK_TAG_PATTERN = /\[SALE_LINK:([^\]\r\n]+)\]/i

export function buildSaleNotesWithStockImpact(
  impact: SaleStockImpact,
  notes?: string | null,
) {
  const trimmed = notes?.trim()
  const tag =
    impact.enabled && impact.feedStockId
      ? `[SALE_STOCK_IMPACT:FIENTE_FEED:${impact.feedStockId}]`
      : "[SALE_STOCK_IMPACT:OFF]"

  return trimmed ? `${tag}\n${trimmed}` : tag
}

export function parseSaleStockImpact(
  notes: string | null | undefined,
): SaleStockImpact {
  if (!notes) {
    return { enabled: false, feedStockId: null }
  }

  const match = notes.match(STOCK_IMPACT_TAG_PATTERN)
  const raw = match?.[1]
  const normalized = raw?.toUpperCase()

  if (!raw || normalized === "OFF") {
    return { enabled: false, feedStockId: null }
  }

  if (normalized?.startsWith("FIENTE_FEED:")) {
    return {
      enabled: true,
      feedStockId: raw.slice("FIENTE_FEED:".length),
    }
  }

  return { enabled: false, feedStockId: null }
}

export function stripSaleStockImpactFromNotes(
  notes: string | null | undefined,
) {
  if (!notes) return null
  const cleaned = notes.replace(STOCK_IMPACT_TAG_PATTERN, "").trim()
  return cleaned.length > 0 ? cleaned : null
}

export function buildSaleMovementContext(
  saleId: string,
  label: string,
  notes?: string | null,
) {
  const trimmed = notes?.trim()
  const parts = [`[SALE_LINK:${saleId}]`, label]

  if (trimmed) {
    parts.push(trimmed)
  }

  return parts.join("\n")
}

export function extractSaleLinkFromMovementNotes(
  notes: string | null | undefined,
) {
  if (!notes) return null
  const match = notes.match(SALE_LINK_TAG_PATTERN)
  return match?.[1] ?? null
}
