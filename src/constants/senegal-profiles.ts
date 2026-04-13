/**
 * Profils d'ajustement Sénégal — contexte local avicole
 *
 * Ces profils représentent des coefficients multiplicatifs appliqués sur les
 * référentiels génétiques officiels (Cobb, Ross, ISA, Lohmann...) pour refléter
 * la réalité terrain sénégalaise : chaleur, qualité aliment, densité, gestion.
 *
 * Règle d'utilisation :
 *   référence_utile = génétique × profil_sénégal × facteur_ferme (si ACTIVE)
 *
 * Sélection du profil (priorité décroissante) :
 *   1. Lot   : Batch.senegalProfileOverride (si renseigné)
 *   2. Ferme : Farm.senegalProfileCode (si renseigné)
 *   3. Global : STANDARD_LOCAL (défaut)
 *
 * Important : ces coefficients ne sont JAMAIS exposés directement à l'éleveur.
 * L'UI propose uniquement des libellés (Difficile / Standard / Bon niveau).
 *
 * Chaque facteur porte :
 *   - label     : nom compréhensible pour l'affichage admin
 *   - description : explication métier
 *   - coefficient : valeur multiplicative
 *   - range     : [min, max] — plage de validation admin
 *   - driver    : facteur terrain principal qui explique le coefficient
 */

export type SenegalProfileCode = "DIFFICILE" | "STANDARD_LOCAL" | "BON_NIVEAU"

export type SenegalFactorDriver =
  | "HEAT_STRESS" // chaleur > 32°C régulière — impact sur appétit et croissance
  | "FEED_QUALITY" // qualité / formulation aliment local — digestibilité variable
  | "DENSITY" // densité d'élevage — compétition, stress, pathogènes
  | "MANAGEMENT" // niveau de gestion opérationnelle — suivi, protocoles
  | "WATER_QUALITY" // qualité eau de boisson — contamination, pH, température
  | "HOUSING" // qualité bâtiment et ventilation — confort thermique

export interface SenegalProfileFactor {
  label: string
  description: string
  coefficient: number
  range: [number, number] // [min, max] valide pour validation admin
  driver: SenegalFactorDriver
}

export interface SenegalProfileFactors {
  /** Croissance / poids vif attendu vs table génétique */
  weight: SenegalProfileFactor
  /** Consommation alimentaire journalière vs table génétique */
  feed: SenegalProfileFactor
  /** Indice de consommation (FCR) vs table génétique — > 1 = dégradé */
  fcr: SenegalProfileFactor
  /** Taux de ponte (pondeuses uniquement) vs table génétique */
  laying: SenegalProfileFactor
}

export interface SenegalProfile {
  code: SenegalProfileCode
  label: string
  description: string
  factors: SenegalProfileFactors
}

/**
 * Catalogue des profils Sénégal.
 *
 * Les valeurs initiales sont des estimations basées sur :
 * - Littérature zootechnique africaine (FAO, CIRDES)
 * - Observations terrain qualitatives (contexte sénégalais)
 * - Avis d'experts avicoles locaux
 *
 * Ils seront affinés en Phase 4 via l'ajustement ferme (BatchOutcomeSnapshot).
 */
