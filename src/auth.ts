/**
 * SunuFarm — Configuration NextAuth v5
 *
 * Stratégie MVP : Credentials (email + mot de passe) + sessions JWT.
 * Pas de Prisma Adapter pour l'instant — les tables Account/Session/VerificationToken
 * du schéma sont réservées pour une future extension OAuth (Google, etc.).
 *
 * Dépendance requise :
 *   npm install next-auth@beta
 *
 * Route à créer séparément :
 *   src/app/api/auth/[...nextauth]/route.ts
 *   → export { GET, POST } from "@/src/auth"
 *
 * Extension future :
 *   Pour ajouter un provider OAuth, importer @auth/prisma-adapter et passer
 *   adapter: PrismaAdapter(prisma) dans la config — les modèles DB sont prêts.
 */

import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth"
import type { JWT } from "next-auth/jwt"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"
import prisma from "@/src/lib/prisma"
import { getServerEnv } from "@/src/lib/env"
import { logger } from "@/src/lib/logger"
import { normalizePhoneNumber } from "@/src/lib/validators"

// ---------------------------------------------------------------------------
// TypeScript — Extension du type Session NextAuth
//
// Ajoute session.user.id (CUID Prisma) absent du type par défaut.
// Compatible avec AppSession défini dans src/lib/auth.ts.
// ---------------------------------------------------------------------------

declare module "next-auth" {
  interface Session {
    user: {
      id: string
    } & DefaultSession["user"]
    actor: {
      id: string
      email: string
      name: string | null
    }
    impersonation: {
      active: boolean
      adminId: string
      adminEmail: string
      adminName: string | null
      targetUserId: string
      targetUserEmail: string
      targetUserName: string | null
    } | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    actorId?: string
    actorEmail?: string
    actorName?: string | null
    impersonatedUserId?: string | null
    impersonatedUserEmail?: string | null
    impersonatedUserName?: string | null
  }
}

// ---------------------------------------------------------------------------
// Validation des credentials à la connexion
// ---------------------------------------------------------------------------

const credentialsSchema = z.object({
  identifier: z.string().trim().min(3, "Email ou numero requis"),
  password: z.string().min(1, "Mot de passe requis"),
})

class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified"
}

function clearImpersonation(token: JWT) {
  token.impersonatedUserId = null
  token.impersonatedUserEmail = null
  token.impersonatedUserName = null
}

// ---------------------------------------------------------------------------
// Configuration NextAuth v5
// ---------------------------------------------------------------------------

