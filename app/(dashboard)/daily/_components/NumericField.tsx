"use client"

/**
 * SunuFarm — Champ numérique optimisé mobile
 *
 * Choix techniques :
 *   type="text" + inputMode  →  clavier numérique natif sans les bugs de
 *                                type="number" (scroll qui change la valeur,
 *                                flèches visibles, comportement locale-dépendant)
 *   text-3xl font-semibold   →  valeur très lisible d'un coup d'œil sur terrain
 *   h-[64px]                 →  touch target > 52px (règle SunuFarm)
 *   integer prop             →  inputMode="numeric" (clavier sans virgule)
 *                               sinon inputMode="decimal" (avec virgule)
 */

import * as React from "react"
import { cn }     from "@/src/lib/utils"

export interface NumericFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  id:       string
  label:    string
  unit?:    string
  error?:   string
  /** true = inputMode numeric (entiers), false = decimal (décimaux) */
  integer?: boolean
}

export const NumericField = React.forwardRef<HTMLInputElement, NumericFieldProps>(
  (
    { id, label, unit, error, integer = false, className, disabled, ...props },
    ref,
  ) => {
    return (
      <div className="w-full space-y-1.5">
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
        </label>

        <div
          className={cn(
            "flex items-center rounded-xl border bg-white transition-colors",
            error
              ? "border-red-500 focus-within:ring-2 focus-within:ring-red-500"
              : "border-gray-300 focus-within:ring-2 focus-within:ring-green-600 focus-within:border-transparent",
            disabled && "opacity-50 bg-gray-50 cursor-not-allowed",
          )}
        >
          <input
            ref={ref}
            id={id}
            type="text"
            inputMode={integer ? "numeric" : "decimal"}
            pattern={integer ? "[0-9]*" : "[0-9]*\\.?[0-9]*"}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={disabled}
            className={cn(
              "flex-1 min-w-0 h-[64px] px-4 bg-transparent",
              "text-3xl font-semibold text-gray-900 placeholder:text-gray-300",
              "focus:outline-none disabled:cursor-not-allowed",
              className,
            )}
            {...props}
          />

          {unit && (
            <span className="pr-4 text-base font-medium text-gray-400 select-none whitespace-nowrap">
              {unit}
            </span>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)
NumericField.displayName = "NumericField"
