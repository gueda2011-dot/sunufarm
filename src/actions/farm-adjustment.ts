/**
 * SunuFarm — Server Actions : gestion FarmAdjustmentProfile
 *
 * Contrôle les transitions d'état du profil d'ajustement ferme :
 *   OBSERVING → SUGGESTED (automatique via calcul)
 *   SUGGESTED → ACTIVE    (validation explicite utilisateur)
 *   ACTIVE    → OBSERVING (reset manuel)
 *
 * Règle fondamentale : l'ajustement ne s'applique QUE si status = ACTIVE.
 * La transition SUGGESTED → ACTIVE requiert une action explicite du manager/owner.
 *
 * Accès : OWNER et MANAGER uniquement.
 */

"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireOrganizationModuleContext,
  requireRole,
  type ActionResult,
} from "@/src/lib/auth"
import { UserRole } from "@/src/generated/prisma/client"
import { requiredIdSchema } from "@/src/lib/validators"
import { computeFarmObservedFactors } from "@/src/lib/farm-feed-adjustment"

const farmAdjustmentSchema = z.object({
  organizationId: requiredIdSchema,
  farmId: requiredIdSchema,
})

// ---------------------------------------------------------------------------
// Lire le profil d'ajustement d'une ferme
// ---------------------------------------------------------------------------

export interface FarmAdjustmentProfileData {
  id: string
  farmId: string
  status: "OBSERVING" | "SUGGESTED" | "ACTIVE"
  weightFactor: number | null
  feedFactor: number | null
  fcrFactor: number | null
  layingFactor: number | null
  basedOnBatchCount: number
  basedOnPeriodMonths: number | null
  calculatedAt: Date | null
  validatedAt: Date | null
  notes: string | null
}

export async function getFarmAdjustmentProfile(data: {
  organizationId: string
  farmId: string
}): Promise<ActionResult<FarmAdjustmentProfileData | null>> {
  try {
    const parsed = farmAdjustmentSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: "Données invalides" }

    const { organizationId, farmId } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "FARMS")
    if (!accessResult.success) return accessResult

    const farm = await prisma.farm.findFirst({
      where: { id: farmId, organizationId, deletedAt: null },
      select: {
        id: true,
        farmAdjustmentProfile: true,
      },
    })

    if (!farm) return { success: false, error: "Ferme introuvable" }

    if (!farm.farmAdjustmentProfile) {
      return { success: true, data: null }
    }

    const p = farm.farmAdjustmentProfile
    return {
      success: true,
      data: {
        id: p.id,
        farmId: p.farmId,
        status: p.status as "OBSERVING" | "SUGGESTED" | "ACTIVE",
        weightFactor: p.weightFactor,
        feedFactor: p.feedFactor,
        fcrFactor: p.fcrFactor,
        layingFactor: p.layingFactor,
        basedOnBatchCount: p.basedOnBatchCount,
        basedOnPeriodMonths: p.basedOnPeriodMonths,
        calculatedAt: p.calculatedAt,
        validatedAt: p.validatedAt,
        notes: p.notes,
      },
    }
  } catch {
    return { success: false, error: "Erreur lors de la lecture du profil" }
  }
}

// ---------------------------------------------------------------------------
// Déclencher le calcul des facteurs observés (→ SUGGESTED si critères atteints)
// ---------------------------------------------------------------------------

