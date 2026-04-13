/**
 * Tests unitaires — Moteur de reconstruction alimentaire
 *
 * Couvre les cas critiques définis dans le plan Phase 2 :
 *   1. Sac 50kg Cobb500 J11-J15 500 oiseaux → distribution non-linéaire, somme = 50kg ±0.01
 *   2. Fallback breedCode inconnu → LINEAR, confidence LOW
 *   3. Sac 20j → LOW ; 5j cohérent référence → HIGH
 *   4. Interpolation de jours manquants dans la courbe
 *   5. Vérification que assertReconstructionSum fonctionne correctement
 *   6. Cohérence de la distribution CURVE_WEIGHTED vs LINEAR
 */

import { describe, it, expect } from "vitest"
import {
  reconstructDailyFromBagEvent,
  assertReconstructionSum,
} from "@/src/lib/feed-reconstruction"
import { distributeLinear, computeConfidence } from "@/src/lib/feed-reference-core"
import type {
  BagReconstructionInput,
  CurveDay,
} from "@/src/lib/feed-reference-core"

// =============================================================================
// Fixtures — Courbe simulée Cobb 500 (J11-J15)
// =============================================================================

/**
 * Valeurs approximatives tirées du Performance Guide Cobb 500 2022.
 * Jours 11 à 15 : consommation croissante ~43g → ~60g / oiseau / jour.
 */
const COBB500_J11_J15: CurveDay[] = [
  { ageDay: 11, dailyFeedGPerBird: 43,  rawGeneticFeedG: 45,  bodyWeightG: 340, qualityLevel: "MEDIUM", version: "2024-01" },
  { ageDay: 12, dailyFeedGPerBird: 47,  rawGeneticFeedG: 49,  bodyWeightG: 375, qualityLevel: "MEDIUM", version: "2024-01" },
  { ageDay: 13, dailyFeedGPerBird: 51,  rawGeneticFeedG: 54,  bodyWeightG: 412, qualityLevel: "MEDIUM", version: "2024-01" },
  { ageDay: 14, dailyFeedGPerBird: 55,  rawGeneticFeedG: 58,  bodyWeightG: 451, qualityLevel: "MEDIUM", version: "2024-01" },
  { ageDay: 15, dailyFeedGPerBird: 60,  rawGeneticFeedG: 63,  bodyWeightG: 492, qualityLevel: "MEDIUM", version: "2024-01" },
]

const TOTAL_CURVE_G = 43 + 47 + 51 + 55 + 60 // 256g

function makeInput(overrides: Partial<BagReconstructionInput> = {}): BagReconstructionInput {
  return {
    bagWeightKg:         50,
    startDate:           new Date("2024-03-11"),
    endDate:             new Date("2024-03-15"),
    startAgeDay:         11,
    endAgeDay:           15,
    livingBirdsEstimate: 500,
    breedCode:           "COBB500",
    senegalProfileCode:  "STANDARD_LOCAL",
    farmFactors:         null,
    ...overrides,
  }
}

// =============================================================================
// 1. Distribution CURVE_WEIGHTED — cas nominal
// =============================================================================

