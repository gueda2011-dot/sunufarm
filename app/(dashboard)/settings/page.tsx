import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Parametres" }

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Parametres</h1>
        <p className="mt-1 text-sm text-gray-500">
          Referentiels et configuration generale de SunuFarm.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/settings/strains"
          className="rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-green-200 hover:shadow-sm"
        >
          <h2 className="text-base font-semibold text-gray-900">
            Souches avicoles
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Gerer le referentiel des souches de volaille utilisees par les lots.
          </p>
        </Link>

        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">
            Autres reglages
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Les preferences d&apos;organisation et les reglages avances seront
            ajoutes dans une prochaine iteration.
          </p>
        </div>
      </div>
    </div>
  )
}
