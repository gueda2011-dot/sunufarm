import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
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
    statusBarStyle: "default",
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers()
  const currentHost =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    ""

  const configuredHost = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
    : null

  const isPreviewDeployment =
    currentHost.endsWith(".vercel.app") &&
    (!configuredHost || currentHost !== configuredHost)

  return {
    ...BASE_METADATA,
    ...(isPreviewDeployment ? {} : { manifest: "/manifest.webmanifest" }),
  }
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