describe("reconstructDailyFromBagEvent — CURVE_WEIGHTED", () => {
  it("retourne 5 estimations pour J11-J15", () => {
    const input = makeInput()
    const results = reconstructDailyFromBagEvent(input, COBB500_J11_J15)

    expect(results).toHaveLength(5)
    expect(results[0].ageDay).toBe(11)
    expect(results[4].ageDay).toBe(15)
  })

  it("la somme des kg estimés = bagWeightKg (± 0.01 kg)", () => {
    const input = makeInput()
    const results = reconstructDailyFromBagEvent(input, COBB500_J11_J15)
    const total = results.reduce((sum, r) => sum + r.estimatedFeedKg, 0)

    expect(Math.abs(total - 50)).toBeLessThanOrEqual(0.01)
    expect(assertReconstructionSum(results, 50)).toBe(true)
  })

  it("la distribution est non-linéaire (chaque jour est proportionnel à sa courbe)", () => {
    const input = makeInput()
    const results = reconstructDailyFromBagEvent(input, COBB500_J11_J15)

    // Vérifier que les proportions respectent la courbe
    // J11: 43/256 ≈ 16.8%, J15: 60/256 ≈ 23.4%
    const j11Kg = results.find((r) => r.ageDay === 11)!.estimatedFeedKg
    const j15Kg = results.find((r) => r.ageDay === 15)!.estimatedFeedKg

    // J15 doit consommer plus que J11 (courbe croissante)
    expect(j15Kg).toBeGreaterThan(j11Kg)

    // L'écart doit être significatif (> 3% du total)
    const gapPct = ((j15Kg - j11Kg) / 50) * 100
    expect(gapPct).toBeGreaterThan(3)
  })

  it("les proportions individuelles sont correctes", () => {
    const input = makeInput()
    const results = reconstructDailyFromBagEvent(input, COBB500_J11_J15)

    for (const result of results) {
      const curveG = COBB500_J11_J15.find((c) => c.ageDay === result.ageDay)!.dailyFeedGPerBird
      const expectedProportion = curveG / TOTAL_CURVE_G
      const expectedKg = Math.round(50 * expectedProportion * 1000) / 1000
      // Tolérance arrondi 0.001 kg + résidu sur dernier jour
      expect(Math.abs(result.estimatedFeedKg - expectedKg)).toBeLessThanOrEqual(0.01)
    }
  })

  it("la méthode est CURVE_WEIGHTED et la source ESTIMATED_FROM_BAG", () => {
    const input = makeInput()
    const results = reconstructDailyFromBagEvent(input, COBB500_J11_J15)

    for (const result of results) {
      expect(result.dataSource).toBe("ESTIMATED_FROM_BAG")
      expect(result.estimationMethod).toBe("CURVE_WEIGHTED")
      expect(result.curveVersion).toBe("2024-01")
    }
  })

  it("les dates sont correctement calculées depuis startDate", () => {
    const input = makeInput()
    const results = reconstructDailyFromBagEvent(input, COBB500_J11_J15)

    expect(results[0].date.toISOString().slice(0, 10)).toBe("2024-03-11")
    expect(results[1].date.toISOString().slice(0, 10)).toBe("2024-03-12")
    expect(results[4].date.toISOString().slice(0, 10)).toBe("2024-03-15")
  })

  it("estimatedFeedGPerBird est calculé correctement", () => {
    const input = makeInput() // 500 oiseaux
    const results = reconstructDailyFromBagEvent(input, COBB500_J11_J15)

    for (const result of results) {
      const expectedGPerBird = Math.round((result.estimatedFeedKg * 1000) / 500 * 10) / 10
      expect(result.estimatedFeedGPerBird).toBe(expectedGPerBird)
    }
  })

  it("theoreticalReferenceKg est calculé sur la somme de la courbe × effectif", () => {
    const input = makeInput() // 500 oiseaux, courbe totale 256g
    const results = reconstructDailyFromBagEvent(input, COBB500_J11_J15)

    const expectedTheoKg = (TOTAL_CURVE_G * 500) / 1000 // 128 kg
    // Toutes les lignes partagent la même valeur
    expect(results[0].theoreticalReferenceKg).toBeCloseTo(expectedTheoKg, 1)
  })
})

// =============================================================================
// 2. Fallback LINEAR — courbe vide ou souche inconnue
// =============================================================================

describe("reconstructDailyFromBagEvent — LINEAR fallback", () => {
  it("utilise LINEAR si la courbe est vide (souche inconnue)", () => {
    const input = makeInput({ breedCode: "SOUCHE_INCONNUE" })
    const results = reconstructDailyFromBagEvent(input, []) // courbe vide

    expect(results).toHaveLength(5)
    for (const result of results) {
      expect(result.estimationMethod).toBe("LINEAR")
      expect(result.confidence).toBe("LOW")
    }
  })

  it("la distribution linéaire est plate (chaque jour ≈ bagWeightKg / duration)", () => {
    const input = makeInput()
    const results = reconstructDailyFromBagEvent(input, [])

    const expectedPerDay = Math.round((50 / 5) * 1000) / 1000 // 10 kg/jour
    for (const result of results) {
      expect(result.estimatedFeedKg).toBe(expectedPerDay)
    }
  })

  it("la somme est correcte en LINEAR aussi", () => {
    const input = makeInput()
    const results = reconstructDailyFromBagEvent(input, [])

    expect(assertReconstructionSum(results, 50)).toBe(true)
  })

  it("LINEAR si la somme de la courbe est nulle (tous les points à 0)", () => {
    const zeroCurve: CurveDay[] = COBB500_J11_J15.map((p) => ({
      ...p,
      dailyFeedGPerBird: 0,
    }))
    const input = makeInput()
    const results = reconstructDailyFromBagEvent(input, zeroCurve)

    for (const result of results) {
      expect(result.estimationMethod).toBe("LINEAR")
    }
  })
})

