import { LogOut } from "lucide-react"
import { signOut } from "@/src/auth"
import { Button } from "@/src/components/ui/button"

export function AdminSignOutButton() {
  return (
    <form
      action={async () => {
        "use server"
        await signOut({ redirectTo: "/login" })
      }}
    >
      <Button
        type="submit"
        variant="outline"
        className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
      >
        <LogOut className="mr-2 h-4 w-4" />
        Se deconnecter
      </Button>
    </form>
  )
}
