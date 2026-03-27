import type { BatchType } from "@/src/generated/prisma/client"

export interface VaccinationSuggestionStep {
  key: string
  vaccineName: string
  windowStartDay: number
  windowEndDay: number
  route: string
  target: "chair" | "pondeuse" | "all"
  note: string
}

export interface VaccinationSuggestionStatus extends VaccinationSuggestionStep {
  status: "done" | "upcoming" | "due" | "overdue"
  matchedRecordName: string | null
}

const SUGGESTION_STEPS: VaccinationSuggestionStep[] = [
  {
    key: "marek",
    vaccineName: "Marek",
    windowStartDay: 0,
    windowEndDay: 2,
    route: "Injection / couvoir",
    target: "all",
    note: "Souvent realise au couvoir a J0-J1 si le poussin arrive vaccine.",
  },
  {
    key: "newcastle_hb1",
    vaccineName: "Newcastle HB1",
    windowStartDay: 7,
    windowEndDay: 14,
    route: "Oculaire, nasale ou eau de boisson",
    target: "all",
    note: "Protection de base contre Newcastle en debut d'elevage.",
  },
  {
    key: "gumboro_1",
    vaccineName: "Gumboro - 1ere dose",
    windowStartDay: 7,
    windowEndDay: 14,
    route: "Eau de boisson ou oculaire",
    target: "all",
    note: "A ajuster selon la pression sanitaire et les anticorps maternels.",
  },
  {
    key: "gumboro_2",
    vaccineName: "Gumboro - rappel",
    windowStartDay: 16,
    windowEndDay: 21,
    route: "Eau de boisson ou oculaire",
    target: "all",
    note: "Souvent recommande comme rappel en elevage commercial.",
  },
  {
    key: "newcastle_lasota",
    vaccineName: "Newcastle Lasota",
    windowStartDay: 18,
    windowEndDay: 28,
    route: "Eau de boisson, oculaire ou spray",
    target: "all",
    note: "Rappel classique pour renforcer la protection Newcastle.",
  },
  {
    key: "variole_aviaire",
    vaccineName: "Variole aviaire",
    windowStartDay: 49,
    windowEndDay: 84,
    route: "Wing stab / injection",
    target: "pondeuse",
    note: "Plus pertinente pour les lots de longue duree comme les pondeuses.",
  },
  {
    key: "newcastle_pre_ponte",
    vaccineName: "Newcastle pre-ponte",
    windowStartDay: 105,
    windowEndDay: 126,
    route: "Selon protocole veterinaire",
    target: "pondeuse",
    note: "Avant l'entree en ponte, a confirmer avec le veterinaire et le couvoir.",
  },
]

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function matchesStep(vaccineName: string, step: VaccinationSuggestionStep): boolean {
  const normalizedVaccine = normalizeText(vaccineName)
  const normalizedStep = normalizeText(step.vaccineName)

  if (normalizedVaccine.includes(normalizedStep)) return true

  if (step.key.startsWith("newcastle") && normalizedVaccine.includes("newcastle")) return true
  if (step.key.startsWith("gumboro") && normalizedVaccine.includes("gumboro")) return true
  if (step.key === "variole_aviaire" && normalizedVaccine.includes("variole")) return true
  if (step.key === "marek" && normalizedVaccine.includes("marek")) return true

  return false
}

export function getVaccinationSuggestions(params: {
  batchType: BatchType
  ageDay: number
  recordedVaccines: string[]
}): VaccinationSuggestionStatus[] {
  const target = params.batchType === "PONDEUSE" ? "pondeuse" : "chair"

  return SUGGESTION_STEPS
    .filter((step) => step.target === "all" || step.target === target)
    .map((step) => {
      const matchedRecordName = params.recordedVaccines.find((recordName) => matchesStep(recordName, step)) ?? null

      if (matchedRecordName) {
        return {
          ...step,
          matchedRecordName,
          status: "done" as const,
        }
      }

      if (params.ageDay < step.windowStartDay) {
        return {
          ...step,
          matchedRecordName: null,
          status: "upcoming" as const,
        }
      }

      if (params.ageDay <= step.windowEndDay) {
        return {
          ...step,
          matchedRecordName: null,
          status: "due" as const,
        }
      }

      return {
        ...step,
        matchedRecordName: null,
        status: "overdue" as const,
      }
    })
}
