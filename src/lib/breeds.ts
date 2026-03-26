import type { BatchType } from "@/src/generated/prisma/client"

export const DEFAULT_SPECIES_CODE_BY_BATCH_TYPE: Record<BatchType, string> = {
  CHAIR: "POULET",
  PONDEUSE: "PONDEUSE",
  REPRODUCTEUR: "POULET",
}

export const SENEGAL_BREED_CODES_BY_BATCH_TYPE: Record<BatchType, string[]> = {
  CHAIR: [
    "COBB500",
    "HUBBARD",
    "ROSS208",
    "ROSS308",
    "VEDETTE",
  ],
  PONDEUSE: [
    "LOHMANN_BLANCHE",
    "LOHMANN_ROUGE",
    "HY_LINE_BLANCHE",
    "HY_LINE_ROUGE",
    "HARCO",
    "ISA_BROWN",
    "GOLD_LINE",
    "SHAVER",
    "STAR_CROSS",
    "LOHMANN_BROWN",
  ],
  REPRODUCTEUR: [],
}

export const SENEGAL_BREED_HINTS: Record<BatchType, string> = {
  CHAIR:
    "Souches chair courantes au Senegal : Cobb 500, Hubbard, Ross et Vedette.",
  PONDEUSE:
    "Souches pondeuses courantes au Senegal : Lohmann, Hy-Line, Harco, ISA Brown, Gold Line, Shaver et Star Cross.",
  REPRODUCTEUR:
    "Choisissez une souche reproductrice adaptee a votre exploitation.",
}

export function getDefaultSpeciesCodeForBatchType(type: BatchType): string {
  return DEFAULT_SPECIES_CODE_BY_BATCH_TYPE[type]
}

export function isBreedSuggestedForBatchType(
  breedCode: string,
  type: BatchType,
): boolean {
  const allowedCodes = SENEGAL_BREED_CODES_BY_BATCH_TYPE[type]
  return allowedCodes.length === 0 || allowedCodes.includes(breedCode)
}
