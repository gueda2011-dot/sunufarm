import { describe, expect, it } from "vitest"
import { createOfflineCommand } from "@/src/lib/offline/sync/commands"

describe("createOfflineCommand", () => {
  it("normalise une commande de synchronisation locale-first", () => {
    const command = createOfflineCommand({
      organizationId: "org-1",
      entityType: "sale",
      scope: "sales",
      action: "CREATE_SALE",
      localId: "sale:local-1",
      payload: {
        productType: "OEUF",
        saleDate: "2026-04-11",
      },
      label: "Vente oeufs",
    })

    expect(command).toMatchObject({
      id: "sales:CREATE_SALE:sale:local-1",
      organizationId: "org-1",
      entityType: "sale",
      scope: "sales",
      action: "CREATE_SALE",
      localId: "sale:local-1",
      status: "pending",
      retryCount: 0,
      maxRetries: 5,
      label: "Vente oeufs",
    })
    expect(command.createdAt).toBeTruthy()
    expect(command.updatedAt).toBeTruthy()
  })
})
