/**
 * SunuFarm — Schémas Zod réutilisables
 *
 * Briques de base sans logique métier spécifique à un module.
 * À importer dans tous les validators domaine (batch, farm, sale, etc.).
 *
 * Stratégie IDs : cuid() — tous les modèles Prisma utilisent @default(cuid()).
 * Montants FCFA : entiers non négatifs (jamais Float, jamais négatifs).
 */

import { z } from "zod"

// Re-export pour que les consumers n'aient qu'un seul import à gérer
export { z }

// ---------------------------------------------------------------------------
// Identifiants (CUID v1 — stratégie Prisma uniforme)
// ---------------------------------------------------------------------------

/** ID requis — correspond à un @id @default(cuid()) non nullable */
export const requiredIdSchema = z.string().cuid()

/** ID optionnel — correspond à une relation nullable (String?) */
export const optionalIdSchema = z.string().cuid().optional()

// ---------------------------------------------------------------------------
// Montants financiers
// ---------------------------------------------------------------------------

/**
 * Montant FCFA : entier non négatif.
 * Règle absolue du projet : pas de centimes, pas de Float, pas de négatif.
 */
export const amountFcfaSchema = z.number().int().nonnegative()

// ---------------------------------------------------------------------------
// Quantités numériques
// ---------------------------------------------------------------------------

/** Entier strictement positif (ex : effectif initial, nombre de sujets vendus) */
export const positiveIntSchema = z.number().int().positive()

/** Entier non négatif (ex : mortalité du jour — peut être 0) */
export const nonNegativeIntSchema = z.number().int().nonnegative()

/** Nombre décimal strictement positif (ex : aliment distribué en kg) */
export const positiveNumberSchema = z.number().positive()

/** Nombre décimal non négatif (ex : eau consommée — peut être 0) */
export const nonNegativeNumberSchema = z.number().nonnegative()

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Date requise avec coercition string → Date.
 * Coerce nécessaire pour les inputs HTML qui envoient des strings ISO.
 */
export const dateSchema = z.coerce.date()

/** Date optionnelle avec coercition */
export const optionalDateSchema = z.coerce.date().optional()

// ---------------------------------------------------------------------------
// Téléphone
// ---------------------------------------------------------------------------

/**
 * Numéro de téléphone — validation souple pour le MVP terrain.
 *
 * Accepte les formats courants au Sénégal et en Afrique de l'Ouest :
 *   +221 77 123 45 67 | 77 123 45 67 | +22177123456 | 0033…
 *
 * Ne bloque pas la saisie : si le format est incertain, on laisse passer.
 * À affiner en V2 avec une lib dédiée (ex : libphonenumber-js).
 */
export const phoneSchema = z
  .string()
  .regex(/^[\+\d][\d\s\-\.]{5,18}$/, "Numéro de téléphone invalide")
  .optional()

export function normalizePhoneNumber(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return ""

  let normalized = trimmed.replace(/[^\d+]/g, "")

  if (normalized.startsWith("00")) {
    normalized = `+${normalized.slice(2)}`
  }

  const digitsOnly = normalized.replace(/\D/g, "")

  if (normalized.startsWith("+")) {
    return `+${digitsOnly}`
  }

  if (digitsOnly.length === 9) {
    return `+221${digitsOnly}`
  }

  if (digitsOnly.length === 12 && digitsOnly.startsWith("221")) {
    return `+${digitsOnly}`
  }

  return digitsOnly
}

// ---------------------------------------------------------------------------
// Pagination (cursor-based)
// ---------------------------------------------------------------------------

/**
 * Schéma de pagination cursor-based.
 * cursor : CUID du dernier item reçu (absent pour la première page).
 * limit  : nombre d'items par page (1–100, défaut 20).
 */
export const paginationSchema = z.object({
  cursor: optionalIdSchema,
  limit:  z.number().int().min(1).max(100).default(20),
})

export type PaginationInput = z.infer<typeof paginationSchema>

// ---------------------------------------------------------------------------
// Helper : ajouter organizationId à n'importe quel schéma objet
// ---------------------------------------------------------------------------

/**
 * Fusionne un schéma Zod objet avec organizationId requis.
 * À utiliser dans chaque schéma de création/mise à jour liée à une organisation.
 *
 * @example
 *   const createFarmSchema = withOrganizationId(z.object({ name: z.string() }))
 */
export function withOrganizationId<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
) {
  return schema.extend({
    organizationId: requiredIdSchema,
  })
}
