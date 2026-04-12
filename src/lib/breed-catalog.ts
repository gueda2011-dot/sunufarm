import type { PrismaClient } from "@/src/generated/prisma"

type PrismaReferenceCatalogClient = Pick<PrismaClient, "species" | "breed">

type SpeciesCatalogEntry = {
  name: string
  code: string
}

type BreedCatalogEntry = {
  name: string
  code: string
  speciesCode: string
}

export const SENEGAL_SPECIES_CATALOG: SpeciesCatalogEntry[] = [
  { name: "Poulet", code: "POULET" },
  { name: "Pondeuse", code: "PONDEUSE" },
]

export const SENEGAL_BREED_CATALOG: BreedCatalogEntry[] = [
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

export async function ensureSenegalBreedCatalog(
  prisma: PrismaReferenceCatalogClient,
) {
  for (const species of SENEGAL_SPECIES_CATALOG) {
    await prisma.species.upsert({
      where: { code: species.code },
      update: { name: species.name },
      create: species,
    })
  }

  const speciesByCode = new Map(
    (
      await prisma.species.findMany({
        where: {
          code: { in: SENEGAL_SPECIES_CATALOG.map((species) => species.code) },
        },
        select: { id: true, code: true },
      })
    ).map((species) => [species.code, species.id]),
  )

  for (const breed of SENEGAL_BREED_CATALOG) {
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
}
