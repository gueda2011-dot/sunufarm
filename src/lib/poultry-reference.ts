import {
  BatchType,
  PoultryProductionType,
  PoultrySpecies,
  VaccinationPlanTemplateProductionType,
} from "@/src/generated/prisma/client"

const CHICKEN_SPECIES_CODES = new Set(["POULET", "PONDEUSE", "CHICKEN"])
const GUINEA_FOWL_SPECIES_CODES = new Set(["PINTADE", "GUINEA_FOWL"])

export function inferPoultrySpeciesFromSpeciesCode(
  code: string | null | undefined,
): PoultrySpecies | null {
  if (!code) return null

  const normalized = code.trim().toUpperCase()
  if (CHICKEN_SPECIES_CODES.has(normalized)) return PoultrySpecies.CHICKEN
  if (GUINEA_FOWL_SPECIES_CODES.has(normalized)) return PoultrySpecies.GUINEA_FOWL
  return null
}

export function getCompatibleProductionTypesForBatchType(
  batchType: BatchType,
): PoultryProductionType[] {
  switch (batchType) {
    case BatchType.CHAIR:
      return [
        PoultryProductionType.BROILER,
        PoultryProductionType.LOCAL,
        PoultryProductionType.DUAL,
      ]
    case BatchType.PONDEUSE:
      return [
        PoultryProductionType.LAYER,
        PoultryProductionType.LOCAL,
        PoultryProductionType.DUAL,
      ]
    case BatchType.REPRODUCTEUR:
      return [
        PoultryProductionType.LOCAL,
        PoultryProductionType.DUAL,
      ]
    default:
      return []
  }
}

export function isStrainCompatibleWithBatchType(
  strainProductionType: PoultryProductionType,
  batchType: BatchType,
) {
  return getCompatibleProductionTypesForBatchType(batchType).includes(
    strainProductionType,
  )
}

export function getTemplateProductionTypeForBatchType(batchType: BatchType) {
  switch (batchType) {
    case BatchType.CHAIR:
      return VaccinationPlanTemplateProductionType.BROILER
    case BatchType.PONDEUSE:
      return VaccinationPlanTemplateProductionType.LAYER
    default:
      return null
  }
}

export function buildVaccinationPlanNameFromTemplate(
  templateName: string,
  batchNumber: string,
) {
  return `${templateName} - ${batchNumber}`
}

export function buildVaccinationPlanItemNotesFromTemplate(args: {
  disease?: string | null
  notes?: string | null
}) {
  const parts = [args.disease?.trim(), args.notes?.trim()].filter(Boolean)
  return parts.length > 0 ? parts.join(" | ") : null
}

export function buildVaccinationPlanItemsFromTemplate<
  TItem extends {
    dayOfAge: number
    vaccineName: string
    disease?: string | null
    notes?: string | null
  },
>(items: TItem[]) {
  return items.map((item) => ({
    dayOfAge: item.dayOfAge,
    vaccineName: item.vaccineName,
    notes: buildVaccinationPlanItemNotesFromTemplate({
      disease: item.disease,
      notes: item.notes,
    }),
  }))
}
