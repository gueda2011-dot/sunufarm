import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/src/generated/prisma"

const connectionString = process.env.SUNUFARM_DATABASE_URL

if (!connectionString) {
  throw new Error("SUNUFARM_DATABASE_URL manquant")
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const SPECIES = [
  { name: "Poulet", code: "POULET" },
  { name: "Pondeuse", code: "PONDEUSE" },
]

const BREEDS = [
  { name: "Cobb 500", code: "COBB500", speciesCode: "POULET" },
  { name: "Hubbard", code: "HUBBARD", speciesCode: "POULET" },
  { name: "Ross 208", code: "ROSS208", speciesCode: "POULET" },
  { name: "Ross 308", code: "ROSS308", speciesCode: "POULET" },
  { name: "Vedette", code: "VEDETTE", speciesCode: "POULET" },
  { name: "ISA Brown", code: "ISA_BROWN", speciesCode: "PONDEUSE" },
  { name: "Lohmann Brown", code: "LOHMANN_BROWN", speciesCode: "PONDEUSE" },
  { name: "Lohmann Blanche", code: "LOHMANN_BLANCHE", speciesCode: "PONDEUSE" },
  { name: "Lohmann Rouge", code: "LOHMANN_ROUGE", speciesCode: "PONDEUSE" },
  { name: "Hy-Line Blanche", code: "HY_LINE_BLANCHE", speciesCode: "PONDEUSE" },
  { name: "Hy-Line Rouge", code: "HY_LINE_ROUGE", speciesCode: "PONDEUSE" },
  { name: "Harco", code: "HARCO", speciesCode: "PONDEUSE" },
  { name: "Gold Line", code: "GOLD_LINE", speciesCode: "PONDEUSE" },
  { name: "Shaver", code: "SHAVER", speciesCode: "PONDEUSE" },
  { name: "Star Cross", code: "STAR_CROSS", speciesCode: "PONDEUSE" },
]

async function main() {
  for (const species of SPECIES) {
    await prisma.species.upsert({
      where: { code: species.code },
      update: { name: species.name },
      create: species,
    })
  }

  const speciesByCode = new Map(
    (await prisma.species.findMany({
      where: { code: { in: SPECIES.map((species) => species.code) } },
      select: { id: true, code: true },
    })).map((species) => [species.code, species.id]),
  )

  for (const breed of BREEDS) {
    const speciesId = speciesByCode.get(breed.speciesCode)
    if (!speciesId) {
      throw new Error(`Espece introuvable pour ${breed.code}`)
    }

    await prisma.breed.upsert({
      where: { code: breed.code },
      update: {
        name: breed.name,
        speciesId,
      },
      create: {
        name: breed.name,
        code: breed.code,
        speciesId,
      },
    })
  }

  console.log(`Catalogue Senegal synchronise : ${BREEDS.length} souches`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
