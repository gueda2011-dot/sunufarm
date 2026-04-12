/**
 * ml-risk.ts
 * ----------
 * Inférence de risque lot en TypeScript pur.
 * Charge ml/model.json (généré par train_model.py) et applique la régression
 * logistique sans aucune dépendance Python au runtime.
 *
 * Architecture :
 *   Python (offline) → model.json → TypeScript (runtime Next.js)
 *
 * SÉPARATION DES SOURCES :
 *   model.json porte toujours un champ "dataSource" : "synthetic" | "real".
 *   L'API le retourne au client — l'UI peut afficher un bandeau d'avertissement
 *   quand le modèle est encore basé sur des données synthétiques.
 *   Les deux sources ne sont jamais mélangées dans un même model.json.
 */

import fs from "fs"
import path from "path"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LotJ14Data {
  effectif_initial: number
  mortalite_cumulee_j14: number
  taux_mortalite_j14: number       // ex: 0.036 = 3.6 %
  aliment_cumule_j14: number       // kg
  poids_moyen_j14: number          // grammes
  depenses_cumulees_j14: number    // FCFA
  temperature_moyenne_j14: number  // °C
  symptomes_detectes_j14: 0 | 1
}

export type RiskClasse = "vert" | "orange" | "rouge"

/** "synthetic" = modèle entraîné sur données générées, PAS encore sur terrain réel */
export type ModelDataSource = "synthetic" | "real"

export interface ModelMeta {
  dataSource: ModelDataSource
  sampleSize: number
  accuracy: number
  trainedAt: string  // ISO date
}

export interface PredictionResult {
  score: number          // probabilité 0–1
  classe: RiskClasse
  explication: string
  model: ModelMeta       // métadonnées de provenance du modèle
}

interface ModelPayload {
  type: string
  dataSource: ModelDataSource
  sampleSize: number
  accuracy: number
  trainedAt: string
  feature_cols: string[]
  scaler_mean: number[]
  scaler_scale: number[]
  coef: number[]
  intercept: number
}

// ---------------------------------------------------------------------------
// Chargement du modèle (singleton simple)
// ---------------------------------------------------------------------------

let _cachedModel: ModelPayload | null = null

function loadModel(): ModelPayload {
  if (_cachedModel) return _cachedModel

  const modelPath = path.join(process.cwd(), "ml", "model.json")
  if (!fs.existsSync(modelPath)) {
    throw new Error(
      `Modèle ML introuvable : ${modelPath}\n` +
      "Lancez : python ml/generate_dataset.py && python ml/train_model.py --source synthetic"
    )
  }

  const parsed = JSON.parse(fs.readFileSync(modelPath, "utf-8")) as ModelPayload

  // Garde-fou : refuser un model.json sans dataSource (fichier corrompu ou ancien format)
  if (!parsed.dataSource) {
    throw new Error(
      "model.json invalide : champ 'dataSource' manquant.\n" +
      "Régénérez le modèle : python ml/train_model.py --source synthetic"
    )
  }

  _cachedModel = parsed
  return _cachedModel
}

// ---------------------------------------------------------------------------
// Maths : régression logistique
// ---------------------------------------------------------------------------

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

function computeScore(data: LotJ14Data, model: ModelPayload): number {
  const values: Record<string, number> = {
    effectif_initial: data.effectif_initial,
    mortalite_cumulee_j14: data.mortalite_cumulee_j14,
    taux_mortalite_j14: data.taux_mortalite_j14,
    aliment_cumule_j14: data.aliment_cumule_j14,
    poids_moyen_j14: data.poids_moyen_j14,
    depenses_cumulees_j14: data.depenses_cumulees_j14,
    temperature_moyenne_j14: data.temperature_moyenne_j14,
    symptomes_detectes_j14: data.symptomes_detectes_j14,
  }

  // Standardisation (Z-score avec paramètres du scaler Python)
  const standardized = model.feature_cols.map(
    (feat, i) => (values[feat] - model.scaler_mean[i]) / model.scaler_scale[i]
  )

  // Produit scalaire + intercept
  const logit =
    standardized.reduce((acc, x, i) => acc + model.coef[i] * x, 0) +
    model.intercept

  return Math.round(sigmoid(logit) * 10000) / 10000
}

function classeFromScore(score: number): RiskClasse {
  if (score < 0.35) return "vert"
  if (score < 0.65) return "orange"
  return "rouge"
}

function explain(data: LotJ14Data, score: number): string {
  if (score < 0.35) return "Lot sain : indicateurs dans les normes à J14."

  const reasons: string[] = []

  if (data.taux_mortalite_j14 > 0.06) {
    reasons.push(`mortalité élevée à J14 (${(data.taux_mortalite_j14 * 100).toFixed(1)} %)`)
  } else if (data.taux_mortalite_j14 > 0.03) {
    reasons.push(`mortalité modérée à J14 (${(data.taux_mortalite_j14 * 100).toFixed(1)} %)`)
  }

  if (data.poids_moyen_j14 < 320) {
    reasons.push(`poids faible à J14 (${data.poids_moyen_j14.toFixed(0)} g)`)
  }

  if (data.symptomes_detectes_j14 === 1) {
    reasons.push("symptômes sanitaires détectés")
  }

  if (data.temperature_moyenne_j14 > 33) {
    reasons.push(`température élevée (${data.temperature_moyenne_j14.toFixed(1)} °C)`)
  }

  if (reasons.length === 0) return "Risque modéré : surveillance recommandée."
  return "Risque élevé à cause de : " + reasons.join(", ") + "."
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

export function predictLotRisk(data: LotJ14Data): PredictionResult {
  const model = loadModel()
  const score = computeScore(data, model)
  const classe = classeFromScore(score)
  const explication = explain(data, score)

  return {
    score,
    classe,
    explication,
    model: {
      dataSource: model.dataSource,
      sampleSize: model.sampleSize,
      accuracy: model.accuracy,
      trainedAt: model.trainedAt,
    },
  }
}
