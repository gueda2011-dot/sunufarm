import Image from "next/image"
import { cn } from "@/src/lib/utils"
import { SUNUFARM_ICON_PUBLIC_PATH } from "@/src/lib/branding"

interface SunuFarmLogoProps {
  className?: string
  iconClassName?: string
  textClassName?: string
  showText?: boolean
  layout?: "horizontal" | "stacked"
  priority?: boolean
}

export function SunuFarmLogo({
  className,
  iconClassName,
  textClassName,
  showText = true,
  layout = "horizontal",
  priority = false,
}: SunuFarmLogoProps) {
  return (
    <div
      className={cn(
        "flex items-center",
        layout === "stacked" ? "flex-col gap-3" : "gap-3",
        className,
      )}
    >
      <Image
        src={SUNUFARM_ICON_PUBLIC_PATH}
        alt="SunuFarm"
        width={300}
        height={270}
        priority={priority}
        className={cn("h-auto w-14 shrink-0", iconClassName)}
      />
      {showText ? (
        <span
          className={cn(
            "text-3xl font-semibold italic tracking-tight text-neutral-900",
            textClassName,
          )}
        >
          SunuFarm
        </span>
      ) : null}
    </div>
  )
}
