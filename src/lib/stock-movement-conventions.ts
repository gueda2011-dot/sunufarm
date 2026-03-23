export const STOCK_MOVEMENT_KINDS = [
  "ENTREE",
  "SORTIE",
  "AJUSTEMENT",
  "INVENTAIRE",
] as const

export const STOCK_MOVEMENT_SOURCES = [
  "MANUEL",
  "ACHAT",
  "VENTE",
  "SANTE",
  "CORRECTION",
] as const

export const STOCK_ADJUSTMENT_DIRECTIONS = ["PLUS", "MOINS"] as const

export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number]
export type StockMovementSource = (typeof STOCK_MOVEMENT_SOURCES)[number]
export type StockAdjustmentDirection =
  (typeof STOCK_ADJUSTMENT_DIRECTIONS)[number]
export type StockDomain = "ALIMENT" | "MEDICAMENT"

type MovementKindConvention = {
  label: string
  description: string
  impact: "INCREASE" | "DECREASE" | "SIGNED_DELTA" | "SET_ABSOLUTE"
}

type MovementValidationInput = {
  type: StockMovementKind
  quantity: number
  availableQuantity: number
  stockId?: string
  adjustmentDirection?: StockAdjustmentDirection
}

const SOURCE_TAG_PATTERN =
  /^\[SOURCE:(MANUEL|ACHAT|VENTE|SANTE|CORRECTION)\]\s*/i

const MOVEMENT_KIND_CONVENTIONS: Record<
  StockMovementKind,
  MovementKindConvention
> = {
  ENTREE: {
    label: "Entree",
    description: "Ajoute une quantite au stock disponible.",
    impact: "INCREASE",
  },
  SORTIE: {
    label: "Sortie",
    description: "Retire une quantite du stock disponible.",
    impact: "DECREASE",
  },
  AJUSTEMENT: {
    label: "Ajustement",
    description:
      "Corrige un ecart constate sans modifier l'historique existant.",
    impact: "SIGNED_DELTA",
  },
  INVENTAIRE: {
    label: "Inventaire",
    description:
      "Remplace le disponible par la quantite physique observee lors du comptage.",
    impact: "SET_ABSOLUTE",
  },
}

const MOVEMENT_SOURCE_LABELS: Record<StockMovementSource, string> = {
  MANUEL: "Manuel",
  ACHAT: "Achat",
  VENTE: "Vente",
  SANTE: "Sante",
  CORRECTION: "Correction",
}

const DOMAIN_SUPPORTED_KINDS: Record<StockDomain, StockMovementKind[]> = {
  ALIMENT: ["ENTREE", "SORTIE", "AJUSTEMENT", "INVENTAIRE"],
  MEDICAMENT: ["ENTREE", "SORTIE", "INVENTAIRE"],
}

export function getSupportedStockMovementKinds(
  domain: StockDomain,
): StockMovementKind[] {
  return DOMAIN_SUPPORTED_KINDS[domain]
}

export function getStockMovementKindMeta(kind: StockMovementKind) {
  return MOVEMENT_KIND_CONVENTIONS[kind]
}

export function getStockMovementSourceLabel(source: StockMovementSource) {
  return MOVEMENT_SOURCE_LABELS[source]
}

export function validateStockMovementInput({
  type,
  quantity,
  availableQuantity,
  stockId,
  adjustmentDirection,
}: MovementValidationInput): string | null {
  if (!stockId) {
    return "Le stock cible est obligatoire."
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return "La quantite doit etre strictement positive."
  }

  if (type === "AJUSTEMENT" && !adjustmentDirection) {
    return "Le sens de l'ajustement est obligatoire."
  }

  if (type === "SORTIE" && quantity > availableQuantity) {
    return "La sortie ne peut pas depasser le disponible."
  }

  if (
    type === "AJUSTEMENT" &&
    adjustmentDirection === "MOINS" &&
    quantity > availableQuantity
  ) {
    return "La correction a la baisse ne peut pas depasser le disponible."
  }

  return null
}

export function computeSignedDeltaQuantity(
  type: StockMovementKind,
  quantity: number,
  adjustmentDirection?: StockAdjustmentDirection,
) {
  if (type !== "AJUSTEMENT") return quantity
  return adjustmentDirection === "MOINS" ? -quantity : quantity
}

export function buildMovementNotesWithSource(
  source: StockMovementSource,
  notes?: string,
) {
  const trimmed = notes?.trim()
  const tag = `[SOURCE:${source}]`
  return trimmed ? `${tag}\n${trimmed}` : tag
}

export function extractMovementSourceFromNotes(
  notes: string | null | undefined,
): StockMovementSource | null {
  if (!notes) return null
  const match = notes.match(SOURCE_TAG_PATTERN)
  return (match?.[1]?.toUpperCase() as StockMovementSource | undefined) ?? null
}

export function stripMovementSourceFromNotes(
  notes: string | null | undefined,
) {
  if (!notes) return null
  const cleaned = notes.replace(SOURCE_TAG_PATTERN, "").trim()
  return cleaned.length > 0 ? cleaned : null
}
