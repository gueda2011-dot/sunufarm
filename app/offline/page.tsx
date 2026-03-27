import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Hors ligne",
}

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <div className="rounded-3xl border border-orange-200 bg-orange-50 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-700">
          Hors ligne
        </p>
        <h1 className="mt-3 text-3xl font-bold text-gray-900">
          La connexion internet est indisponible
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Vous pouvez revenir aux ecrans deja ouverts ou reessayer quand le reseau revient.
          Les brouillons locaux restent disponibles.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-xl bg-green-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-green-700"
          >
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    </div>
  )
}
