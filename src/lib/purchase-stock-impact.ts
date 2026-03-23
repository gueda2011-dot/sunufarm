export type PurchaseStockTargetType = "ALIMENT" | "MEDICAMENT"

export type PurchaseStockImpact = {
  enabled: boolean
  targetType: PurchaseStockTargetType | null
  targetStockId: string | null
}

const STOCK_IMPACT_TAG_PATTERN =
  /^\[STOCK_IMPACT:(OFF|ALIMENT:[^\]\r\n]+|MEDICAMENT:[^\]\r\n]+)\]\s*/i
const PURCHASE_LINK_TAG_PATTERN = /\[PURCHASE_LINK:([^\]\r\n]+)\]/i

export function buildPurchaseNotesWithStockImpact(
  impact: PurchaseStockImpact,
  notes?: string | null,
) {
  const trimmed = notes?.trim()
  const tag = impact.enabled && impact.targetType && impact.targetStockId
    ? `[STOCK_IMPACT:${impact.targetType}:${impact.targetStockId}]`
    : "[STOCK_IMPACT:OFF]"

  return trimmed ? `${tag}\n${trimmed}` : tag
}

export function parsePurchaseStockImpact(
  notes: string | null | undefined,
): PurchaseStockImpact {
  if (!notes) {
    return {
      enabled: false,
      targetType: null,
      targetStockId: null,
    }
  }

  const match = notes.match(STOCK_IMPACT_TAG_PATTERN)
  const raw = match?.[1]
  const normalized = raw?.toUpperCase()

  if (!raw || normalized === "OFF") {
    return {
      enabled: false,
      targetType: null,
      targetStockId: null,
    }
  }

  if (normalized?.startsWith("ALIMENT:")) {
    return {
      enabled: true,
      targetType: "ALIMENT",
      targetStockId: raw.slice("ALIMENT:".length),
    }
  }

  if (normalized?.startsWith("MEDICAMENT:")) {
    return {
      enabled: true,
      targetType: "MEDICAMENT",
      targetStockId: raw.slice("MEDICAMENT:".length),
    }
  }

  return {
    enabled: false,
    targetType: null,
    targetStockId: null,
  }
}

export function stripPurchaseStockImpactFromNotes(
  notes: string | null | undefined,
) {
  if (!notes) return null
  const cleaned = notes.replace(STOCK_IMPACT_TAG_PATTERN, "").trim()
  return cleaned.length > 0 ? cleaned : null
}

export function buildPurchaseMovementContext(
  purchaseId: string,
  label: string,
  notes?: string | null,
) {
  const trimmed = notes?.trim()
  const parts = [`[PURCHASE_LINK:${purchaseId}]`, label]

  if (trimmed) {
    parts.push(trimmed)
  }

  return parts.join("\n")
}

export function extractPurchaseLinkFromMovementNotes(
  notes: string | null | undefined,
) {
  if (!notes) return null
  const match = notes.match(PURCHASE_LINK_TAG_PATTERN)
  return match?.[1] ?? null
}
