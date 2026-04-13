/**
 * SunuFarm — Configuration Prisma 7
 *
 * Prisma 7 n'utilise plus url dans schema.prisma.
 * La connexion pour les commandes CLI (migrate, introspect) est définie ici.
 *
 * Documentation : https://pris.ly/d/config-datasource
 */

import "dotenv/config"
import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // SUNUFARM_DIRECT_URL = connexion directe Supabase (port 5432, requis pour prisma migrate)
    // SUNUFARM_DATABASE_URL = pooler Supabase (port 6543, utilisé par le client runtime)
    // En local les deux pointent souvent vers la même URL directe.
    url: process.env.SUNUFARM_DIRECT_URL ?? process.env.SUNUFARM_DATABASE_URL!,
  },
})
