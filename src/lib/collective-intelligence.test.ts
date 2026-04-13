import { describe, expect, it } from "vitest"
import {
  buildBatchOutcomeSnapshotFingerprint,
  computeJ14DataQuality,
  deriveRegionCode,
} from "@/src/lib/collective-intelligence"

describe("deriveRegionCode", () => {
  it("normalise les variantes d'accents et d'espaces", () => {
    expect(deriveRegionCode("Thiès, Sénégal")).toBe("THIES")
    expect(deriveRegionCode("Saint Louis")).toBe("SAINT_LOUIS")
    expect(deriveRegionCode("Kédougou")).toBe("KEDOUGOU")
  })

  it("retourne null quand aucune région n'est détectée", () => {
    expect(deriveRegionCode("Adresse inconnue")).toBeNull()
    expect(deriveRegionCode(null)).toBeNull()
  })
})

describe("buildBatchOutcomeSnapshotFingerprint", () => {
  it("est stable pour le même lot et le même secret", () => {
    const first = buildBatchOutcomeSnapshotFingerprint("org_1", "batch_1", "secret")
    const second = buildBatchOutcomeSnapshotFingerprint("org_1", "batch_1", "secret")

    expect(first).toBe(second)
  })

  it("change dès que la source change", () => {
    const base = buildBatchOutcomeSnapshotFingerprint("org_1", "batch_1", "secret")

    expect(buildBatchOutcomeSnapshotFingerprint("org_2", "batch_1", "secret")).not.toBe(base)
    expect(buildBatchOutcomeSnapshotFingerprint("org_1", "batch_2", "secret")).not.toBe(base)
    expect(buildBatchOutcomeSnapshotFingerprint("org_1", "batch_1", "autre-secret")).not.toBe(base)
  })
})

describe("computeJ14DataQuality (Phase 4)", () => {
  const entryDate = new Date("2026-04-01T00:00:00.000Z")

  function makeDate(daysOffset: number) {
    const d = new Date(entryDate)
    d.setUTCDate(d.getUTCDate() + daysOffset)
    return d
  }

  it("retourne null si aucun record J14", () => {
    const result = computeJ14DataQuality({ entryDate, dailyRecords: [] })
    expect(result.pctEstimatedJ14).toBeNull()
    expect(result.avgConfidenceJ14).toBeNull()
  })

  it("retourne null pour les records strictement après J14 (cutoff exclusif)", () => {
    const result = computeJ14DataQuality({
      entryDate,
      dailyRecords: [
        { date: makeDate(14), dataSource: "MANUAL_KG", estimationConfidence: null },
      ],
    })
    // J14+ est hors fenêtre (cutoff = entryDate + 14 jours, records < cutoff)
    expect(result.pctEstimatedJ14).toBeNull()
    expect(result.avgConfidenceJ14).toBeNull()
  })

  it("100% manuel → pctEstimated = 0, confiance = 1.0", () => {
    const result = computeJ14DataQuality({
      entryDate,
      dailyRecords: [
        { date: makeDate(0), dataSource: "MANUAL_KG", estimationConfidence: null },
        { date: makeDate(5), dataSource: "MANUAL_KG", estimationConfidence: null },
        { date: makeDate(10), dataSource: "MANUAL_KG", estimationConfidence: null },
      ],
    })
    expect(result.pctEstimatedJ14).toBe(0)
    expect(result.avgConfidenceJ14).toBe(1.0)
  })

  it("100% estimé HIGH → pctEstimated = 100, confiance = 1.0", () => {
    const result = computeJ14DataQuality({
      entryDate,
      dailyRecords: [
        { date: makeDate(1), dataSource: "ESTIMATED_FROM_BAG", estimationConfidence: "HIGH" },
        { date: makeDate(3), dataSource: "ESTIMATED_FROM_BAG", estimationConfidence: "HIGH" },
      ],
    })
    expect(result.pctEstimatedJ14).toBe(100)
    expect(result.avgConfidenceJ14).toBe(1.0)
  })

  it("mélange manuel + estimé MEDIUM → calcule correctement les deux métriques", () => {
    // 2 manuels + 2 estimés MEDIUM
    const result = computeJ14DataQuality({
      entryDate,
      dailyRecords: [
        { date: makeDate(0), dataSource: "MANUAL_KG", estimationConfidence: null },
        { date: makeDate(2), dataSource: "MANUAL_KG", estimationConfidence: null },
        { date: makeDate(5), dataSource: "ESTIMATED_FROM_BAG", estimationConfidence: "MEDIUM" },
        { date: makeDate(8), dataSource: "ESTIMATED_FROM_BAG", estimationConfidence: "MEDIUM" },
      ],
    })
    expect(result.pctEstimatedJ14).toBe(50)
    // (1.0 + 1.0 + 0.5 + 0.5) / 4 = 0.75
    expect(result.avgConfidenceJ14).toBe(0.75)
  })

  it("estimé LOW tire la confiance vers le bas", () => {
    const result = computeJ14DataQuality({
      entryDate,
      dailyRecords: [
        { date: makeDate(1), dataSource: "ESTIMATED_FROM_BAG", estimationConfidence: "LOW" },
        { date: makeDate(2), dataSource: "ESTIMATED_FROM_BAG", estimationConfidence: "HIGH" },
      ],
    })
    expect(result.pctEstimatedJ14).toBe(100)
    // (0.0 + 1.0) / 2 = 0.5
    expect(result.avgConfidenceJ14).toBe(0.5)
  })

  it("records après J14 sont exclus du calcul", () => {
    const result = computeJ14DataQuality({
      entryDate,
      dailyRecords: [
        { date: makeDate(5),  dataSource: "MANUAL_KG",          estimationConfidence: null },
        { date: makeDate(20), dataSource: "ESTIMATED_FROM_BAG", estimationConfidence: "LOW" },
      ],
    })
    // Seul J5 est inclus, J20 exclu
    expect(result.pctEstimatedJ14).toBe(0)
    expect(result.avgConfidenceJ14).toBe(1.0)
  })
})
