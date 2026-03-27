import { describe, expect, it } from "vitest"
import {
  buildMetricComparison,
  formatTrendLabel,
} from "@/src/lib/reporting"

describe("reporting helpers", () => {
  it("calcule correctement une evolution positive", () => {
    const comparison = buildMetricComparison(120, 100)

    expect(comparison.delta).toBe(20)
    expect(comparison.deltaPercent).toBe(20)
    expect(comparison.trend).toBe("up")
  })

  it("gerer le cas sans historique precedent", () => {
    const comparison = buildMetricComparison(40, 0)

    expect(comparison.delta).toBe(40)
    expect(comparison.deltaPercent).toBeNull()
    expect(comparison.trend).toBe("up")
  })

  it("retourne un libelle stable si la metrique ne bouge pas", () => {
    const comparison = buildMetricComparison(0, 0)

    expect(formatTrendLabel(comparison)).toContain("Stable")
  })
})
