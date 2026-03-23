import type { Metadata } from "next"
import { ModulePlaceholder } from "../_components/ModulePlaceholder"

export const metadata: Metadata = { title: "Paramètres" }

export default function SettingsPage() {
  return (
    <ModulePlaceholder
      title="Paramètres"
      description="Configuration générale de l'espace SunuFarm."
      message="Le module Paramètres n'est pas encore ouvert à la configuration avancée. Vous pourrez bientôt y gérer les préférences d'organisation, les rôles, les unités métier et les réglages d'exploitation."
      primaryHref="/dashboard"
      primaryLabel="Retour au tableau de bord"
      secondaryHref="/farms"
      secondaryLabel="Voir les fermes"
    />
  )
}
