import { NextResponse } from "next/server"
import { auth } from "@/src/auth"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) {
    return NextResponse.json({ error: "NO_ACTIVE_ORGANIZATION" }, { status: 404 })
  }

  return NextResponse.json({
    userId: session.user.id,
    organizationId: activeMembership.organizationId,
    userRole: activeMembership.role,
    farmPermissions: activeMembership.farmPermissions ?? [],
    modulePermissions: activeMembership.modulePermissions ?? null,
    organizationName: activeMembership.organization.name,
    savedAt: new Date().toISOString(),
  })
}

