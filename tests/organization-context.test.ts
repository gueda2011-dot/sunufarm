import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  revalidatePathMock,
  cookiesSetMock,
  cookiesMock,
  requireSessionMock,
  getUserMembershipsMock,
} = vi.hoisted(() => ({
  ...(function createMocks() {
    const cookiesSetMock = vi.fn()

    return {
      revalidatePathMock: vi.fn(),
      cookiesSetMock,
      cookiesMock: vi.fn(async () => ({
        set: cookiesSetMock,
      })),
      requireSessionMock: vi.fn(),
      getUserMembershipsMock: vi.fn(),
    }
  })(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}))

vi.mock("@/src/lib/auth", () => ({
  requireSession: requireSessionMock,
}))

vi.mock("@/src/lib/active-organization", () => ({
  ACTIVE_ORG_COOKIE: "sunufarm_active_org",
  getUserMemberships: getUserMembershipsMock,
}))

import { selectActiveOrganization } from "@/src/actions/organization-context"

const USER_ID = "clw8user0000000000000001"
const ORG_A_ID = "clw8orga0000000000000001"
const ORG_B_ID = "clw8orgb0000000000000002"

describe("selectActiveOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("propage l erreur d authentification si la session est absente", async () => {
    requireSessionMock.mockResolvedValue({
      success: false,
      error: "Authentification requise",
      code: "UNAUTHENTICATED",
    })

    const result = await selectActiveOrganization({ organizationId: ORG_A_ID })

    expect(result).toEqual({
      success: false,
      error: "Authentification requise",
      code: "UNAUTHENTICATED",
    })
    expect(getUserMembershipsMock).not.toHaveBeenCalled()
    expect(cookiesSetMock).not.toHaveBeenCalled()
  })

  it("refuse une organisation invalide", async () => {
    requireSessionMock.mockResolvedValue({
      success: true,
      data: { user: { id: USER_ID } },
    })

    const result = await selectActiveOrganization({ organizationId: "" })

    expect(result).toEqual({
      success: false,
      error: "Organisation invalide",
    })
    expect(getUserMembershipsMock).not.toHaveBeenCalled()
    expect(cookiesSetMock).not.toHaveBeenCalled()
  })

  it("refuse de selectionner une organisation non accessible", async () => {
    requireSessionMock.mockResolvedValue({
      success: true,
      data: { user: { id: USER_ID } },
    })
    getUserMembershipsMock.mockResolvedValue([
      {
        organizationId: ORG_A_ID,
        role: "OWNER",
        modulePermissions: null,
        organization: { id: ORG_A_ID, name: "Alpha" },
      },
    ])

    const result = await selectActiveOrganization({ organizationId: ORG_B_ID })

    expect(result).toEqual({
      success: false,
      error: "Acces refuse a cette organisation",
    })
    expect(cookiesSetMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("enregistre le cookie et revalide le layout quand l organisation est accessible", async () => {
    requireSessionMock.mockResolvedValue({
      success: true,
      data: { user: { id: USER_ID } },
    })
    getUserMembershipsMock.mockResolvedValue([
      {
        organizationId: ORG_A_ID,
        role: "OWNER",
        modulePermissions: null,
        organization: { id: ORG_A_ID, name: "Alpha" },
      },
      {
        organizationId: ORG_B_ID,
        role: "MANAGER",
        modulePermissions: null,
        organization: { id: ORG_B_ID, name: "Beta" },
      },
    ])

    const result = await selectActiveOrganization({ organizationId: ORG_B_ID })

    expect(result).toEqual({
      success: true,
      data: { organizationId: ORG_B_ID },
    })
    expect(cookiesSetMock).toHaveBeenCalledWith("sunufarm_active_org", ORG_B_ID, {
      path: "/",
      sameSite: "lax",
      secure: false,
      maxAge: 60 * 60 * 24 * 180,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout")
  })
})