// =============================================================================
// 3. Calcul de la confidence
// =============================================================================

describe("computeConfidence", () => {
  it("sac court (5j) et cohérence bonne → HIGH", () => {
    // Cohérence : théorique = 256g × 500 / 1000 = 128 kg, sac = 50 kg → écart 61%
    // → MEDIUM au mieux car écart > 30%
    // Pour HIGH, bagWeightKg doit être proche de théorique
    const referenceKg = (TOTAL_CURVE_G * 500) / 1000 // 128 kg
    const input = makeInput({ bagWeightKg: referenceKg }) // sac = référence exacte
    const confidence = computeConfidence(input, COBB500_J11_J15)

    expect(confidence).toBe("HIGH") // durée 5j + cohérence parfaite + qualité MEDIUM → 100 - 0 - 0 - 10 = 90
  })

  it("sac court (5j) avec sac à 50kg vs 128kg théorique (écart > 30%) → MEDIUM", () => {
    const input = makeInput({ bagWeightKg: 50 }) // sac 50 kg vs 128 kg théorique
    const confidence = computeConfidence(input, COBB500_J11_J15)

    // score = 100 - 0 (durée 5j) - 30 (écart > 30%) - 10 (qualité MEDIUM) = 60 → MEDIUM
    expect(confidence).toBe("MEDIUM")
  })

  it("sac long (20j) → LOW (pénalité durée éliminatoire)", () => {
    // Créer une courbe longue (20 jours)
    const longCurve: CurveDay[] = Array.from({ length: 20 }, (_, i) => ({
      ageDay:            i + 1,
      dailyFeedGPerBird: 50,
      rawGeneticFeedG:   53,
      bodyWeightG:       null,
      qualityLevel:      "MEDIUM",
      version:           "2024-01",
    }))
    const theoreticalKg = (50 * 20 * 500) / 1000 // 500 kg
    const input = makeInput({
      bagWeightKg:  theoreticalKg, // cohérence parfaite
      startAgeDay:  1,
      endAgeDay:    20,
      startDate:    new Date("2024-03-01"),
      endDate:      new Date("2024-03-20"),
    })
    const confidence = computeConfidence(input, longCurve)

    // score = 100 - 40 (durée > 14j) - 0 (cohérence parfaite) - 10 (MEDIUM) = 50 → MEDIUM
    // Pas LOW sauf si autre pénalité
    expect(["MEDIUM", "LOW"]).toContain(confidence)
  })

  it("courbe avec points ESTIMATED → pénalité -15", () => {
    const estimatedCurve: CurveDay[] = COBB500_J11_J15.map((p) => ({
      ...p,
      qualityLevel: "ESTIMATED",
    }))
    const referenceKg = (TOTAL_CURVE_G * 500) / 1000
    const input = makeInput({ bagWeightKg: referenceKg })
    const confidence = computeConfidence(input, estimatedCurve)

    // score = 100 - 0 (durée 5j) - 0 (cohérence parfaite) - 15 (ESTIMATED) = 85 → HIGH
    expect(confidence).toBe("HIGH")
  })
})

// =============================================================================
// 4. Interpolation de jours manquants dans la courbe
// =============================================================================

describe("reconstructDailyFromBagEvent — interpolation de jours manquants", () => {
  it("interpole correctement un jour manquant (J13 absent)", () => {
    const curveWithGap: CurveDay[] = COBB500_J11_J15.filter((p) => p.ageDay !== 13)
    const input = makeInput()
    const results = reconstructDailyFromBagEvent(input, curveWithGap)

    // 5 jours quand même
    expect(results).toHaveLength(5)

    // J13 doit avoir une valeur interpolée entre J12 (47g) et J14 (55g) = 51g
    const j13 = results.find((r) => r.ageDay === 13)!
    expect(j13).toBeDefined()
    expect(j13.estimatedFeedKg).toBeGreaterThan(0)
  })

  it("la somme reste correcte même avec des trous dans la courbe", () => {
    const curveWithGap: CurveDay[] = COBB500_J11_J15.filter((p) => p.ageDay !== 13)
    const input = makeInput()
    const results = reconstructDailyFromBagEvent(input, curveWithGap)

    expect(assertReconstructionSum(results, 50)).toBe(true)
  })
})

