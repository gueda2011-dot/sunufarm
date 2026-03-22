import path from "path"
import { defineConfig } from "prisma/config"
import * as dotenv from "dotenv"

// Prisma CLI ne charge pas .env.local automatiquement (comportement Next.js).
// On le charge explicitement pour que SUNUFARM_DATABASE_URL soit disponible.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })

export default defineConfig({
  earlyAccess: true,
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.SUNUFARM_DATABASE_URL!,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
})
