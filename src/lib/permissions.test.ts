import { describe, expect, it } from "vitest"
import { UserRole } from "@/src/generated/prisma/client"
import {
  canAccessFarm,
  canPerformAction,
  getDefaultModulesForRole,
  getEffectiveModulePermissions,
  hasMinimumRole,
  hasModuleAccess,
  parseFarmPermissions,
  parseModulePermissions,
} from "@/src/lib/permissions"

describe("permissions", () => {
  it("respecte la hierarchie de roles pour les comparaisons generales", () => {
    expect(hasMinimumRole(UserRole.OWNER, UserRole.MANAGER)).toBe(true)
    expect(hasMinimumRole(UserRole.VIEWER, UserRole.MANAGER)).toBe(false)
  })

  it("applique la matrice explicite des actions metier", () => {
    expect(canPerformAction(UserRole.MANAGER, "CREATE_BATCH")).toBe(true)
    expect(canPerformAction(UserRole.TECHNICIAN, "CREATE_BATCH")).toBe(false)
    expect(canPerformAction(UserRole.ACCOUNTANT, "CREATE_EXPENSE")).toBe(true)
  })

  it("retourne les modules par defaut d un role", () => {
    expect(getDefaultModulesForRole(UserRole.TECHNICIAN)).toEqual([
      "DASHBOARD",
      "DAILY",
      "BATCHES",
      "FARMS",
      "EGGS",
      "STOCK",
      "HEALTH",
    ])
  })

  it("parse proprement les permissions de module", () => {
    expect(parseModulePermissions(null)).toBeNull()
    expect(parseModulePermissions("REPORTS")).toEqual([])
    expect(parseModulePermissions(["REPORTS", "TEAM", "REPORTS", "FAKE"])).toEqual([
      "REPORTS",
      "TEAM",
    ])
  })

  it("calcule les permissions effectives selon le role et le custom override", () => {
    expect(getEffectiveModulePermissions(UserRole.OWNER, [])).toContain("SETTINGS")
    expect(getEffectiveModulePermissions(UserRole.ACCOUNTANT, null)).toEqual([
      "DASHBOARD",
      "SALES",
      "CUSTOMERS",
      "SUPPLIERS",
      "PURCHASES",
      "FINANCES",
      "REPORTS",
    ])
    expect(getEffectiveModulePermissions(UserRole.TECHNICIAN, ["HEALTH"])).toEqual([
      "DASHBOARD",
      "HEALTH",
    ])
  })

  it("verifie l acces a un module cible", () => {
    expect(hasModuleAccess(UserRole.MANAGER, null, "TEAM")).toBe(true)
    expect(hasModuleAccess(UserRole.DATA_ENTRY, null, "REPORTS")).toBe(false)
    expect(hasModuleAccess(UserRole.TECHNICIAN, ["HEALTH"], "HEALTH")).toBe(true)
  })

  it("parse strictement les permissions de ferme", () => {
    expect(
      parseFarmPermissions([
        { farmId: "farm-1", canRead: true, canWrite: false, canDelete: false },
        { farmId: "farm-2", canRead: "yes", canWrite: true, canDelete: false },
      ]),
    ).toEqual([
      { farmId: "farm-1", canRead: true, canWrite: false, canDelete: false },
    ])
  })

  it("applique les regles d acces par ferme selon le role et le droit", () => {
    const farmPermissions = [
      { farmId: "farm-1", canRead: true, canWrite: false, canDelete: false },
      { farmId: "farm-2", canRead: true, canWrite: true, canDelete: false },
    ]

    expect(canAccessFarm(UserRole.OWNER, [], "farm-9")).toBe(true)
    expect(canAccessFarm(UserRole.MANAGER, [], "farm-9", "canRead")).toBe(true)
    expect(canAccessFarm(UserRole.MANAGER, farmPermissions, "farm-2", "canWrite")).toBe(true)
    expect(canAccessFarm(UserRole.MANAGER, farmPermissions, "farm-1", "canWrite")).toBe(false)
    expect(canAccessFarm(UserRole.TECHNICIAN, farmPermissions, "farm-2", "canWrite")).toBe(true)
    expect(canAccessFarm(UserRole.TECHNICIAN, farmPermissions, "farm-3")).toBe(false)
  })
})
