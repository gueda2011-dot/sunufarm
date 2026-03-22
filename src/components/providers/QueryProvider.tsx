"use client"

/**
 * SunuFarm — TanStack Query Provider
 *
 * Client Component qui enveloppe l'arborescence avec QueryClientProvider.
 * Placé dans app/layout.tsx pour couvrir toutes les routes.
 *
 * Stratégie de cache :
 *   staleTime 60s — les données restent fraîches 1 minute avant refetch.
 *   retry 1       — 1 retry en cas d'erreur réseau (connexion terrain instable).
 *   refetchOnWindowFocus false — évite les refetchs parasites sur mobile.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"

export function QueryProvider({ children }: { children: ReactNode }) {
  // useState garantit un QueryClient stable par render (important pour SSR/hydration)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime:            60 * 1000, // 1 minute
            retry:                1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
