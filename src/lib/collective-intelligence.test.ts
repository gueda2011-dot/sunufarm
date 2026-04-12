import { describe, expect, it } from "vitest"
import {
  buildBatchOutcomeSnapshotFingerprint,
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
