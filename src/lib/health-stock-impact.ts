export type VaccinationStockImpact = {
  enabled: boolean
  consumedQuantity: number | null
  consumedUnit: string | null
}

const VACCINATION_STOCK_IMPACT_TAG_PATTERN =
  /^\[VACCINATION_STOCK_IMPACT:(OFF|ON:[^\]\r\n:]+:[^\]\r\n]+)\]\s*/i
const VACCINATION_LINK_TAG_PATTERN = /\[VACCINATION_LINK:([^\]\r\n]+)\]/i

export function buildVaccinationNotesWithStockImpact(
  impact: VaccinationStockImpact,
  notes?: string | null,
) {
  const trimmed = stripVaccinationStockImpactFromNotes(notes)?.trim()
  const tag =
    impact.enabled && impact.consumedQuantity && impact.consumedUnit
      ? `[VACCINATION_STOCK_IMPACT:ON:${impact.consumedQuantity}:${impact.consumedUnit}]`
      : "[VACCINATION_STOCK_IMPACT:OFF]"

  return trimmed ? `${tag}\n${trimmed}` : tag
}

export function parseVaccinationStockImpact(
  notes: string | null | undefined,
): VaccinationStockImpact {
  if (!notes) {
    return { enabled: false, consumedQuantity: null, consumedUnit: null }
  }

  const match = notes.match(VACCINATION_STOCK_IMPACT_TAG_PATTERN)
  const raw = match?.[1]
  const normalized = raw?.toUpperCase()

  if (!raw || normalized === "OFF") {
    return { enabled: false, consumedQuantity: null, consumedUnit: null }
  }

  if (normalized?.startsWith("ON:")) {
    const [, quantity, ...unitParts] = raw.split(":")
    const consumedQuantity = Number(quantity)
    const consumedUnit = unitParts.join(":")

    if (Number.isFinite(consumedQuantity) && consumedQuantity > 0 && consumedUnit) {
      return {
        enabled: true,
        consumedQuantity,
        consumedUnit,
      }
    }
  }

  return { enabled: false, consumedQuantity: null, consumedUnit: null }
}

export function stripVaccinationStockImpactFromNotes(
  notes: string | null | undefined,
) {
  if (!notes) return null
  const cleaned = notes.replace(VACCINATION_STOCK_IMPACT_TAG_PATTERN, "").trim()
  return cleaned.length > 0 ? cleaned : null
}

export function buildVaccinationMovementContext(
  vaccinationId: string,
  label: string,
  notes?: string | null,
) {
  const trimmed = notes?.trim()
  const parts = [`[VACCINATION_LINK:${vaccinationId}]`, label]

  if (trimmed) {
    parts.push(trimmed)
  }

  return parts.join("\n")
}

export function extractVaccinationLinkFromMovementNotes(
  notes: string | null | undefined,
) {
  if (!notes) return null
  const match = notes.match(VACCINATION_LINK_TAG_PATTERN)
  return match?.[1] ?? null
}
