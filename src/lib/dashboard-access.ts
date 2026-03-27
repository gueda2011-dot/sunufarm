import { redirect } from "next/navigation"
import type { UserRole } from "@/src/generated/prisma/client"
import { hasModuleAccess, type AppModule } from "@/src/lib/permissions"

interface MembershipAccessLike {
  role: UserRole
  modulePermissions: unknown
}

export function ensureModuleAccess(
  membership: MembershipAccessLike,
  module: AppModule,
) {
  if (!hasModuleAccess(membership.role, membership.modulePermissions, module)) {
    redirect("/dashboard")
  }
}
