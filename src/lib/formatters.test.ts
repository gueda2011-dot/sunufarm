import { describe, expect, it } from "vitest"
import {
  formatAiCredits,
  formatCountWithUnit,
  formatDurationDays,
  formatMoneyFCFA,
  formatQuantity,
  formatRemainingDays,
  formatWeight,
  parseFCFA,
} from "@/src/lib/formatters"

describe("formatters", () => {
  it("formate la monnaie FCFA et la reparse proprement", () => {
    expect(formatMoneyFCFA(125000)).toContain("125")
    expect(formatMoneyFCFA(125000)).toContain("F")
    expect(parseFCFA("125 000 FCFA")).toBe(125000)
  })

  it("formate les comptes avec unite et les durees", () => {
    expect(formatCountWithUnit(1, "jour")).toBe("1 jour")
    expect(formatCountWithUnit(3, "jour")).toBe("3 jours")
    expect(formatDurationDays(7)).toBe("7 jours")
    expect(formatRemainingDays(1)).toBe("1 jour restant")
    expect(formatRemainingDays(3)).toBe("3 jours restants")
  })

  it("formate les quantites, poids et credits IA", () => {
    expect(formatQuantity(12, "kg")).toBe("12 kg")
    expect(formatWeight(850)).toBe("850 g")
    expect(formatWeight(1750)).toBe("1.75 kg")
    expect(formatAiCredits(0)).toBe("IA epuisee")
    expect(formatAiCredits(2)).toBe("2 analyses IA")
  })

  it("retourne un fallback coherent pour les valeurs manquantes", () => {
    expect(formatQuantity(null, "kg")).toBe("—")
    expect(formatDurationDays(undefined)).toBe("—")
    expect(formatAiCredits(null)).toBe("—")
  })
})
