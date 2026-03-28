import { describe, expect, it } from "vitest"
import {
  getBatchOperationalSnapshot,
  hasMissingBatchSaisie,
} from "@/src/lib/batch-metrics"

describe("batch-metrics", () => {
  it("calcule un snapshot operationnel coherent pour un lot actif", () => {
    const snapshot = getBatchOperationalSnapshot({
      entryDate: new Date("2026-03-01T00:00:00.000Z"),
      entryAgeDay: 2,
      entryCount: 100,
      status: "ACTIVE",
      totalMortality: 7,
      now: new Date("2026-03-11T00:00:00.000Z"),
    })

    expect(snapshot.ageDay).toBe(12)
    expect(snapshot.liveCount).toBe(93)
    expect(snapshot.totalMortality).toBe(7)
    expect(snapshot.mortalityRatePct).toBe(7)
  })

  it("detecte une saisie manquante seulement sur un lot actif sans saisie recente", () => {
    expect(
      hasMissingBatchSaisie({
        status: "ACTIVE",
        entryDate: new Date("2026-03-01T00:00:00.000Z"),
        lastRecordDate: new Date("2026-03-08T00:00:00.000Z"),
        now: new Date("2026-03-11T00:00:00.000Z"),
      }),
    ).toBe(true)

    expect(
      hasMissingBatchSaisie({
        status: "ACTIVE",
        entryDate: new Date("2026-03-10T00:00:00.000Z"),
        lastRecordDate: null,
        now: new Date("2026-03-11T00:00:00.000Z"),
      }),
    ).toBe(false)

    expect(
      hasMissingBatchSaisie({
        status: "CLOSED",
        entryDate: new Date("2026-03-01T00:00:00.000Z"),
        lastRecordDate: null,
        now: new Date("2026-03-11T00:00:00.000Z"),
      }),
    ).toBe(false)
  })
})
