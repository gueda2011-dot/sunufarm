import type { Metadata, Viewport } from "next"
import { Toaster } from "sonner"
import { QueryProvider } from "@/src/components/providers/QueryProvider"
import { ServiceWorkerRegistration } from "@/src/components/pwa/ServiceWorkerRegistration"
import "./globals.css"

const BASE_METADATA: Metadata = {
  title: {
    default: "SunuFarm - Gere votre ferme. Gagnez plus.",
    template: "%s | SunuFarm",
  },
  description:
    "L'ERP avicole de reference pour l'Afrique francophone. " +
    "Gerez vos lots, suivez la rentabilite et prenez les bonnes decisions.",
  applicationName: "SunuFarm",
  keywords: ["aviculture", "elevage", "ferme", "poules", "Senegal", "FCFA"],
  authors: [{ name: "SunuFarm" }],
  appleWebApp: {
    capable: true,
    title: "SunuFarm",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...BASE_METADATA,
    manifest: "/manifest.webmanifest",
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#16a34a",
  viewportFit: "cover",
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
