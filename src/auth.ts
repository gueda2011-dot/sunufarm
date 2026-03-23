/**
 * SunuFarm - Configuration NextAuth v5
 *
 * Strategie MVP : Credentials (email + mot de passe) + sessions JWT.
 * Pas de Prisma Adapter pour l'instant.
 */

import NextAuth, { type DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"
import prisma from "@/src/lib/prisma"
import type { PlatformRole } from "@/src/generated/prisma/client"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      platformRole: PlatformRole
    } & DefaultSession["user"]
  }
}

const credentialsSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
})

export const { auth, signIn, signOut, handlers } = NextAuth({
  providers: [
    Credentials({
      async authorize(credentials) {
        try {
          const parsed = credentialsSchema.safeParse(credentials)
          if (!parsed.success) return null

          const user = await prisma.user.findFirst({
            where: {
              email: parsed.data.email,
              deletedAt: null,
            },
            select: {
              id: true,
              email: true,
              name: true,
              passwordHash: true,
              platformRole: true,
            },
          })

          if (!user || !user.passwordHash) return null

          const passwordValid = await bcrypt.compare(
            parsed.data.password,
            user.passwordHash,
          )
          if (!passwordValid) return null

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            platformRole: user.platformRole,
          }
        } catch (err) {
          console.error("[auth][authorize] Erreur inattendue:", err)
          return null
        }
      },
    }),
  ],

  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id
        ;(token as typeof token & { platformRole?: PlatformRole }).platformRole =
          (user as typeof user & { platformRole?: PlatformRole }).platformRole
      }
      return token
    },

    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub
      }
      session.user.platformRole =
        (
          token as typeof token & {
            platformRole?: PlatformRole
          }
        ).platformRole ?? "NONE"
      return session
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
})
