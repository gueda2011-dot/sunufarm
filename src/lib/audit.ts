/**
 * SunuFarm - Helper de creation des logs d'audit
 *
 * Regle fondamentale : une erreur d'audit ne doit jamais faire echouer
 * une Server Action. createAuditLog() reste safe et ne propage pas
 * les erreurs Prisma.
 */

import prisma from "@/src/lib/prisma"
import { AuditAction } from "@/src/generated/prisma/client"

// Re-export pour que les Server Actions n'aient qu'un seul import a gerer
export { AuditAction }

export interface CreateAuditLogInput {
  /** ID de l'utilisateur qui effectue l'action */
  userId: string
  /** ID de l'organisation concernee */
  organizationId: string
  /** ID de l'acteur reel - optionnel, fallback sur userId */
  actorUserId?: string
  /** ID de l'utilisateur effectif - optionnel, fallback sur userId */
  effectiveUserId?: string
  /** ID de la session d'impersonation - optionnel */
  impersonationSessionId?: string | null
  /** Type d'action auditee */
  action: AuditAction
  /** Type de la ressource en UPPER_SNAKE_CASE */
  resourceType: string
  /** ID de la ressource concernee */
  resourceId: string
  /** Snapshot de l'etat avant modification */
  before?: unknown
  /** Snapshot de l'etat apres modification */
  after?: unknown
  /** Adresse IP du client - optionnelle */
  ipAddress?: string
  /** User-Agent du navigateur - optionnel */
  userAgent?: string
}

/**
 * Cree un enregistrement AuditLog.
 *
 * Ne lance jamais d'exception.
 * En cas d'echec Prisma, l'erreur est loguee sur stderr mais ne remonte pas.
 */
export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? input.userId,
        effectiveUserId: input.effectiveUserId ?? input.userId,
        impersonationSessionId: input.impersonationSessionId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        before: input.before ?? undefined,
        after: input.after ?? undefined,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    })
  } catch (error) {
    // L'audit est secondaire : on logue mais on ne bloque jamais l'action metier.
    console.error("[AuditLog] Echec de creation du log d'audit", {
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      userId: input.userId,
      actorUserId: input.actorUserId ?? input.userId,
      effectiveUserId: input.effectiveUserId ?? input.userId,
      impersonationSessionId: input.impersonationSessionId ?? null,
      error,
    })
  }
}
