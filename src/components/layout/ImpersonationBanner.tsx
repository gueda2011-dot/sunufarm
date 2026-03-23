"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { stopImpersonation } from "@/src/actions/admin"

interface ImpersonationBannerProps {
  organizationName: string
  targetUserName: string | null
  targetUserEmail: string | null
}

export function ImpersonationBanner({
  organizationName,
  targetUserName,
  targetUserEmail,
}: ImpersonationBannerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const targetLabel = targetUserName?.trim()
    ? `${targetUserName} (${targetUserEmail ?? "email inconnu"})`
    : (targetUserEmail ?? "Utilisateur cible")

  return (
    <div className="border-b border-amber-300 bg-amber-100">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 text-sm text-amber-950 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <p className="font-semibold">Mode impersonation actif</p>
          <p className="mt-1 truncate text-amber-900">
            Vous agissez en tant que {targetLabel} dans {organizationName}.
          </p>
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await stopImpersonation()
              router.push("/admin")
              router.refresh()
            })
          }}
          className="shrink-0 rounded-full border border-amber-400 bg-white px-4 py-2 font-medium text-amber-900 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Arret..." : "Quitter l'impersonation"}
        </button>
      </div>
    </div>
  )
}
