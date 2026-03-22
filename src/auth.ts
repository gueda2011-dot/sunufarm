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

import NextAuth, { type DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"
import prisma from "@/src/lib/prisma"

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
  }
}

// ---------------------------------------------------------------------------
// Validation des credentials à la connexion
// ---------------------------------------------------------------------------

const credentialsSchema = z.object({
  email:    z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
})

// ---------------------------------------------------------------------------
// Configuration NextAuth v5
// ---------------------------------------------------------------------------

export const { auth, signIn, signOut, handlers } = NextAuth({
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
        // 1. Valider le format des credentials
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        // 2. Chercher l'utilisateur actif (non soft-deleted)
        const user = await prisma.user.findFirst({
          where: {
            email:     parsed.data.email,
            deletedAt: null,            // exclut les comptes supprimés
          },
          select: {
            id:           true,
            email:        true,
            name:         true,
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

        // 5. Retourner uniquement ce qui doit aller dans le token
        return {
          id:    user.id,
          email: user.email,
          name:  user.name,
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
    jwt({ token, user }) {
      // user est présent uniquement lors du premier appel (sign-in)
      if (user?.id) {
        token.sub = user.id
      }
      return token
    },

    session({ session, token }) {
      // token.sub est garanti non-null après le callback jwt ci-dessus
      if (token.sub) {
        session.user.id = token.sub
      }
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
  //   Pour le MVP terrain, ce compromis est acceptable.
  //   En V2 : passer à "database" + PrismaAdapter pour la révocation à distance.
  // -------------------------------------------------------------------------
  session: {
    strategy: "jwt",
    maxAge:   30 * 24 * 60 * 60, // 30 jours (adapté au contexte terrain)
  },
})
