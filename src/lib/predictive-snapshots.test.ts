import { describe, it, expect } from "vitest"
import { computeMarginRateTrend, computeRiskScoreTrend, computeStockTrend } from "./predictive-snapshots"
import type { SnapshotRecord } from "./predictive-snapshots"

function snap(daysAgo: number, daysToStockout: number | null, alertLevel = "ok"): SnapshotRecord {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return { snapshotDate: d, alertLevel, daysToStockout }
}

describe("computeStockTrend", () => {
  it("returns unknown when fewer than 2 snapshots", () => {
    expect(computeStockTrend([]).trend).toBe("unknown")
    expect(computeStockTrend([snap(0, 5)]).trend).toBe("unknown")
  })

  it("returns improving when daysToStockout increases by > 1", () => {
    // oldest: 3 jours, recent: 10 jours → delta = +7 → improving
    const result = computeStockTrend([snap(6, 3), snap(0, 10)])
    expect(result.trend).toBe("improving")
    expect(result.deltaDays).toBeCloseTo(7)
    expect(result.label).toMatch(/amelior/i)
  })

  it("returns degrading when daysToStockout decreases by > 1", () => {
    // oldest: 10 jours, recent: 2 jours → delta = -8 → degrading
    const result = computeStockTrend([snap(6, 10), snap(0, 2)])
    expect(result.trend).toBe("degrading")
    expect(result.deltaDays).toBeCloseTo(-8)
    expect(result.label).toMatch(/degrad/i)
  })

  it("returns stable when delta is between -1 and +1", () => {
    // oldest: 5 jours, recent: 5.5 jours → delta = +0.5 → stable
    const result = computeStockTrend([snap(6, 5), snap(0, 5.5)])
    expect(result.trend).toBe("stable")
    expect(result.deltaDays).toBeCloseTo(0.5)
  })

  it("handles more than 2 snapshots — uses oldest and most recent", () => {
    // 5 → 6 → 12 → improving
    const result = computeStockTrend([snap(6, 5), snap(3, 6), snap(0, 12)])
    expect(result.trend).toBe("improving")
    expect(result.deltaDays).toBeCloseTo(7)
  })

  it("returns stable when both extremes have no consumption (null)", () => {
    const result = computeStockTrend([snap(6, null), snap(0, null)])
    expect(result.trend).toBe("stable")
    expect(result.deltaDays).toBeNull()
  })

  it("returns unknown when one extreme is null and the other is not", () => {
    expect(computeStockTrend([snap(6, null), snap(0, 5)]).trend).toBe("unknown")
    expect(computeStockTrend([snap(6, 5), snap(0, null)]).trend).toBe("unknown")
  })

  it("returns degrading when recent daysToStockout = 0 (rupture)", () => {
    const result = computeStockTrend([snap(6, 8), snap(0, 0)])
    expect(result.trend).toBe("degrading")
    expect(result.deltaDays).toBeCloseTo(-8)
  })

  it("sorts snapshots chronologically regardless of input order", () => {
    // Fournir dans le mauvais ordre — oldest d'abord en input mais avec le plus grand daysAgo
    const result = computeStockTrend([snap(0, 12), snap(6, 5)])
    expect(result.trend).toBe("improving")
    expect(result.deltaDays).toBeCloseTo(7)
  })
})

describe("computeRiskScoreTrend", () => {
  it("returns degrading when risk score increases materially", () => {
    const result = computeRiskScoreTrend([
      { snapshotDate: snap(6, 5).snapshotDate, riskScore: 20 },
      { snapshotDate: snap(0, 5).snapshotDate, riskScore: 40 },
    ])
    expect(result.trend).toBe("degrading")
    expect(result.deltaScore).toBeCloseTo(20)
  })

  it("returns improving when risk score decreases materially", () => {
    const result = computeRiskScoreTrend([
      { snapshotDate: snap(6, 5).snapshotDate, riskScore: 60 },
      { snapshotDate: snap(0, 5).snapshotDate, riskScore: 35 },
    ])
    expect(result.trend).toBe("improving")
    expect(result.deltaScore).toBeCloseTo(-25)
  })
})

describe("computeMarginRateTrend", () => {
  it("returns improving when projected margin rate increases", () => {
    const result = computeMarginRateTrend([
      { snapshotDate: snap(6, 5).snapshotDate, marginRate: 4 },
      { snapshotDate: snap(0, 5).snapshotDate, marginRate: 12 },
    ])
    expect(result.trend).toBe("improving")
    expect(result.deltaMarginRate).toBeCloseTo(8)
  })

  it("returns degrading when projected margin rate decreases", () => {
    const result = computeMarginRateTrend([
      { snapshotDate: snap(6, 5).snapshotDate, marginRate: 15 },
      { snapshotDate: snap(0, 5).snapshotDate, marginRate: 6 },
    ])
    expect(result.trend).toBe("degrading")
    expect(result.deltaMarginRate).toBeCloseTo(-9)
  })
})
