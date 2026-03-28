import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  requireSessionMock,
  userOrganizationFindFirstMock,
  paymentTransactionFindUniqueMock,
  transactionPaymentUpdateMock,
  transactionSubscriptionPaymentUpdateMock,
  prismaTransactionMock,
  createAuditLogMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  userOrganizationFindFirstMock: vi.fn(),
  paymentTransactionFindUniqueMock: vi.fn(),
  transactionPaymentUpdateMock: vi.fn(),
  transactionSubscriptionPaymentUpdateMock: vi.fn(),
  prismaTransactionMock: vi.fn(),
  createAuditLogMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock("@/src/lib/auth", () => ({
  requireSession: requireSessionMock,
  requireOrganizationModuleContext: vi.fn(),
  requireRole: vi.fn(),
}))

vi.mock("@/src/lib/prisma", () => ({
  default: {
    userOrganization: { findFirst: userOrganizationFindFirstMock },
    paymentTransaction: { findUnique: paymentTransactionFindUniqueMock },
    $transaction: prismaTransactionMock,
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

import { adminRejectPaymentTransaction } from "@/src/actions/subscriptions"

const USER_ID = "clw8user0000000000000001"
const ORG_ID = "clw8orga0000000000000001"
const TRANSACTION_ID = "clw8txnx0000000000000001"
const SUBSCRIPTION_PAYMENT_ID = "clw8paym0000000000000001"

describe("adminRejectPaymentTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaTransactionMock.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => (
      callback({
        paymentTransaction: { update: transactionPaymentUpdateMock },
        subscriptionPayment: { update: transactionSubscriptionPaymentUpdateMock },
      })
    ))
  })

  it("propage l erreur d authentification", async () => {
    requireSessionMock.mockResolvedValue({
      success: false,
      error: "Authentification requise",
      code: "UNAUTHENTICATED",
    })

    const result = await adminRejectPaymentTransaction({ transactionId: TRANSACTION_ID })

    expect(result).toEqual({
      success: false,
      error: "Authentification requise",
      code: "UNAUTHENTICATED",
    })
    expect(userOrganizationFindFirstMock).not.toHaveBeenCalled()
  })

  it("refuse un utilisateur non super admin", async () => {
    requireSessionMock.mockResolvedValue({
      success: true,
      data: { user: { id: USER_ID } },
    })
    userOrganizationFindFirstMock.mockResolvedValue(null)

    const result = await adminRejectPaymentTransaction({ transactionId: TRANSACTION_ID })

    expect(result).toMatchObject({
      success: false,
      error: "Seul un super admin peut refuser une transaction.",
      code: "FORBIDDEN",
    })
    expect(paymentTransactionFindUniqueMock).not.toHaveBeenCalled()
  })

  it("retourne not found si la transaction n existe pas", async () => {
    requireSessionMock.mockResolvedValue({
      success: true,
      data: { user: { id: USER_ID } },
    })
    userOrganizationFindFirstMock.mockResolvedValue({ id: "membership-1" })
    paymentTransactionFindUniqueMock.mockResolvedValue(null)

    const result = await adminRejectPaymentTransaction({ transactionId: TRANSACTION_ID })

    expect(result).toMatchObject({
      success: false,
      error: "Transaction introuvable.",
      code: "TRANSACTION_NOT_FOUND",
    })
    expect(prismaTransactionMock).not.toHaveBeenCalled()
  })

  it("rejette la transaction, audite et revalide les pages sensibles", async () => {
    requireSessionMock.mockResolvedValue({
      success: true,
      data: { user: { id: USER_ID } },
    })
    userOrganizationFindFirstMock.mockResolvedValue({ id: "membership-1" })
    paymentTransactionFindUniqueMock.mockResolvedValue({
      id: TRANSACTION_ID,
      organizationId: ORG_ID,
      subscriptionPaymentId: SUBSCRIPTION_PAYMENT_ID,
    })

    const result = await adminRejectPaymentTransaction({ transactionId: TRANSACTION_ID })

    expect(result).toEqual({
      success: true,
      data: { transactionId: TRANSACTION_ID },
    })
    expect(prismaTransactionMock).toHaveBeenCalledTimes(1)
    expect(transactionPaymentUpdateMock).toHaveBeenCalledTimes(1)
    expect(transactionSubscriptionPaymentUpdateMock).toHaveBeenCalledTimes(1)
    expect(createAuditLogMock).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: ORG_ID,
      action: "UPDATE",
      resourceType: "PAYMENT_TRANSACTION",
      resourceId: TRANSACTION_ID,
      ipAddress: undefined,
      userAgent: undefined,
      after: { status: "REJECTED_MANUALLY" },
    })
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin")
    expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/organizations/${ORG_ID}`)
    expect(revalidatePathMock).toHaveBeenCalledWith("/settings")
  })
})
