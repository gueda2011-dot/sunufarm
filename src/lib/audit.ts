/**
 * SunuFarm — Helper de création des logs d'audit
 *
 * Règle fondamentale : une erreur d'audit ne doit JAMAIS faire échouer
 * une Server Action. createAuditLog() est fire-and-forget safe — elle catch
 * toutes les erreurs et les logue sans les propager.
 *
 * Utilisation dans une Server Action :
 *
 *   await createAuditLog({
 *     userId:         session.user.id,
 *     organizationId: parsed.data.organizationId,
 *     action:         AuditAction.CREATE,
 *     resourceType:   "BATCH",
 *     resourceId:     batch.id,
 *     after:          batch,
 *   })
 *
 * Convention resourceType : UPPER_SNAKE_CASE, correspondant au nom du modèle Prisma.
 *   "BATCH" | "FARM" | "BUILDING" | "DAILY_RECORD" | "SALE" | "EXPENSE" | ...
 *
 * Convention before / after :
 *   CREATE → after uniquement (pas de before)
 *   UPDATE → before et after (snapshot avant et après)
 *   DELETE → before uniquement (snapshot avant suppression)
 *   LOGIN / LOGOUT / EXPORT → ni before ni after (ou after avec des métadonnées contextuelles)
 */

import prisma from "@/src/lib/prisma"
import { AuditAction } from "@/src/generated/prisma/client"

// Re-export pour que les Server Actions n'aient qu'un seul import à gérer
export { AuditAction }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateAuditLogInput {
  /** ID de l'utilisateur qui effectue l'action (session.user.id) */
  userId: string
  /** ID de l'organisation concernée — requis pour l'isolation multi-tenant */
  organizationId: string
  /** Type d'action auditée */
  action: AuditAction
  /**
   * Type de la ressource en UPPER_SNAKE_CASE.
   * Correspond au nom du modèle Prisma : "BATCH", "FARM", "SALE", "EXPENSE"...
   */
  resourceType: string
  /** ID (CUID) de la ressource concernée */
  resourceId: string
  /**
   * Snapshot de l'état avant modification.
   * Requis pour UPDATE et DELETE, absent pour CREATE.
   * Passer l'objet Prisma directement — il sera sérialisé tel quel.
   */
  before?: unknown
  /**
   * Snapshot de l'état après modification.
   * Requis pour CREATE et UPDATE, absent pour DELETE.
   */
  after?: unknown
  /** Adresse IP du client — optionnelle, à extraire via headers() si nécessaire */
  ipAddress?: string
  /** User-Agent du navigateur — optionnel */
  userAgent?: string
}

// ---------------------------------------------------------------------------
// Helper principal
// ---------------------------------------------------------------------------

/**
 * Crée un enregistrement AuditLog.
 *
 * Ne lance jamais d'exception.
 * En cas d'échec Prisma, l'erreur est loguée sur stderr mais ne remonte pas.
 * Cela garantit qu'un problème d'audit ne fait pas échouer l'action métier.
 *
 * TODO (V2) : remplacer console.error par un logger structuré (pino, winston).
 */
export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId:         input.userId,
        organizationId: input.organizationId,
        action:         input.action,
        resourceType:   input.resourceType,
        resourceId:     input.resourceId,
        before:         input.before  ?? undefined,
        after:          input.after   ?? undefined,
        ipAddress:      input.ipAddress,
        userAgent:      input.userAgent,
      },
    })
  } catch (error) {
    // L'audit est secondaire — on logue mais on ne bloque jamais l'action métier
    console.error("[AuditLog] Échec de création du log d'audit", {
      action:       input.action,
      resourceType: input.resourceType,
      resourceId:   input.resourceId,
      userId:       input.userId,
      error,
    })
  }
}