export async function computeAndSuggestFarmAdjustment(data: {
  organizationId: string
  farmId: string
}): Promise<ActionResult<{ status: "OBSERVING" | "SUGGESTED"; message: string }>> {
  try {
    const parsed = farmAdjustmentSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: "Données invalides" }

    const { organizationId, farmId } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "FARMS")
    if (!accessResult.success) return accessResult

    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.OWNER, UserRole.MANAGER],
      "Permission refusée — réservé aux managers et propriétaires",
    )
    if (!roleResult.success) return roleResult

    const farm = await prisma.farm.findFirst({
      where: { id: farmId, organizationId, deletedAt: null },
      select: {
        id: true,
        senegalProfileCode: true,
        farmAdjustmentProfile: { select: { minBatchesForSuggestion: true } },
      },
    })

    if (!farm) return { success: false, error: "Ferme introuvable" }

    const senegalProfile = (farm.senegalProfileCode ?? "STANDARD_LOCAL") as
      | "STANDARD_LOCAL"
      | "DIFFICILE"
      | "BON_NIVEAU"
    const minBatches = farm.farmAdjustmentProfile?.minBatchesForSuggestion ?? 3

    const result = await computeFarmObservedFactors(prisma, farmId, senegalProfile, {
      minBatchesForSuggestion: minBatches,
    })

    const now = new Date()
    const newStatus: "OBSERVING" | "SUGGESTED" = result.suggestionReady ? "SUGGESTED" : "OBSERVING"

    await prisma.farmAdjustmentProfile.upsert({
      where: { farmId },
      create: {
        organizationId,
        farmId,
        status: newStatus,
        weightFactor: result.weightFactor,
        feedFactor: result.feedFactor,
        fcrFactor: result.fcrFactor,
        layingFactor: result.layingFactor,
        basedOnBatchCount: result.basedOnBatchCount,
        calculatedAt: now,
      },
      update: {
        status: newStatus,
        weightFactor: result.weightFactor,
        feedFactor: result.feedFactor,
        fcrFactor: result.fcrFactor,
        layingFactor: result.layingFactor,
        basedOnBatchCount: result.basedOnBatchCount,
        calculatedAt: now,
      },
    })

    const message = result.suggestionReady
      ? `Ajustement calculé depuis ${result.basedOnBatchCount} lots — en attente de validation.`
      : `Données insuffisantes (${result.basedOnBatchCount} lot(s) analysé(s), ${minBatches} requis).`

    return { success: true, data: { status: newStatus, message } }
  } catch {
    return { success: false, error: "Erreur lors du calcul de l'ajustement" }
  }
}

// ---------------------------------------------------------------------------
// Valider un ajustement SUGGESTED → ACTIVE
// ---------------------------------------------------------------------------

export async function activateFarmAdjustment(data: {
  organizationId: string
  farmId: string
}): Promise<ActionResult<void>> {
  try {
    const parsed = farmAdjustmentSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: "Données invalides" }

    const { organizationId, farmId } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "FARMS")
    if (!accessResult.success) return accessResult

    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.OWNER, UserRole.MANAGER],
      "Permission refusée — réservé aux managers et propriétaires",
    )
    if (!roleResult.success) return roleResult

    const userId = accessResult.data.session.user.id

    const existing = await prisma.farmAdjustmentProfile.findFirst({
      where: { farmId, organizationId },
      select: { id: true, status: true },
    })

    if (!existing) {
      return {
        success: false,
        error: "Profil d'ajustement introuvable — lancez d'abord le calcul.",
      }
    }

    if (existing.status !== "SUGGESTED") {
      return {
        success: false,
        error: `Le profil est en état ${existing.status} — seul SUGGESTED peut être activé.`,
      }
    }

    await prisma.farmAdjustmentProfile.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        validatedAt: new Date(),
        validatedByUserId: userId,
      },
    })

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Erreur lors de l'activation de l'ajustement" }
  }
}

// ---------------------------------------------------------------------------
// Réinitialiser un ajustement ACTIVE/SUGGESTED → OBSERVING
// ---------------------------------------------------------------------------

export async function resetFarmAdjustment(data: {
  organizationId: string
  farmId: string
}): Promise<ActionResult<void>> {
  try {
    const parsed = farmAdjustmentSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: "Données invalides" }

    const { organizationId, farmId } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "FARMS")
    if (!accessResult.success) return accessResult

    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.OWNER, UserRole.MANAGER],
      "Permission refusée — réservé aux managers et propriétaires",
    )
    if (!roleResult.success) return roleResult

    const existing = await prisma.farmAdjustmentProfile.findFirst({
      where: { farmId, organizationId },
      select: { id: true },
    })

    if (!existing) return { success: false, error: "Profil d'ajustement introuvable." }

    await prisma.farmAdjustmentProfile.update({
      where: { id: existing.id },
      data: {
        status: "OBSERVING",
        weightFactor: null,
        feedFactor: null,
        fcrFactor: null,
        layingFactor: null,
        basedOnBatchCount: 0,
        calculatedAt: null,
        validatedAt: null,
        validatedByUserId: null,
        notes: null,
      },
    })

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Erreur lors de la réinitialisation" }
  }
}