export const { auth, signIn, signOut, handlers, unstable_update } = NextAuth({
  secret: getServerEnv().AUTH_SECRET,
  trustHost: true,
  // -------------------------------------------------------------------------
  // Provider Credentials
  // -------------------------------------------------------------------------
  providers: [
    Credentials({
      /**
       * authorize() est appelé par NextAuth lors d'un signIn("credentials", ...).
       * Retourne un objet User si les credentials sont valides, null sinon.
       * NextAuth affiche une erreur générique "CredentialsSignin" en cas de null.
       */
      async authorize(credentials) {
        try {
          // 1. Valider le format des credentials
          const parsed = credentialsSchema.safeParse(credentials)
          if (!parsed.success) return null

          // 2. Chercher l'utilisateur actif (non soft-deleted)
          const identifier = parsed.data.identifier.trim()
          const normalizedEmail = identifier.toLowerCase()
          const normalizedPhone = normalizePhoneNumber(identifier)

          const user = await prisma.user.findFirst({
            where: {
              deletedAt: null,            // exclut les comptes supprimés
              OR: [
                { email: normalizedEmail },
                { phone: normalizedPhone || "__never__" },
              ],
            },
            select: {
              id:           true,
              email:        true,
              phone:        true,
              name:         true,
              emailVerified: true,
              passwordHash: true,
            },
          })

          // 3. Vérifier l'existence et la présence d'un mot de passe
          //    (un compte sans passwordHash = compte OAuth-only, pas autorisé ici)
          if (!user || !user.passwordHash) return null

          // 4. Vérifier le mot de passe
          const passwordValid = await bcrypt.compare(
            parsed.data.password,
            user.passwordHash,
          )
          if (!passwordValid) return null

          if (!user.emailVerified) {
            throw new EmailNotVerifiedError()
          }

          // 5. Retourner uniquement ce qui doit aller dans le token
          return {
            id:    user.id,
            email: user.email,
            name:  user.name,
          }
        } catch (err) {
          // Erreur DB ou réseau — logger pour debug, retourner null proprement
          if (err instanceof EmailNotVerifiedError) {
            throw err
          }
          logger.error("auth.authorize_failed", { error: err })
          return null
        }
      },
    }),
  ],

  // -------------------------------------------------------------------------
  // Callbacks JWT et Session
  //
  // jwt()     : appelé à chaque création / rotation de token
  //             → stocke user.id dans token.sub au premier login
  // session() : appelé à chaque lecture de session (getSession / auth())
  //             → expose token.sub dans session.user.id
  // -------------------------------------------------------------------------
  callbacks: {
    jwt({ token, user, trigger, session }) {
      // user est présent uniquement lors du premier appel (sign-in)
      if (user?.id) {
        token.sub = user.id
        token.email = user.email
        token.name = user.name
        token.actorId = user.id
        token.actorEmail = user.email ?? ""
        token.actorName = user.name ?? null
        clearImpersonation(token)
      }

      if (trigger === "update") {
        const nextSession = session as
          | {
              user?: { id?: string; email?: string | null; name?: string | null }
              actor?: { id?: string; email?: string; name?: string | null }
              impersonation?: {
                active?: boolean
                targetUserId?: string
                targetUserEmail?: string
                targetUserName?: string | null
              } | null
            }
          | undefined

        if (nextSession?.actor?.id) {
          token.actorId = nextSession.actor.id
          token.actorEmail = nextSession.actor.email ?? token.actorEmail ?? ""
          token.actorName = nextSession.actor.name ?? null
        }

        if (nextSession?.impersonation === null) {
          clearImpersonation(token)
        } else if (nextSession?.impersonation?.active) {
          token.impersonatedUserId =
            nextSession.user?.id ??
            nextSession.impersonation.targetUserId ??
            token.impersonatedUserId
          token.impersonatedUserEmail =
            nextSession.user?.email ??
            nextSession.impersonation.targetUserEmail ??
            token.impersonatedUserEmail
          token.impersonatedUserName =
            nextSession.user?.name ??
            nextSession.impersonation.targetUserName ??
            token.impersonatedUserName
        }
      }

      return token
    },

    session({ session, token }) {
      const effectiveUserId = token.impersonatedUserId ?? token.sub
      const effectiveUserEmail = token.impersonatedUserEmail ?? token.email
      const effectiveUserName = token.impersonatedUserName ?? token.name

      if (effectiveUserId) {
        session.user.id = effectiveUserId
      }
      if (typeof effectiveUserEmail === "string") {
        session.user.email = effectiveUserEmail
      }
      if (typeof effectiveUserName === "string" || effectiveUserName === null) {
        session.user.name = effectiveUserName
      }

      session.actor = {
        id: token.actorId ?? token.sub ?? "",
        email: token.actorEmail ?? (typeof token.email === "string" ? token.email : ""),
        name: typeof token.actorName === "string" || token.actorName === null
          ? token.actorName
          : (typeof token.name === "string" ? token.name : null),
      }

      session.impersonation = token.impersonatedUserId
        ? {
            active: true,
            adminId: session.actor.id,
            adminEmail: session.actor.email,
            adminName: session.actor.name,
            targetUserId: token.impersonatedUserId,
            targetUserEmail:
              token.impersonatedUserEmail ??
              (typeof session.user.email === "string" ? session.user.email : ""),
            targetUserName:
              typeof token.impersonatedUserName === "string" || token.impersonatedUserName === null
                ? token.impersonatedUserName
                : session.user.name ?? null,
          }
        : null

      return session
    },
  },

  // -------------------------------------------------------------------------
  // Pages custom
  // -------------------------------------------------------------------------
  pages: {
    signIn: "/login",
    error:  "/login",   // les erreurs d'auth redirigent vers /login?error=...
  },

  // -------------------------------------------------------------------------
  // Stratégie de session
  //
  // "jwt" : sessions stockées dans un cookie signé côté client.
  //   Avantages   : aucune table Session en base, stateless, scalable.
  //   Inconvénients : révocation immédiate impossible (token valide jusqu'à expiry).
  //
  //   Durée réduite à 8h (compromis sécurité / UX terrain) :
  //     - Un token volé reste exploitable au maximum une journée de travail
  //     - Les agents terrain se reconnectent en début de journée
  //     - La PWA offline conserve le contexte localement sans dépendre du JWT
  //   En V2 : passer à "database" + PrismaAdapter pour la révocation à distance.
  // -------------------------------------------------------------------------
  session: {
    strategy: "jwt",
    maxAge:   8 * 60 * 60, // 8 heures (réduit de 30j pour limiter la fenêtre d'exploitation)
  },
})
