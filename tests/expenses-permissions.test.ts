import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  requireOrganizationModuleContextMock,
  requireRoleMock,
  expenseCreateMock,
  batchFindFirstMock,
  farmFindFirstMock,
  createAuditLogMock,
} = vi.hoisted(() => ({
  requireOrganizationModuleContextMock: vi.fn(),
  requireRoleMock: vi.fn(),
  expenseCreateMock: vi.fn(),
  batchFindFirstMock: vi.fn(),
  farmFindFirstMock: vi.fn(),
  createAuditLogMock: vi.fn(),
}))

vi.mock("@/src/lib/auth", () => ({
  requireOrganizationModuleContext: requireOrganizationModuleContextMock,
  requireRole: requireRoleMock,
}))

vi.mock("@/src/lib/prisma", () => ({
  default: {
    batch: { findFirst: batchFindFirstMock },
    farm: { findFirst: farmFindFirstMock },
    expense: { create: expenseCreateMock },
  },
}))

vi.mock("@/src/lib/audit", () => ({
  createAuditLog: createAuditLogMock,
  AuditAction: {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
  },
}))

import { createExpense } from "@/src/actions/expenses"

const USER_ID = "clw8user0000000000000001"
const ORG_ID = "clw8orga0000000000000001"

function buildExpenseInput() {
  return {
    organizationId: ORG_ID,
    date: new Date("2026-03-28T00:00:00.000Z"),
    description: "Achat aliment demarrage",
    amountFcfa: 25000,
  }
}

describe("createExpense permissions flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("refuse des donnees invalides avant toute verification d acces", async () => {
    const result = await createExpense({ organizationId: ORG_ID })

    expect(result).toEqual({
      success: false,
      error: "Données invalides",
    })
    expect(requireOrganizationModuleContextMock).not.toHaveBeenCalled()
    expect(requireRoleMock).not.toHaveBeenCalled()
  })

  it("propage un refus de module depuis le contexte organisation", async () => {
    requireOrganizationModuleContextMock.mockResolvedValue({
      success: false,
      error: "Acces refuse au module FINANCES.",
      code: "MODULE_ACCESS_DENIED",
    })

    const result = await createExpense(buildExpenseInput())

    expect(result).toEqual({
      success: false,
      error: "Acces refuse au module FINANCES.",
      code: "MODULE_ACCESS_DENIED",
    })
    expect(requireRoleMock).not.toHaveBeenCalled()
    expect(expenseCreateMock).not.toHaveBeenCalled()
  })

  it("propage un refus de role avant toute mutation", async () => {
    requireOrganizationModuleContextMock.mockResolvedValue({
      success: true,
      data: {
        session: { user: { id: USER_ID } },
        membership: { role: "DATA_ENTRY" },
      },
    })
    requireRoleMock.mockReturnValue({
      success: false,
      error: "Permission refusée",
      code: "ROLE_DENIED",
    })

    const result = await createExpense(buildExpenseInput())

    expect(result).toEqual({
      success: false,
      error: "Permission refusée",
      code: "ROLE_DENIED",
    })
    expect(expenseCreateMock).not.toHaveBeenCalled()
    expect(createAuditLogMock).not.toHaveBeenCalled()
  })

  it("cree la depense quand module et role sont autorises", async () => {
    requireOrganizationModuleContextMock.mockResolvedValue({
      success: true,
      data: {
        session: { user: { id: USER_ID } },
        membership: { role: "ACCOUNTANT" },
      },
    })
    requireRoleMock.mockReturnValue({
      success: true,
      data: undefined,
    })

    const createdExpense = {
      id: "clw8expn0000000000000001",
      organizationId: ORG_ID,
      batchId: null,
      farmId: null,
      categoryId: null,
      date: new Date("2026-03-28T00:00:00.000Z"),
      description: "Achat aliment demarrage",
      amountFcfa: 25000,
      supplierId: null,
      reference: null,
      createdAt: new Date("2026-03-28T10:00:00.000Z"),
      category: null,
      notes: null,
      purchaseId: null,
      createdById: USER_ID,
      updatedAt: new Date("2026-03-28T10:00:00.000Z"),
    }

    expenseCreateMock.mockResolvedValue(createdExpense)

    const result = await createExpense(buildExpenseInput())

    expect(result).toEqual({
      success: true,
      data: createdExpense,
    })
    expect(expenseCreateMock).toHaveBeenCalledTimes(1)
    expect(createAuditLogMock).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: ORG_ID,
      action: "CREATE",
      resourceType: "EXPENSE",
      resourceId: createdExpense.id,
      after: {
        batchId: undefined,
        farmId: undefined,
        date: new Date("2026-03-28T00:00:00.000Z"),
        description: "Achat aliment demarrage",
        amountFcfa: 25000,
      },
    })
  })
})
