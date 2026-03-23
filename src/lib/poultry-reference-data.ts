import prisma from "@/src/lib/prisma"
import {
  PoultryProductionType,
  PoultrySpecies,
  VaccinationPlanTemplateProductionType,
} from "@/src/generated/prisma/client"
import { isMissingSchemaFeatureError } from "@/src/lib/prisma-schema-guard"

const DEFAULT_POULTRY_SPECIES = [
  { name: "Poulet", code: "POULET" },
  { name: "Pintade", code: "PINTADE" },
] as const

const DEFAULT_POULTRY_STRAINS = [
  {
    name: "Cobb 500",
    productionType: PoultryProductionType.BROILER,
    species: PoultrySpecies.CHICKEN,
    notes: null,
  },
  {
    name: "Ross 308",
    productionType: PoultryProductionType.BROILER,
    species: PoultrySpecies.CHICKEN,
    notes: null,
  },
  {
    name: "Hubbard",
    productionType: PoultryProductionType.BROILER,
    species: PoultrySpecies.CHICKEN,
    notes: null,
  },
  {
    name: "Sasso",
    productionType: PoultryProductionType.BROILER,
    species: PoultrySpecies.CHICKEN,
    notes: "Souche rustique adaptee aux elevages semi-intensifs.",
  },
  {
    name: "ISA Brown",
    productionType: PoultryProductionType.LAYER,
    species: PoultrySpecies.CHICKEN,
    notes: null,
  },
  {
    name: "Lohmann Brown",
    productionType: PoultryProductionType.LAYER,
    species: PoultrySpecies.CHICKEN,
    notes: null,
  },
  {
    name: "Hy-Line Brown",
    productionType: PoultryProductionType.LAYER,
    species: PoultrySpecies.CHICKEN,
    notes: null,
  },
  {
    name: "Poule locale senegalaise",
    productionType: PoultryProductionType.LOCAL,
    species: PoultrySpecies.CHICKEN,
    notes: null,
  },
  {
    name: "Croisee locale amelioree",
    productionType: PoultryProductionType.DUAL,
    species: PoultrySpecies.CHICKEN,
    notes: null,
  },
  {
    name: "Pintade locale",
    productionType: PoultryProductionType.LOCAL,
    species: PoultrySpecies.GUINEA_FOWL,
    notes: null,
  },
] as const

const DEFAULT_VACCINATION_PLAN_TEMPLATES = [
  {
    name: "Chair standard Senegal",
    productionType: VaccinationPlanTemplateProductionType.BROILER,
    items: [
      { dayOfAge: 1, vaccineName: "Marek", disease: "Maladie de Marek", notes: null },
      {
        dayOfAge: 6,
        vaccineName: "Newcastle + Bronchite infectieuse",
        disease: "Newcastle / Bronchite infectieuse",
        notes: "Fenetre J5-J7",
      },
      {
        dayOfAge: 12,
        vaccineName: "Gumboro",
        disease: "Gumboro",
        notes: "Fenetre J10-J14",
      },
      {
        dayOfAge: 20,
        vaccineName: "Newcastle rappel",
        disease: "Newcastle",
        notes: "Fenetre J18-J21",
      },
      {
        dayOfAge: 21,
        vaccineName: "Gumboro rappel",
        disease: "Gumboro",
        notes: "Fenetre J18-J24",
      },
    ],
  },
  {
    name: "Pondeuse standard Senegal",
    productionType: VaccinationPlanTemplateProductionType.LAYER,
    items: [
      { dayOfAge: 1, vaccineName: "Marek", disease: "Maladie de Marek", notes: null },
      {
        dayOfAge: 6,
        vaccineName: "Newcastle + Bronchite infectieuse",
        disease: "Newcastle / Bronchite infectieuse",
        notes: "Fenetre J5-J7",
      },
      {
        dayOfAge: 12,
        vaccineName: "Gumboro",
        disease: "Gumboro",
        notes: "Fenetre J10-J14",
      },
      {
        dayOfAge: 24,
        vaccineName: "Rappel ND / Gumboro",
        disease: "Newcastle / Gumboro",
        notes: "Fenetre J21-J28",
      },
      {
        dayOfAge: 49,
        vaccineName: "Variole",
        disease: "Variole aviaire",
        notes: "Fenetre S6-S8",
      },
      {
        dayOfAge: 63,
        vaccineName: "ND + IB rappel",
        disease: "Newcastle / Bronchite infectieuse",
        notes: "Fenetre S8-S10",
      },
      {
        dayOfAge: 77,
        vaccineName: "Encephalomyelite",
        disease: "Encephalomyelite aviaire",
        notes: "Fenetre S10-S12",
      },
      {
        dayOfAge: 112,
        vaccineName: "Vaccins pre-ponte",
        disease: "Preparation pre-ponte",
        notes: "Fenetre S14-S18",
      },
    ],
  },
] as const

let referenceBootstrapPromise: Promise<void> | null = null

async function ensureSpeciesReferenceData() {
  for (const species of DEFAULT_POULTRY_SPECIES) {
    await prisma.species.upsert({
      where: { code: species.code },
      update: { name: species.name },
      create: species,
    })
  }
}

async function ensureStrainsReferenceData() {
  for (const strain of DEFAULT_POULTRY_STRAINS) {
    await prisma.poultryStrain.upsert({
      where: { name: strain.name },
      update: {
        productionType: strain.productionType,
        species: strain.species,
        notes: strain.notes,
        isActive: true,
      },
      create: {
        ...strain,
        isActive: true,
      },
    })
  }
}

async function ensureVaccinationTemplateReferenceData() {
  for (const template of DEFAULT_VACCINATION_PLAN_TEMPLATES) {
    const createdTemplate = await prisma.vaccinationPlanTemplate.upsert({
      where: { name: template.name },
      update: {
        productionType: template.productionType,
        isActive: true,
      },
      create: {
        name: template.name,
        productionType: template.productionType,
        isActive: true,
      },
      select: { id: true },
    })

    await prisma.vaccinationPlanTemplateItem.deleteMany({
      where: { planTemplateId: createdTemplate.id },
    })

    await prisma.vaccinationPlanTemplateItem.createMany({
      data: template.items.map((item) => ({
        planTemplateId: createdTemplate.id,
        dayOfAge: item.dayOfAge,
        vaccineName: item.vaccineName,
        disease: item.disease,
        notes: item.notes,
      })),
    })
  }
}

export async function ensurePoultryReferenceData() {
  if (!referenceBootstrapPromise) {
    referenceBootstrapPromise = (async () => {
      await ensureSpeciesReferenceData()

      try {
        await ensureStrainsReferenceData()
        await ensureVaccinationTemplateReferenceData()
      } catch (error) {
        if (
          isMissingSchemaFeatureError(error, [
            "PoultryStrain",
            "VaccinationPlanTemplate",
            "VaccinationPlanTemplateItem",
            "poultryStrainId",
          ])
        ) {
          return
        }

        throw error
      }
    })().finally(() => {
      referenceBootstrapPromise = null
    })
  }

  await referenceBootstrapPromise
}

