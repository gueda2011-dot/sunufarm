import { LogIn } from "lucide-react"
import { startAdminImpersonation } from "@/src/actions/admin-impersonation"
import { Button } from "@/src/components/ui/button"

interface AdminImpersonateButtonProps {
  targetUserId: string
}

export function AdminImpersonateButton({
  targetUserId,
}: AdminImpersonateButtonProps) {
  return (
    <form
      action={async () => {
        "use server"
        await startAdminImpersonation(targetUserId)
      }}
    >
      <Button type="submit" variant="outline" className="w-full sm:w-auto">
        <LogIn className="mr-2 h-4 w-4" />
        Impersonner
      </Button>
    </form>
  )
}
