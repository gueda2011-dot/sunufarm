import Image from "next/image"
import { cn } from "@/src/lib/utils"
import { SUNUFARM_LOGO_PUBLIC_PATH } from "@/src/lib/branding"

interface SunuFarmLogoProps {
  className?: string
  priority?: boolean
}

export function SunuFarmLogo({ className, priority = false }: SunuFarmLogoProps) {
  return (
    <Image
      src={SUNUFARM_LOGO_PUBLIC_PATH}
      alt="SunuFarm"
      width={1536}
      height={1024}
      priority={priority}
      className={cn("h-auto w-32", className)}
    />
  )
}
