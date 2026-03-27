import { describe, expect, it } from "vitest"
import {
  getEffectiveModulePermissions,
  hasModuleAccess,
  canAccessFarm,
  canPerformAction,
  parseFarmPermissions,
} from "@/src/lib/permissions"

describe("permissions", () => {
  it("autorise explicitement la creation de lot pour un manager", () => {
    expect(canPerformAction("MANAGER", "CREATE_BATCH")).toBe(true)
    expect(canPerformAction("DATA_ENTRY", "CREATE_BATCH")).toBe(false)
  })

  it("parse proprement les permissions de ferme", () => {
    const parsed = parseFarmPermissions([
      { farmId: "farm-1", canRead: true, canWrite: false, canDelete: false },
      { farmId: 4, canRead: true, canWrite: true, canDelete: false },
    ])

    expect(parsed).toEqual([
      { farmId: "farm-1", canRead: true, canWrite: false, canDelete: false },
    ])
  })

  it("respecte les droits ecriture selon le JSON de permissions", () => {
    const permissions = [
      { farmId: "farm-1", canRead: true, canWrite: true, canDelete: false },
    ]

    expect(canAccessFarm("TECHNICIAN", permissions, "farm-1", "canWrite")).toBe(true)
    expect(canAccessFarm("TECHNICIAN", permissions, "farm-2", "canWrite")).toBe(false)
  })

  it("applique les modules par defaut du role data entry", () => {
    expect(getEffectiveModulePermissions("DATA_ENTRY", null)).toEqual([
      "DASHBOARD",
      "DAILY",
      "BATCHES",
      "FARMS",
    ])
    expect(hasModuleAccess("DATA_ENTRY", null, "PURCHASES")).toBe(false)
  })

  it("respecte une personnalisation explicite des modules", () => {
    const customModules = ["DASHBOARD", "DAILY", "CUSTOMERS"]

    expect(getEffectiveModulePermissions("DATA_ENTRY", customModules)).toEqual(customModules)
    expect(hasModuleAccess("DATA_ENTRY", customModules, "CUSTOMERS")).toBe(true)
    expect(hasModuleAccess("DATA_ENTRY", customModules, "PURCHASES")).toBe(false)
  })
})
