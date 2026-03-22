import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Connexion | SunuFarm",
}

/**
 * Layout des pages publiques (login, mot de passe oublié, etc.)
 *
 * Structure :
 *   - Fond gris-50 pleine page
 *   - Colonne centrée (vertical + horizontal)
 *   - Logo SunuFarm en haut
 *   - Aucune navigation — les visiteurs non connectés ne voient pas le sidebar
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      {/* Logo SunuFarm */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-600 shadow-sm">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-7 w-7 text-white"
            aria-hidden="true"
          >
            {/* Icône poulet stylisé */}
            <path
              d="M12 3C9 3 6 5 6 8c0 2 1 3.5 2.5 4.5L8 18h8l-.5-5.5C17 11.5 18 10 18 8c0-3-3-5-6-5z"
              fill="currentColor"
              opacity="0.9"
            />
            <circle cx="10" cy="7" r="1" fill="white" />
            <path d="M9 18h6v1.5a1 1 0 01-1 1h-4a1 1 0 01-1-1V18z" fill="currentColor" opacity="0.7" />
          </svg>
        </div>
        <span className="text-2xl font-bold tracking-tight text-gray-900">
          SunuFarm
        </span>
        <span className="text-sm text-gray-500">
          Gérez votre ferme. Gagnez plus.
        </span>
      </div>

      {/* Contenu de la page (formulaire, etc.) */}
      <div className="w-full max-w-[420px]">{children}</div>
    </div>
  )
}
