import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  requireSessionMock,
  requireMembershipMock,
  formDraftFindUniqueMock,
  formDraftUpsertMock,
  formDraftDeleteManyMock,
} = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  formDraftFindUniqueMock: vi.fn(),
  formDraftUpsertMock: vi.fn(),
  formDraftDeleteManyMock: vi.fn(),
}))

vi.mock("@/src/lib/auth", () => ({
  requireSession: requireSessionMock,
  requireMembership: requireMembershipMock,
}))

vi.mock("@/src/lib/prisma", () => ({
  default: {
    formDraft: {
      findUnique: formDraftFindUniqueMock,
      upsert: formDraftUpsertMock,
      deleteMany: formDraftDeleteManyMock,
    },
  },
}))

import { clearFormDraft, getFormDraft, saveFormDraft } from "@/src/actions/form-drafts"

const USER_ID = "clw8user0000000000000001"
const ORG_ID = "clw8orga0000000000000001"

describe("form drafts actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("propage l erreur d authentification", async () => {
    requireSessionMock.mockResolvedValue({
      success: false,
      error: "Authentification requise",
      code: "UNAUTHENTICATED",
    })

    const result = await getFormDraft({ formKey: "create-batch:org-a", organizationId: ORG_ID })

    expect(result).toEqual({
      success: false,
      error: "Authentification requise",
      code: "UNAUTHENTICATED",
    })
    expect(requireMembershipMock).not.toHaveBeenCalled()
  })

  it("refuse un organizationId non accessible au moment d enregistrer", async () => {
    requireSessionMock.mockResolvedValue({
      success: true,
      data: { user: { id: USER_ID } },
    })
    requireMembershipMock.mockResolvedValue({
      success: false,
      error: "Acces refuse a cette organisation",
      code: "ORG_ACCESS_DENIED",
    })

    const result = await saveFormDraft({
      formKey: "create-batch:org-a",
      organizationId: ORG_ID,
      title: "Nouveau lot",
      payload: { farmId: "farm-1" },
    })

    expect(result).toEqual({
      success: false,
      error: "Acces refuse a cette organisation",
      code: "ORG_ACCESS_DENIED",
    })
    expect(formDraftUpsertMock).not.toHaveBeenCalled()
  })

  it("charge un brouillon quand l organisation est accessible", async () => {
    const updatedAt = new Date("2026-03-28T22:00:00.000Z")

    requireSessionMock.mockResolvedValue({
      success: true,
      data: { user: { id: USER_ID } },
    })
    requireMembershipMock.mockResolvedValue({
      success: true,
      data: { userId: USER_ID, organizationId: ORG_ID, role: "OWNER" },
    })
    formDraftFindUniqueMock.mockResolvedValue({
      formKey: "create-batch:org-a",
      title: "Nouveau lot",
      payload: { farmId: "farm-1" },
      updatedAt,
    })

    const result = await getFormDraft({
      formKey: "create-batch:org-a",
      organizationId: ORG_ID,
    })

    expect(result).toEqual({
      success: true,
      data: {
        formKey: "create-batch:org-a",
        title: "Nouveau lot",
        payload: { farmId: "farm-1" },
        updatedAt,
      },
    })
  })

  it("supprime un brouillon quand l organisation est accessible", async () => {
    requireSessionMock.mockResolvedValue({
      success: true,
      data: { user: { id: USER_ID } },
    })
    requireMembershipMock.mockResolvedValue({
      success: true,
      data: { userId: USER_ID, organizationId: ORG_ID, role: "OWNER" },
    })
    formDraftDeleteManyMock.mockResolvedValue({ count: 1 })

    const result = await clearFormDraft({
      formKey: "create-batch:org-a",
      organizationId: ORG_ID,
    })

    expect(result).toEqual({
      success: true,
      data: undefined,
    })
    expect(formDraftDeleteManyMock).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        formKey: "create-batch:org-a",
      },
    })
  })
})
