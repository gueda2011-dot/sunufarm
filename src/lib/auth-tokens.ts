import { randomBytes, createHash } from "node:crypto"
import bcrypt from "bcryptjs"
import prisma from "@/src/lib/prisma"

const EMAIL_VERIFICATION_PREFIX = "verify"
const PASSWORD_RESET_PREFIX = "reset"

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000

export interface TokenValidationResult {
  valid: boolean
  email?: string
  reason?: "invalid" | "expired"
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function buildIdentifier(prefix: string, email: string) {
  return `${prefix}:${normalizeEmail(email)}`
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function extractEmail(identifier: string, prefix: string) {
  if (!identifier.startsWith(`${prefix}:`)) return null
  return identifier.slice(prefix.length + 1)
}

async function issueToken(prefix: string, email: string, ttlMs: number) {
  const normalizedEmail = normalizeEmail(email)
  const rawToken = randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + ttlMs)

  await prisma.verificationToken.deleteMany({
    where: { identifier: buildIdentifier(prefix, normalizedEmail) },
  })

  await prisma.verificationToken.create({
    data: {
      identifier: buildIdentifier(prefix, normalizedEmail),
      token: hashToken(rawToken),
      expires,
    },
  })

  return {
    token: rawToken,
    email: normalizedEmail,
    expires,
  }
}

async function validateToken(prefix: string, rawToken: string): Promise<TokenValidationResult> {
  const stored = await prisma.verificationToken.findUnique({
    where: { token: hashToken(rawToken) },
  })

  if (!stored) {
    return { valid: false, reason: "invalid" }
  }

  const email = extractEmail(stored.identifier, prefix)
  if (!email) {
    return { valid: false, reason: "invalid" }
  }

  if (stored.expires <= new Date()) {
    await prisma.verificationToken.delete({ where: { token: stored.token } })
    return { valid: false, reason: "expired" }
  }

  return { valid: true, email }
}

export async function issueEmailVerificationToken(email: string) {
  return issueToken(EMAIL_VERIFICATION_PREFIX, email, EMAIL_VERIFICATION_TTL_MS)
}

export async function issuePasswordResetToken(email: string) {
  return issueToken(PASSWORD_RESET_PREFIX, email, PASSWORD_RESET_TTL_MS)
}

export async function validateEmailVerificationToken(rawToken: string) {
  return validateToken(EMAIL_VERIFICATION_PREFIX, rawToken)
}

export async function validatePasswordResetToken(rawToken: string) {
  return validateToken(PASSWORD_RESET_PREFIX, rawToken)
}

export async function consumeEmailVerificationToken(rawToken: string) {
  const hashedToken = hashToken(rawToken)
  const validation = await validateEmailVerificationToken(rawToken)

  if (!validation.valid || !validation.email) {
    return validation
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: {
        email: validation.email,
        deletedAt: null,
      },
      data: {
        emailVerified: new Date(),
      },
    })

    await tx.verificationToken.delete({ where: { token: hashedToken } })
  })

  return { valid: true as const, email: validation.email }
}

export async function consumePasswordResetToken(
  rawToken: string,
  nextPassword: string,
) {
  const hashedToken = hashToken(rawToken)
  const validation = await validatePasswordResetToken(rawToken)

  if (!validation.valid || !validation.email) {
    return validation
  }

  const email = validation.email

  const passwordHash = await bcrypt.hash(nextPassword, 12)

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: {
        email,
        deletedAt: null,
      },
      data: {
        passwordHash,
        emailVerified: new Date(),
      },
    })

    await tx.verificationToken.delete({ where: { token: hashedToken } })
    await tx.verificationToken.deleteMany({
      where: {
        identifier: buildIdentifier(PASSWORD_RESET_PREFIX, email),
      },
    })
  })

  return { valid: true as const, email }
}
