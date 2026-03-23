import type { Metadata } from "next"
import { ModulePlaceholder } from "../_components/ModulePlaceholder"

export const metadata: Metadata = { title: "Équipe" }

export default function TeamPage() {
  return (
    <ModulePlaceholder
      title="Équipe"
      description="Gestion des membres et de l'organisation."
      message="Le module Équipe n'a pas encore son interface d'administration complète. Les bases multi-tenant et les rôles existent déjà côté données, mais l'écran de gestion des utilisateurs reste à finaliser."
      primaryHref="/dashboard"
      primaryLabel="Retour au tableau de bord"
      secondaryHref="/settings"
      secondaryLabel="Ouvrir les paramètres"
    />
  )
}
