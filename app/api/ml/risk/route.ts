/**
 * POST /api/ml/risk
 * -----------------
 * Prédit le risque d'un lot à partir des données disponibles à J14.
 *
 * Body JSON attendu :
 * {
 *   effectif_initial: 500,
 *   mortalite_cumulee_j14: 18,
 *   taux_mortalite_j14: 0.036,
 *   aliment_cumule_j14: 320.5,
 *   poids_moyen_j14: 380.2,
 *   depenses_cumulees_j14: 290000,
 *   temperature_moyenne_j14: 30.5,
 *   symptomes_detectes_j14: 0
 * }
 *
 * Réponse :
 * {
 *   success: true,
 *   data: {
 *     score: 0.23,
 *     classe: "vert",
 *     explication: "Lot sain : indicateurs dans les normes à J14.",
 *     model: {
 *       dataSource: "synthetic",   // ← "synthetic" | "real"
 *       sampleSize: 300,
 *       accuracy: 0.75,
 *       trainedAt: "2026-04-12T..."
 *     }
 *   }
 * }
 *
 * IMPORTANT — dataSource :
 *   "synthetic" → modèle entraîné sur données simulées (bootstrap).
 *                 L'UI DOIT afficher un avertissement visible.
 *   "real"      → modèle entraîné sur données terrain anonymisées
 *                 (BatchOutcomeSnapshot). Résultats fiables.
 *
 *   Les deux sources ne sont jamais mélangées dans un même model.json.
 */

import { type NextRequest } from "next/server"
import { z } from "zod"
import { apiError, apiSuccess } from "@/src/lib/api-response"
import { predictLotRisk, type LotJ14Data } from "@/src/lib/ml-risk"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// Validation du body
// ---------------------------------------------------------------------------

const lotJ14Schema = z.object({
  effectif_initial: z.number().int().min(1).max(10_000),
  mortalite_cumulee_j14: z.number().int().min(0),
  taux_mortalite_j14: z.number().min(0).max(1),
  aliment_cumule_j14: z.number().min(0),
  poids_moyen_j14: z.number().min(0),
  depenses_cumulees_j14: z.number().min(0),
  temperature_moyenne_j14: z.number().min(20).max(45),
  symptomes_detectes_j14: z.union([z.literal(0), z.literal(1)]),
})

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("Body JSON invalide", { status: 400 })
  }

  const parsed = lotJ14Schema.safeParse(body)
  if (!parsed.success) {
    return apiError(
      "Données J14 invalides : " + parsed.error.issues.map((i) => i.message).join(", "),
      { status: 400 }
    )
  }

  const data: LotJ14Data = parsed.data

  let result
  try {
    result = predictLotRisk(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur interne ML"
    // Modèle non généré → erreur 503 explicite
    if (message.includes("introuvable")) {
      return apiError(
        "Modèle ML non disponible. Lancez : python ml/generate_dataset.py && python ml/train_model.py",
        { status: 503 }
      )
    }
    return apiError(message, { status: 500 })
  }

  return apiSuccess(result)
}
