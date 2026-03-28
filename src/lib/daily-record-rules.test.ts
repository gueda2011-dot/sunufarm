import { describe, expect, it } from "vitest"
import { isDailyRecordLocked, toUtcDate } from "@/src/lib/daily-record-rules"

describe("daily-record-rules", () => {
  it("normalise une date a minuit UTC", () => {
    const date = new Date("2026-03-28T18:47:12.000Z")

    expect(toUtcDate(date)).toEqual(new Date("2026-03-28T00:00:00.000Z"))
  })

  it("considere une saisie verrouillee si lockedAt est deja renseigne", () => {
    expect(
      isDailyRecordLocked(
        new Date("2026-03-20T00:00:00.000Z"),
        new Date("2026-03-21T00:00:00.000Z"),
        new Date("2026-03-20T12:00:00.000Z"),
      ),
    ).toBe(true)
  })

  it("laisse la saisie editable jusqu a J+1 inclus puis la verrouille a J+2 UTC", () => {
    const recordDate = new Date("2026-03-20T00:00:00.000Z")

    expect(
      isDailyRecordLocked(
        recordDate,
        null,
        new Date("2026-03-21T23:59:59.000Z"),
      ),
    ).toBe(false)

    expect(
      isDailyRecordLocked(
        recordDate,
        null,
        new Date("2026-03-22T00:00:00.000Z"),
      ),
    ).toBe(true)
  })
})
