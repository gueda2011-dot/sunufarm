"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"
import { selectActiveOrganization } from "@/src/actions/organization-context"
import type { OrganizationMembershipSummary } from "@/src/lib/active-organization"

interface OrganizationSwitcherProps {
  memberships: OrganizationMembershipSummary[]
  activeOrganizationId: string
}

export function OrganizationSwitcher({
  memberships,
  activeOrganizationId,
}: OrganizationSwitcherProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (memberships.length <= 1) {
    return null
  }

  return (
    <label className="flex min-w-0 items-center gap-2 text-xs text-gray-500">
      <span className="hidden sm:inline">Organisation</span>
      <select
        aria-label="Changer d'organisation"
        className="max-w-[190px] rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100 disabled:opacity-60"
        disabled={isPending}
        value={activeOrganizationId}
        onChange={(event) => {
          const nextOrganizationId = event.target.value

          startTransition(async () => {
            const result = await selectActiveOrganization({
              organizationId: nextOrganizationId,
            })

            if (!result.success) {
              toast.error(result.error)
              return
            }

            toast.success("Organisation active mise a jour")
            router.refresh()
          })
        }}
      >
        {memberships.map((membership) => (
          <option key={membership.organizationId} value={membership.organizationId}>
            {membership.organization.name}
          </option>
        ))}
      </select>
    </label>
  )
}
