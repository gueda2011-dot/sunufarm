import { ArrowLeftRight } from "lucide-react"
import { stopAdminImpersonation } from "@/src/actions/admin-impersonation"
import { Button } from "@/src/components/ui/button"

interface ImpersonationBannerProps {
  adminName: string | null
  adminEmail: string
  targetName: string | null
  targetEmail: string
}

export function ImpersonationBanner({
  adminName,
  adminEmail,
  targetName,
  targetEmail,
}: ImpersonationBannerProps) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 text-sm text-amber-900">
          <ArrowLeftRight className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold">
              Impersonation active
            </p>
            <p className="mt-1 text-amber-800">
              Tu navigues comme {targetName || targetEmail}. Retour admin possible a tout moment.
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Session d&apos;origine: {adminName || adminEmail}
            </p>
          </div>
        </div>

        <form
          action={async () => {
            "use server"
            await stopAdminImpersonation()
          }}
        >
          <Button type="submit" variant="outline" className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100">
            Revenir a l&apos;admin
          </Button>
        </form>
      </div>
    </div>
  )
}
