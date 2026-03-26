import type { Metadata, Viewport } from "next"
import { Toaster } from "sonner"
import { QueryProvider } from "@/src/components/providers/QueryProvider"
import "./globals.css"

// ---------------------------------------------------------------------------
// Métadonnées globales SunuFarm
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: {
    default:  "SunuFarm — Gérez votre ferme. Gagnez plus.",
    template: "%s | SunuFarm",
  },
  description:
    "L'ERP avicole de référence pour l'Afrique francophone. " +
    "Gérez vos lots, suivez la rentabilité et prenez les bonnes décisions.",
  applicationName: "SunuFarm",
  keywords:        ["aviculture", "élevage", "ferme", "poules", "Sénégal", "FCFA"],
  authors:         [{ name: "SunuFarm" }],
}

export const viewport: Viewport = {
  width:           "device-width",
  initialScale:    1,
  maximumScale:    1,   // désactive le zoom navigateur (saisie terrain)
  themeColor:      "#16a34a",
}

// ---------------------------------------------------------------------------
// Root Layout
// ---------------------------------------------------------------------------

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="h-full bg-gray-50 text-gray-900">
        <QueryProvider>
          {children}
        </QueryProvider>

        {/*
          Toaster Sonner — positionnement adapté :
          - Mobile (< 768px) : ancré en bas à droite (hors bottom nav)
          - Desktop         : haut à droite
        */}
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={4000}
          toastOptions={{
            classNames: {
              toast:       "rounded-xl font-sans text-sm shadow-md",
              title:       "font-medium",
              description: "text-gray-500",
            },
          }}
        />
      </body>
    </html>
  )
}
