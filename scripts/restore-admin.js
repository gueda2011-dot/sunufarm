/**
 * Restore superadmin account without touching existing data.
 * Run with: node scripts/restore-admin.js
 */
const { Client } = require("pg")
const bcrypt = require("bcryptjs")

const DATABASE_URL =
  process.env.SUNUFARM_DATABASE_URL ||
  "postgresql://postgres.yovwdkohboibglprulhh:Bosslgc2025%40@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"

async function main() {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  console.log("Connected to database.")

  const email = "admin@sunufarm.sn"
  const password = "Sunufarm2025!"
  const passwordHash = await bcrypt.hash(password, 10)
  const now = new Date().toISOString()

  // Upsert admin user
  const userRes = await client.query(
    `SELECT id FROM "User" WHERE email = $1`,
    [email],
  )

  let adminId
  if (userRes.rows.length > 0) {
    adminId = userRes.rows[0].id
    await client.query(
      `UPDATE "User"
       SET "passwordHash" = $1, "emailVerified" = $2, "deletedAt" = NULL, "updatedAt" = $2
       WHERE id = $3`,
      [passwordHash, now, adminId],
    )
    console.log("Admin user already existed — password reset and account restored.")
  } else {
    const { v4: uuidv4 } = require("crypto")
    const newId = require("crypto").randomUUID()
    await client.query(
      `INSERT INTO "User" (id, email, name, "passwordHash", "emailVerified", phone, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [newId, email, "SunuFarm Admin", passwordHash, now, "+221700000001", now],
    )
    adminId = newId
    console.log("Admin user created.")
  }

  // Find or create platform organisation
  const orgRes = await client.query(
    `SELECT id FROM "Organization" WHERE slug = 'sunufarm-platform'`,
  )

  let orgId
  if (orgRes.rows.length > 0) {
    orgId = orgRes.rows[0].id
    console.log("Platform organisation already exists.")
  } else {
    const newOrgId = require("crypto").randomUUID()
    await client.query(
      `INSERT INTO "Organization" (id, name, slug, currency, locale, timezone, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [newOrgId, "SunuFarm Platform", "sunufarm-platform", "XOF", "fr-SN", "Africa/Dakar", now],
    )
    orgId = newOrgId

    // Create subscription for platform org
    const nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 1)
    await client.query(
      `INSERT INTO "Subscription" (id, "organizationId", plan, status, "amountFcfa", "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt")
       VALUES ($1, $2, 'BUSINESS', 'ACTIVE', 25000, $3, $4, $3, $3)`,
      [require("crypto").randomUUID(), orgId, now, nextYear.toISOString()],
    )
    console.log("Platform organisation created.")
  }

  // Ensure SUPER_ADMIN membership
  const memberRes = await client.query(
    `SELECT id, role FROM "UserOrganization" WHERE "userId" = $1 AND "organizationId" = $2`,
    [adminId, orgId],
  )

  if (memberRes.rows.length === 0) {
    await client.query(
      `INSERT INTO "UserOrganization" (id, "userId", "organizationId", role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'SUPER_ADMIN', $4, $4)`,
      [require("crypto").randomUUID(), adminId, orgId, now],
    )
    console.log("SUPER_ADMIN membership created.")
  } else if (memberRes.rows[0].role !== "SUPER_ADMIN") {
    await client.query(
      `UPDATE "UserOrganization" SET role = 'SUPER_ADMIN', "updatedAt" = $1
       WHERE "userId" = $2 AND "organizationId" = $3`,
      [now, adminId, orgId],
    )
    console.log("SUPER_ADMIN role restored.")
  } else {
    console.log("SUPER_ADMIN membership already in place.")
  }

  await client.end()

  console.log("")
  console.log("Superadmin account restored successfully.")
  console.log("  Email   : admin@sunufarm.sn")
  console.log("  Password: Sunufarm2025!")
}

main().catch((err) => {
  console.error("Restore failed:", err)
  process.exit(1)
})
