import bcrypt from "bcryptjs"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  PrismaClient,
  PlatformRole,
  UserRole,
} from "../src/generated/prisma"

const connectionString = process.env.SUNUFARM_DATABASE_URL

if (!connectionString) {
  console.error("SUNUFARM_DATABASE_URL est requis.")
  process.exit(1)
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Variable requise manquante : ${name}`)
    process.exit(1)
  }
  return value
}

function parseUserRole(value: string | undefined): UserRole {
  if (!value) return UserRole.OWNER
  if (!(value in UserRole)) {
    console.error(
      `BOOTSTRAP_USER_ROLE invalide: ${value}. Valeurs: ${Object.keys(UserRole).join(", ")}`,
    )
    process.exit(1)
  }
  return UserRole[value as keyof typeof UserRole]
}

function parsePlatformRole(value: string | undefined): PlatformRole {
  if (!value) return PlatformRole.NONE
  if (!(value in PlatformRole)) {
    console.error(
      `BOOTSTRAP_PLATFORM_ROLE invalide: ${value}. Valeurs: ${Object.keys(PlatformRole).join(", ")}`,
    )
    process.exit(1)
  }
  return PlatformRole[value as keyof typeof PlatformRole]
}

async function resolveOrganizationId(orgSlug: string | undefined) {
  if (orgSlug) {
    const organization = await prisma.organization.findFirst({
      where: {
        slug: orgSlug,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    })

    if (!organization) {
      console.error(`Organisation introuvable pour le slug: ${orgSlug}`)
      process.exit(1)
    }

    return organization
  }

  const organizations = await prisma.organization.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
    },
    take: 2,
  })

  if (organizations.length === 1) {
    return organizations[0]
  }

  if (organizations.length > 1) {
    console.log(
      "Plusieurs organisations existent. Aucun rattachement tenant automatique sans BOOTSTRAP_ORG_SLUG.",
    )
    return null
  }

  console.log("Aucune organisation existante. Le compte sera cree sans membership tenant.")
  return null
}

async function main() {
  const email = readRequiredEnv("BOOTSTRAP_USER_EMAIL").toLowerCase()
  const password = readRequiredEnv("BOOTSTRAP_USER_PASSWORD")
  const name = process.env.BOOTSTRAP_USER_NAME?.trim() || null
  const organizationSlug = process.env.BOOTSTRAP_ORG_SLUG?.trim()
  const role = parseUserRole(process.env.BOOTSTRAP_USER_ROLE?.trim())
  const platformRole = parsePlatformRole(process.env.BOOTSTRAP_PLATFORM_ROLE?.trim())

  const organization = await resolveOrganizationId(organizationSlug)
  const passwordHash = await bcrypt.hash(password, 10)

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      platformRole,
      deletedAt: null,
    },
    create: {
      email,
      name,
      passwordHash,
      platformRole,
    },
    select: {
      id: true,
      email: true,
      name: true,
      platformRole: true,
    },
  })

  let membershipSummary: string | null = null

  if (organization) {
    const membership = await prisma.userOrganization.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organization.id,
        },
      },
      update: {
        role,
      },
      create: {
        userId: user.id,
        organizationId: organization.id,
        role,
        farmPermissions: [],
      },
      select: {
        role: true,
      },
    })

    membershipSummary =
      `${organization.name} (${organization.slug}) - role ${membership.role}`
  }

  console.log("Compte bootstrap synchronise avec succes.")
  console.log(`Email: ${user.email}`)
  console.log(`Nom: ${user.name ?? "-"}`)
  console.log(`Platform role: ${user.platformRole}`)
  console.log(`Membership: ${membershipSummary ?? "aucun"}`)
}

main()
  .catch((error) => {
    console.error("Echec du bootstrap utilisateur:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