export const SENEGAL_PROFILES: Record<SenegalProfileCode, SenegalProfile> = {
  DIFFICILE: {
    code: "DIFFICILE",
    label: "Conditions difficiles",
    description:
      "Forte chaleur prolongée, aliment de base sans supplément, bâtiment ouvert sans ventilation forcée. Conditions fréquentes en saison chaude ou dans les zones rurales reculées.",
    factors: {
      weight: {
        label: "Croissance (poids vif)",
        description:
          "Stress thermique chronique réduit l'appétit et détourne l'énergie de la croissance vers la thermorégulation.",
        coefficient: 0.8,
        range: [0.7, 0.88],
        driver: "HEAT_STRESS",
      },
      feed: {
        label: "Consommation alimentaire",
        description:
          "Appétit réduit par la chaleur et aliment moins appétant ou moins digestible. Consommation inférieure à la table génétique.",
        coefficient: 0.92,
        range: [0.85, 0.97],
        driver: "FEED_QUALITY",
      },
      fcr: {
        label: "Indice de consommation (FCR)",
        description:
          "Moins bonne valorisation de l'aliment : mauvaise formulation, stress, pathogènes subcliniques. FCR supérieur à l'optimum génétique.",
        coefficient: 1.2,
        range: [1.1, 1.35],
        driver: "MANAGEMENT",
      },
      laying: {
        label: "Taux de ponte (pondeuses)",
        description:
          "Stress thermique élevé impacte directement la ponte. Pic de production inférieur et durée de production réduite.",
        coefficient: 0.85,
        range: [0.78, 0.92],
        driver: "HEAT_STRESS",
      },
    },
  },

  STANDARD_LOCAL: {
    code: "STANDARD_LOCAL",
    label: "Standard local",
    description:
      "Conditions habituelles pour un élevage sénégalais bien tenu : bâtiment ventilé, aliment industriel standard, gestion quotidienne régulière. Profil de référence par défaut.",
    factors: {
      weight: {
        label: "Croissance (poids vif)",
        description:
          "Stress thermique modéré en saison sèche. Croissance légèrement inférieure à l'optimum industriel européen.",
        coefficient: 0.88,
        range: [0.82, 0.93],
        driver: "HEAT_STRESS",
      },
      feed: {
        label: "Consommation alimentaire",
        description:
          "Aliment industriel standard disponible localement, légèrement moins digestible que les formulations optimales industrielles.",
        coefficient: 0.95,
        range: [0.9, 0.99],
        driver: "FEED_QUALITY",
      },
      fcr: {
        label: "Indice de consommation (FCR)",
        description:
          "FCR légèrement dégradé par rapport à l'optimum génétique. Gestion correcte mais sans protocoles industriels stricts.",
        coefficient: 1.1,
        range: [1.05, 1.2],
        driver: "MANAGEMENT",
      },
      laying: {
        label: "Taux de ponte (pondeuses)",
        description:
          "Taux de ponte proche du potentiel génétique dans des conditions standard locales. Légèrement impacté par la chaleur en saison sèche.",
        coefficient: 0.92,
        range: [0.87, 0.96],
        driver: "HEAT_STRESS",
      },
    },
  },

  BON_NIVEAU: {
    code: "BON_NIVEAU",
    label: "Bon niveau local",
    description:
      "Bon niveau de gestion pour le contexte sénégalais : bâtiment bien ventilé ou semi-fermé, aliment équilibré avec complémentation, suivi vétérinaire régulier, protocoles vaccinaux respectés.",
    factors: {
      weight: {
        label: "Croissance (poids vif)",
        description:
          "Bonne maîtrise de l'ambiance et de l'alimentation. Croissance proche du potentiel génétique dans le contexte local.",
        coefficient: 0.94,
        range: [0.9, 0.97],
        driver: "MANAGEMENT",
      },
      feed: {
        label: "Consommation alimentaire",
        description:
          "Aliment bien formulé et complémenté. Consommation très proche de la table génétique.",
        coefficient: 0.98,
        range: [0.95, 1.0],
        driver: "FEED_QUALITY",
      },
      fcr: {
        label: "Indice de consommation (FCR)",
        description:
          "FCR proche de l'optimum grâce à une bonne gestion et un aliment de qualité. Légère dégradation liée au contexte climatique.",
        coefficient: 1.05,
        range: [1.02, 1.1],
        driver: "MANAGEMENT",
      },
      laying: {
        label: "Taux de ponte (pondeuses)",
        description:
          "Taux de ponte élevé grâce à une bonne gestion de la lumière, de la température et de l'alimentation. Proche du pic génétique.",
        coefficient: 0.97,
        range: [0.94, 1.0],
        driver: "HEAT_STRESS",
      },
    },
  },
} as const

/**
 * Retourne le profil Sénégal actif pour un lot, selon la priorité :
 *   lot override > ferme > global STANDARD_LOCAL
 */
export function resolveSenegalProfile(
  batchOverride: string | null | undefined,
  farmProfileCode: string | null | undefined
): SenegalProfile {
  const code =
    (batchOverride as SenegalProfileCode) ||
    (farmProfileCode as SenegalProfileCode) ||
    "STANDARD_LOCAL"

  return SENEGAL_PROFILES[code] ?? SENEGAL_PROFILES.STANDARD_LOCAL
}
