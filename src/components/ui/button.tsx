import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/src/lib/utils"

const buttonVariants = cva(
  // Base — taille de toucher min 52px sur mobile (règle SunuFarm)
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-600",
        secondary:
          "bg-orange-600 text-white hover:bg-orange-700 focus-visible:ring-orange-600",
        outline:
          "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-400",
        ghost:
          "text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-400",
        danger:
          "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
        link:
          "text-green-600 underline-offset-4 hover:underline focus-visible:ring-green-600",
      },
      size: {
        default: "h-[52px] px-6 text-base",   // 52px — règle terrain SunuFarm
        sm:      "h-10 px-4 text-sm",
        lg:      "h-14 px-8 text-lg",
        icon:    "h-[52px] w-[52px]",
        "icon-sm": "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size:    "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Affiche un spinner et désactive le bouton pendant le chargement */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled ?? loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>Chargement…</span>
          </>
        ) : (
          children
        )}
      </button>
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
