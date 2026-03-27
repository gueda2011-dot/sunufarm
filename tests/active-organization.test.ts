import { describe, expect, it } from "vitest"
import {
  pickActiveMembership,
  type OrganizationMembershipSummary,
} from "@/src/lib/active-organization"

const memberships: OrganizationMembershipSummary[] = [
  {
    organizationId: "org-a",
    role: "OWNER",
    organization: { id: "org-a", name: "Alpha" },
  },
  {
    organizationId: "org-b",
    role: "MANAGER",
    organization: { id: "org-b", name: "Beta" },
  },
]

describe("pickActiveMembership", () => {
  it("retourne l'organisation preferee quand elle existe", () => {
    expect(pickActiveMembership(memberships, "org-b")?.organizationId).toBe("org-b")
  })

  it("retourne la premiere organisation si la preference est absente", () => {
    expect(pickActiveMembership(memberships, "org-c")?.organizationId).toBe("org-a")
  })

  it("retourne null quand aucune organisation n'est disponible", () => {
    expect(pickActiveMembership([], "org-a")).toBeNull()
  })
})