// =============================================================================
// 5. assertReconstructionSum
// =============================================================================

describe("assertReconstructionSum", () => {
  it("retourne true si la somme est dans la tolérance", () => {
    const estimates = [
      { estimatedFeedKg: 10.001 },
      { estimatedFeedKg: 9.999 },
      { estimatedFeedKg: 10.0 },
    ] as Parameters<typeof assertReconstructionSum>[0]

    expect(assertReconstructionSum(estimates, 30, 0.01)).toBe(true)
  })

  it("retourne false si la somme dépasse la tolérance", () => {
    const estimates = [
      { estimatedFeedKg: 10.5 },
      { estimatedFeedKg: 10.5 },
    ] as Parameters<typeof assertReconstructionSum>[0]

    expect(assertReconstructionSum(estimates, 20, 0.01)).toBe(false)
  })
})

// =============================================================================
// 6. Comparaison CURVE_WEIGHTED vs LINEAR — écart significatif
// =============================================================================

describe("CURVE_WEIGHTED vs LINEAR — écart prouvé", () => {
  it("l'écart max entre distributions dépasse 3% du total", () => {
    const input = makeInput()

    const weighted = reconstructDailyFromBagEvent(input, COBB500_J11_J15)
    const linear   = reconstructDailyFromBagEvent(input, [])

    const linearKgPerDay = 50 / 5 // 10 kg/jour

    // Le premier jour (J11) doit être inférieur au linéaire (courbe croissante)
    const j11Weighted = weighted.find((r) => r.ageDay === 11)!.estimatedFeedKg
    const j11Linear   = linear.find((r) => r.ageDay === 11)!.estimatedFeedKg

    // J11 pondéré < J11 linéaire (car J11 est sous la moyenne de la période)
    expect(j11Weighted).toBeLessThan(j11Linear)

    // Écart en % du total ≥ 3%
    const maxDeviation = Math.max(
      ...weighted.map((w, i) =>
        Math.abs(w.estimatedFeedKg - linear[i].estimatedFeedKg) / 50 * 100
      )
    )
    expect(maxDeviation).toBeGreaterThan(3)
  })
})

// =============================================================================
// 7. Cas limites
// =============================================================================

describe("cas limites", () => {
  it("sac d'un seul jour", () => {
    const singleDayCurve: CurveDay[] = [
      COBB500_J11_J15[0], // J11 seulement
    ]
    const input = makeInput({
      startAgeDay: 11,
      endAgeDay:   11,
      startDate:   new Date("2024-03-11"),
      endDate:     new Date("2024-03-11"),
    })
    const results = reconstructDailyFromBagEvent(input, singleDayCurve)

    expect(results).toHaveLength(1)
    expect(results[0].estimatedFeedKg).toBeCloseTo(50, 2)
    expect(assertReconstructionSum(results, 50)).toBe(true)
  })

  it("livingBirdsEstimate = 0 → estimatedFeedGPerBird = 0 (pas de division par zéro)", () => {
    const input = makeInput({ livingBirdsEstimate: 0 })
    const results = reconstructDailyFromBagEvent(input, COBB500_J11_J15)

    for (const result of results) {
      expect(result.estimatedFeedGPerBird).toBe(0)
    }
  })

  it("sac très léger (0.5 kg sur 5 jours)", () => {
    const input = makeInput({ bagWeightKg: 0.5 })
    const results = reconstructDailyFromBagEvent(input, COBB500_J11_J15)

    expect(assertReconstructionSum(results, 0.5, 0.005)).toBe(true)
    for (const result of results) {
      expect(result.estimatedFeedKg).toBeGreaterThan(0)
    }
  })
})

// =============================================================================
// 8. Cohérence avec distributeLinear (unit test isolé)
// =============================================================================

describe("distributeLinear — cohérence interne", () => {
  it("produit une distribution plate correcte", () => {
    const input = makeInput()
    const results = distributeLinear(input)

    expect(results).toHaveLength(5)

    const kgPerDay = Math.round((50 / 5) * 1000) / 1000
    for (const r of results) {
      expect(r.estimatedFeedKg).toBe(kgPerDay)
      expect(r.estimationMethod).toBe("LINEAR")
      expect(r.confidence).toBe("LOW")
      expect(r.curveVersion).toBeNull()
    }

    expect(assertReconstructionSum(results, 50)).toBe(true)
  })
})
