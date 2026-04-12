import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/src/generated/prisma"
import { ensureSenegalBreedCatalog, SENEGAL_BREED_CATALOG } from "@/src/lib/breed-catalog"

const connectionString = process.env.SUNUFARM_DATABASE_URL

if (!connectionString) {
  throw new Error("SUNUFARM_DATABASE_URL manquant")
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  await ensureSenegalBreedCatalog(prisma)

  console.log(`Catalogue Senegal synchronise : ${SENEGAL_BREED_CATALOG.length} souches`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
