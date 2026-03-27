import type { Metadata, Viewport } from "next"
import { Toaster } from "sonner"
import { QueryProvider } from "@/src/components/providers/QueryProvider"
import { ServiceWorkerRegistration } from "@/src/components/pwa/ServiceWorkerRegistration"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "SunuFarm - Gere votre ferme. Gagnez plus.",
    template: "%s | SunuFarm",
  },
  description:
    "L'ERP avicole de reference pour l'Afrique francophone. " +
    "Gerez vos lots, suivez la rentabilite et prenez les bonnes decisions.",
  applicationName: "SunuFarm",
  manifest: "/manifest.webmanifest",
  keywords: ["aviculture", "elevage", "ferme", "poules", "Senegal", "FCFA"],
  authors: [{ name: "SunuFarm" }],
  appleWebApp: {
    capable: true,
    title: "SunuFarm",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#16a34a",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="h-full bg-gray-50 text-gray-900">
        <QueryProvider>{children}</QueryProvider>
        <ServiceWorkerRegistration />

        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={4000}
          toastOptions={{
            classNames: {
              toast: "rounded-xl font-sans text-sm shadow-md",
              title: "font-medium",
              description: "text-gray-500",
            },
          }}
        />
      </body>
    </html>
  )
}
