import type { Metadata } from "next"
import { SunuFarmLogo } from "@/src/components/branding/SunuFarmLogo"

export const metadata: Metadata = {
  title: "Connexion | SunuFarm",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-2">
        <SunuFarmLogo
          layout="stacked"
          priority
          iconClassName="w-28"
          textClassName="text-5xl"
        />
        <span className="text-sm text-gray-500">
          Gere ta ferme. Gagne plus.
        </span>
      </div>

      <div className="w-full max-w-[420px]">{children}</div>
    </div>
  )
}
