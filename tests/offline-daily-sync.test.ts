import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildDailyServerPayload } from "@/src/lib/offline/sync/daily"

const { findServerIdMock } = vi.hoisted(() => ({
  findServerIdMock: vi.fn(),
}))

vi.mock("@/src/lib/offline/sync/mappings", () => ({
  findServerId: findServerIdMock,
}))

describe("buildDailyServerPayload", () => {
  beforeEach(() => {
    findServerIdMock.mockReset()
  })

  it("normalise le payload daily avant envoi serveur", async () => {
    findServerIdMock.mockImplementation(async (entityType: string, localId: string) => {
      if (entityType === "batch" && localId === "batch:local-1") {
        return "cm9s8w0m50001abcd1234efg"
      }

      if (entityType === "stock_item" && localId === "stock:local-1") {
        return "cm9s8w0m50002abcd1234efg"
      }

      return null
    })

    const { serverPayload, debug } = await buildDailyServerPayload({
      clientMutationId: "daily:local-1",
      organizationId: "org-1",
      batchId: "batch:local-1",
      dateIso: "2026-04-11T00:00:00.000Z",
      mortality: 3,
      feedKg: 12.5,
      feedStockId: "stock:local-1",
      waterLiters: 30,
      avgWeightG: 1450,
      observations: "RAS",
      temperatureMin: 23,
      temperatureMax: 31,
      humidity: 74,
    })

    expect(serverPayload).toMatchObject({
      clientMutationId: "daily:local-1",
      organizationId: "org-1",
      batchId: "cm9s8w0m50001abcd1234efg",
      feedStockId: "cm9s8w0m50002abcd1234efg",
      mortality: 3,
      feedKg: 12.5,
      waterLiters: 30,
      avgWeightG: 1450,
      observations: "RAS",
      temperatureMin: 23,
      temperatureMax: 31,
      humidity: 74,
    })
    expect(serverPayload.date).toBeInstanceOf(Date)
    expect(serverPayload.date.toISOString()).toBe("2026-04-11T00:00:00.000Z")
    expect(debug.originalPayload.batchId).toBe("batch:local-1")
    expect(debug.mappedPayload.batchId).toBe("cm9s8w0m50001abcd1234efg")
  })

  it("rejette un payload invalide avant l'appel serveur", async () => {
    findServerIdMock.mockResolvedValue("cm9s8w0m50001abcd1234efg")

    await expect(buildDailyServerPayload({
      clientMutationId: "daily:local-1",
      organizationId: "org-1",
      batchId: "batch:local-1",
      dateIso: "not-a-date",
      mortality: -1,
      feedKg: 12.5,
    })).rejects.toThrow()
  })

  it("accepte un ancien payload sans clientMutationId ni dateIso", async () => {
    findServerIdMock.mockImplementation(async (entityType: string, localId: string) => {
      if (entityType === "batch" && localId === "batch:legacy-1") {
        return "cm9s8w0m50003abcd1234efg"
      }

      return null
    })

    const { serverPayload } = await buildDailyServerPayload({
      organizationId: "org-1",
      batchId: "batch:legacy-1",
      date: "2026-04-10T00:00:00.000Z",
      mortality: 1,
      feedKg: 8,
    }, {
      fallbackLocalId: "cmnn428ci000ixov3yh5imo0p",
    })

    expect(serverPayload.clientMutationId).toBe("cmnn428ci000ixov3yh5imo0p")
    expect(serverPayload.batchId).toBe("cm9s8w0m50003abcd1234efg")
    expect(serverPayload.date.toISOString()).toBe("2026-04-10T00:00:00.000Z")
  })
})
