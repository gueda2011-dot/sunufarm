import type { GateAccess } from "@/src/lib/gate-resolver"

export type PremiumSurface =
  | "profitability"
  | "reports"
  | "margin"
  | "mortality"

interface PremiumSurfaceCopy {
  title: string
  ctaLabel: string
  highlights: string[]
  footerHint?: string
}

export function getPremiumSurfaceCopy(
  surface: PremiumSurface,
  access: GateAccess,
): PremiumSurfaceCopy {
  const isPreparation = access === "blocked"

  switch (surface) {
    case "profitability":
      return {
        title: "Decider sans vendre a perte",
        ctaLabel: isPreparation
          ? "Continuer la saisie pour preparer la decision"
          : "Passer a Pro pour fixer la marge et le prix exact",
        highlights: [
          "Voir si le lot gagne ou perd reellement de l argent",
          "Fixer un prix minimum de vente avant de negocier",
          "Transformer la saisie en decision economique actionnable",
        ],
        footerHint: isPreparation
          ? "D abord la donnee, ensuite la decision. Des que le lot devient lisible, Pro affiche les valeurs exactes."
          : "Pro sert a eviter la perte terrain au moment ou il faut vendre.",
      }
    case "reports":
      return {
        title: "Piloter le mois avec une lecture dirigeant",
        ctaLabel: isPreparation
          ? "Continuer la saisie pour activer la lecture mensuelle"
          : "Passer a Pro pour piloter le mois avec precision",
        highlights: [
          "Voir si le mois protege ou degrade la marge",
          "Comparer ventes, depenses et mortalite dans une meme lecture",
          "Sortir d un simple suivi pour passer au pilotage economique",
        ],
        footerHint: isPreparation
          ? "La lecture mensuelle se debloque quand l activite du mois devient suffisante."
          : "Starter aide a sentir la tendance. Pro aide a arbitrer sans approximation.",
      }
    case "margin":
      return {
        title: "Voir si la marge glisse avant la vente",
        ctaLabel: isPreparation
          ? "Continuer la saisie pour activer cette lecture"
          : "Passer a Pro pour anticiper la perte de marge",
        highlights: [
          "Repere une derive avant qu elle ne coute de l argent",
          "Transforme les saisies du lot en signal de marge actionnable",
          "Aide a corriger plus tot alimentation, mortalite ou rythme de vente",
        ],
        footerHint: "Les rappels simples restent possibles. Pro debloque la lecture predictive qui aide a agir a temps.",
      }
    case "mortality":
      return {
        title: "Agir avant qu une derive de mortalite ne coute cher",
        ctaLabel: isPreparation
          ? "Continuer la saisie pour activer cette lecture"
          : "Passer a Pro pour anticiper la derive de mortalite",
        highlights: [
          "Distinguer un simple incident d une vraie derive a traiter",
          "Voir plus tot les signaux qui menacent la marge du lot",
          "Transformer la mortalite en decision d action plutot qu en constat tardif",
        ],
        footerHint: "Les rappels simples restent visibles. Pro debloque la lecture actionnable utile pour proteger le lot.",
      }
  }
}
