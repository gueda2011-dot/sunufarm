/**
 * SunuFarm — Configuration Prisma 7
 *
 * Prisma 7 n'utilise plus url dans schema.prisma.
 * La connexion pour les commandes CLI (migrate, introspect) est définie ici.
 *
 * Documentation : https://pris.ly/d/config-datasource
 */

import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.SUNUFARM_DATABASE_URL!,
  },
})
