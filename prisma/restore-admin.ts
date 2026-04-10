/**
 * Restore script: recreates the superadmin account without touching existing data.
 * Run with: npx tsx prisma/restore-admin.ts
 */
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"

import {
  PrismaClient,
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
} from "../src/generated/prisma"

const adapter = new PrismaPg({
  connectionString: process.env.SUNUFARM_DATABASE_URL,
})

const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Restoring superadmin account...")

  const email = "admin@sunufarm.sn"
  const password = "Sunufarm2025!"
  const passwordHash = await bcrypt.hash(password, 10)

  // Upsert the admin user
  let adminUser = await prisma.user.findUnique({ where: { email } })

  if (adminUser) {
    adminUser = await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        emailVerified: new Date(),
        deletedAt: null,
      },
    })
    console.log("Admin user already existed — password reset and account restored.")
  } else {
    adminUser = await prisma.user.create({
      data: {
        email,
        name: "SunuFarm Admin",
        passwordHash,
        emailVerified: new Date(),
        phone: "+221700000001",
      },
    })
    console.log("Admin user created.")
  }

  // Find or create the platform organisation
  let platformOrg = await prisma.organization.findUnique({
    where: { slug: "sunufarm-platform" },
  })

  if (!platformOrg) {
    const today = new Date()
    const nextYear = new Date(today)
    nextYear.setFullYear(nextYear.getFullYear() + 1)

    platformOrg = await prisma.organization.create({
      data: {
        name: "SunuFarm Platform",
        slug: "sunufarm-platform",
        currency: "XOF",
        locale: "fr-SN",
        timezone: "Africa/Dakar",
      },
    })

    await prisma.subscription.create({
      data: {
        organizationId: platformOrg.id,
        plan: SubscriptionPlan.BUSINESS,
        status: SubscriptionStatus.ACTIVE,
        amountFcfa: 25_000,
        currentPeriodStart: today,
        currentPeriodEnd: nextYear,
      },
    })

    console.log("Platform organisation created.")
  } else {
    console.log("Platform organisation already exists.")
  }

  // Ensure the admin has SUPER_ADMIN membership
  const existing = await prisma.userOrganization.findFirst({
    where: {
      userId: adminUser.id,
      organizationId: platformOrg.id,
    },
  })

  if (!existing) {
    await prisma.userOrganization.create({
      data: {
        userId: adminUser.id,
        organizationId: platformOrg.id,
        role: UserRole.SUPER_ADMIN,
      },
    })
    console.log("SUPER_ADMIN membership created.")
  } else if (existing.role !== UserRole.SUPER_ADMIN) {
    await prisma.userOrganization.update({
      where: { id: existing.id },
      data: { role: UserRole.SUPER_ADMIN },
    })
    console.log("SUPER_ADMIN role restored.")
  } else {
    console.log("SUPER_ADMIN membership already in place.")
  }

  console.log("")
  console.log("Superadmin account restored successfully.")
  console.log("  Email   : admin@sunufarm.sn")
  console.log("  Password: Sunufarm2025!")
}

main()
  .catch((error) => {
    console.error("Restore failed:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
