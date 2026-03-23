import Link from "next/link"

interface ModulePlaceholderProps {
  title: string
  description: string
  message: string
  primaryHref?: string
  primaryLabel?: string
  secondaryHref?: string
  secondaryLabel?: string
}

export function ModulePlaceholder({
  title,
  description,
  message,
  primaryHref = "/dashboard",
  primaryLabel = "Retour au tableau de bord",
  secondaryHref,
  secondaryLabel,
}: ModulePlaceholderProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>

      <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
        <p className="mx-auto max-w-xl text-sm leading-6 text-gray-500">{message}</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={primaryHref}
            className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-700"
          >
            {primaryLabel}
          </Link>

          {secondaryHref && secondaryLabel && (
            <Link
              href={secondaryHref}
              className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
            >
              {secondaryLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
