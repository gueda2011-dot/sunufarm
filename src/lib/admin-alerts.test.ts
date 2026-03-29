import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getServerEnvMock,
  findManyMock,
} = vi.hoisted(() => ({
  getServerEnvMock: vi.fn(),
  findManyMock: vi.fn(),
}))

vi.mock("@/src/lib/env", () => ({
  getServerEnv: getServerEnvMock,
}))

vi.mock("@/src/lib/prisma", () => ({
  default: {
    userOrganization: {
      findMany: findManyMock,
    },
  },
}))

vi.mock("@/src/lib/email", () => ({
  getAppBaseUrl: () => "https://app.sunufarm.test",
  isEmailDeliveryConfigured: () => true,
  sendTransactionalEmail: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/src/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import { getAdminBaseUrl, resolveAdminAlertRecipients } from "@/src/lib/admin-alerts"

describe("admin alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("priorise les emails configures par variable d environnement", async () => {
    getServerEnvMock.mockReturnValue({
      ADMIN_ALERT_EMAILS: "owner@sunu.test, admin@sunu.test ; owner@sunu.test",
    })

    const recipients = await resolveAdminAlertRecipients()

    expect(recipients).toEqual([
      { email: "owner@sunu.test", name: "Admin" },
      { email: "admin@sunu.test", name: "Admin" },
    ])
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it("retombe sur les super admins si aucune variable n est definie", async () => {
    getServerEnvMock.mockReturnValue({
      ADMIN_ALERT_EMAILS: undefined,
    })
    findManyMock.mockResolvedValue([
      { user: { email: "owner@sunu.test", name: "Owner" } },
      { user: { email: "OWNER@SUNU.TEST", name: "Owner 2" } },
      { user: { email: "admin@sunu.test", name: null } },
    ])

    const recipients = await resolveAdminAlertRecipients()

    expect(recipients).toEqual([
      { email: "owner@sunu.test", name: "Owner" },
      { email: "admin@sunu.test", name: "Admin" },
    ])
  })

  it("construit une url admin absolue", () => {
    expect(getAdminBaseUrl("/admin")).toBe("https://app.sunufarm.test/admin")
  })
})
