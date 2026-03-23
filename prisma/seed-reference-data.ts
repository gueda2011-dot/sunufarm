import {
  PrismaClient,
  PoultryProductionType,
  PoultrySpecies,
  VaccinationPlanTemplateProductionType,
} from "../src/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.SUNUFARM_DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function upsertStrains() {
  const strains = [
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
  ]

  for (const strain of strains) {
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

async function upsertSpecies() {
  const species = [
    { name: "Poulet", code: "POULET" },
    { name: "Pintade", code: "PINTADE" },
  ]

  for (const item of species) {
    await prisma.species.upsert({
      where: { code: item.code },
      update: { name: item.name },
      create: item,
    })
  }
}

async function upsertTemplate(args: {
  name: string
  productionType: VaccinationPlanTemplateProductionType
  items: Array<{
    dayOfAge: number
    vaccineName: string
    disease?: string | null
    notes?: string | null
  }>
}) {
  const template = await prisma.vaccinationPlanTemplate.upsert({
    where: { name: args.name },
    update: {
      productionType: args.productionType,
      isActive: true,
    },
    create: {
      name: args.name,
      productionType: args.productionType,
      isActive: true,
    },
    select: { id: true },
  })

  await prisma.vaccinationPlanTemplateItem.deleteMany({
    where: { planTemplateId: template.id },
  })

  await prisma.vaccinationPlanTemplateItem.createMany({
    data: args.items.map((item) => ({
      planTemplateId: template.id,
      dayOfAge: item.dayOfAge,
      vaccineName: item.vaccineName,
      disease: item.disease ?? null,
      notes: item.notes ?? null,
    })),
  })
}

async function main() {
  await upsertSpecies()
  await upsertStrains()

  await upsertTemplate({
    name: "Chair standard Senegal",
    productionType: VaccinationPlanTemplateProductionType.BROILER,
    items: [
      { dayOfAge: 1, vaccineName: "Marek", disease: "Maladie de Marek" },
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
  })

  await upsertTemplate({
    name: "Pondeuse standard Senegal",
    productionType: VaccinationPlanTemplateProductionType.LAYER,
    items: [
      { dayOfAge: 1, vaccineName: "Marek", disease: "Maladie de Marek" },
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
  })

  console.log("Reference data synced successfully.")
}

main()
  .catch((error) => {
    console.error("Failed to seed reference data:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
