import { describe, expect, it } from "vitest"
import {
  getDraftPayloadSize,
  isDraftPayloadTooLarge,
  sanitizeDraftPayload,
} from "@/src/lib/server-drafts"

describe("server drafts", () => {
  it("supprime les valeurs undefined lors de la sanitisation", () => {
    expect(
      sanitizeDraftPayload({
        farmId: "farm-1",
        notes: undefined,
      }),
    ).toEqual({
      farmId: "farm-1",
    })
  })

  it("mesure correctement la taille du payload", () => {
    expect(getDraftPayloadSize({ farmId: "farm-1" })).toBeGreaterThan(0)
  })

  it("detecte un payload trop volumineux", () => {
    expect(isDraftPayloadTooLarge({ notes: "x".repeat(60_000) })).toBe(true)
  })
})
