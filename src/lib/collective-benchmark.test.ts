/**
 * Tests : Intelligence Collective — collective-benchmark.ts (fonctions pures)
 *
 * Teste les helpers statistiques et le formatage des insights.
 * Les fonctions Prisma ne sont pas testées ici (intégration).
 */

import { describe, it, expect } from "vitest"
import { formatCollectiveBenchmarkInsight } from "@/src/lib/collective-benchmark"
import type { CollectiveBenchmark } from "@/src/lib/collective-benchmark"

function makeBenchmark(overrides: Partial<CollectiveBenchmark> = {}): CollectiveBenchmark {
  return {
    sampleSize: 50,
    scope: "precise",
    p10MortalityRate: 1.2,
    p25MortalityRate: 2.0,
    medianMortalityRate: 3.5,
    p75MortalityRate: 5.0,
    medianFCR: 1.9,
    p25FCR: 1.7,
    p75FCR: 2.2,
    medianMarginRate: 18,
    p25MarginRate: 10,
    medianSalePricePerKgFcfa: 1800,
    avgHeatStressDays: 12,
    usedRegionCode: "DAKAR",
    usedBreedCode: "COBB500",
    usedMonths: [3, 4, 5],
    adjustedReference: null,
    ...overrides,
  }
}

describe("formatCollectiveBenchmarkInsight", () => {
  it("retourne above quand mortalité >1% au-dessus de la médiane", () => {
    const benchmark = makeBenchmark({ medianMortalityRate: 3.5 })
    const result = formatCollectiveBenchmarkInsight(benchmark, 5.2) // delta = +1.7
    expect(result.comparaison).toBe("above")
    expect(result.label).toBe("Au-dessus de la médiane")
    expect(result.message).toContain("5.2%")
    expect(result.message).toContain("3.5%")
  })

  it("retourne below quand mortalité >1% en-dessous de la médiane", () => {
    const benchmark = makeBenchmark({ medianMortalityRate: 3.5 })
    const result = formatCollectiveBenchmarkInsight(benchmark, 2.0) // delta = -1.5
    expect(result.comparaison).toBe("below")
    expect(result.label).toBe("En-dessous de la médiane")
    expect(result.message).toContain("2.0%")
  })

  it("retourne on_par quand mortalité dans la médiane (delta ≤ 1%)", () => {
    const benchmark = makeBenchmark({ medianMortalityRate: 3.5 })
    const result = formatCollectiveBenchmarkInsight(benchmark, 3.8) // delta = +0.3
    expect(result.comparaison).toBe("on_par")
    expect(result.label).toBe("Dans la médiane")
  })

  it("retourne on_par avec message générique si médiane null", () => {
    const benchmark = makeBenchmark({ medianMortalityRate: null })
    const result = formatCollectiveBenchmarkInsight(benchmark, 3.5)
    expect(result.comparaison).toBe("on_par")
    expect(result.message).toContain("insuffisantes")
  })

  it("indique la bonne taille d'échantillon dans le message", () => {
    const benchmark = makeBenchmark({ sampleSize: 42, scope: "broad" })
    const result = formatCollectiveBenchmarkInsight(benchmark, 5.0)
    // Avec scope broad et médiane 3.5, delta = 1.5 > 1 → above
    expect(result.message).toContain("42")
  })

  it("gère scope type_only dans le message", () => {
    const benchmark = makeBenchmark({ scope: "type_only", usedRegionCode: null, usedBreedCode: null })
    const result = formatCollectiveBenchmarkInsight(benchmark, 5.0)
    expect(result.message).toContain("même type")
  })
})

describe("Collective benchmark — structure des champs", () => {
  it("le benchmark précis expose tous les champs attendus", () => {
    const benchmark = makeBenchmark()
    expect(benchmark).toHaveProperty("sampleSize")
    expect(benchmark).toHaveProperty("scope")
    expect(benchmark).toHaveProperty("medianMortalityRate")
    expect(benchmark).toHaveProperty("medianFCR")
    expect(benchmark).toHaveProperty("medianMarginRate")
    expect(benchmark).toHaveProperty("medianSalePricePerKgFcfa")
    expect(benchmark).toHaveProperty("usedRegionCode")
    expect(benchmark).toHaveProperty("usedBreedCode")
    expect(benchmark).toHaveProperty("adjustedReference")
    expect(benchmark.scope).toBe("precise")
  })

  it("un benchmark avec scope broad n'a pas forcément une région", () => {
    const benchmark = makeBenchmark({ scope: "broad", usedRegionCode: null })
    expect(benchmark.usedRegionCode).toBeNull()
    expect(benchmark.scope).toBe("broad")
  })
})
