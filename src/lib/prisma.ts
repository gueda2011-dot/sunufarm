/**
 * SunuFarm — Client Prisma singleton
 *
 * Prisma 7 avec adaptateur pg.
 * PrismaPg accepte directement un PoolConfig — pas besoin d'importer Pool de pg,
 * ce qui évite le conflit de types entre @types/pg global et celui bundlé par
 * @prisma/adapter-pg.
 *
 * En développement, on réutilise l'instance globale pour éviter les connexions
 * multiples causées par le hot-reload de Next.js.
 */

import { PrismaClient } from "@/src/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"

const prismaClientSingleton = () => {
  const adapter = new PrismaPg({
    connectionString: process.env.SUNUFARM_DATABASE_URL,
  })
  return new PrismaClient({ adapter })
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma
}

export default prisma
