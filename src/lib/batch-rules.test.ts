import { describe, expect, it } from "vitest"
import { getAccessibleFarmIds, getNextBatchNumber } from "@/src/lib/batch-rules"

describe("batch-rules", () => {
  it("laisse un acces global aux roles complets", () => {
    expect(getAccessibleFarmIds("SUPER_ADMIN", null)).toBeNull()
    expect(getAccessibleFarmIds("OWNER", null)).toBeNull()
    expect(getAccessibleFarmIds("MANAGER", null, "canRead")).toBeNull()
  })

  it("filtre les fermes selon le droit demande", () => {
    const farmPermissions = [
      { farmId: "farm-1", canRead: true, canWrite: false, canDelete: false },
      { farmId: "farm-2", canRead: true, canWrite: true, canDelete: false },
      { farmId: "farm-3", canRead: false, canWrite: false, canDelete: false },
    ]

    expect(getAccessibleFarmIds("TECHNICIAN", farmPermissions, "canRead")).toEqual([
      "farm-1",
      "farm-2",
    ])
    expect(getAccessibleFarmIds("TECHNICIAN", farmPermissions, "canWrite")).toEqual([
      "farm-2",
    ])
  })

  it("genere le prochain numero de lot a partir du dernier numero connu", () => {
    expect(getNextBatchNumber(2026, null)).toBe("SF-2026-001")
    expect(getNextBatchNumber(2026, "SF-2026-009")).toBe("SF-2026-010")
    expect(getNextBatchNumber(2026, "SF-2026-999")).toBe("SF-2026-1000")
    expect(getNextBatchNumber(2026, "SF-2025-014")).toBe("SF-2026-001")
  })
})
