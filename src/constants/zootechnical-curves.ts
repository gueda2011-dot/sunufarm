/**
 * Données de référence zootechnique — Version 2024-01
 *
 * Sources documentées :
 *   - Cobb 500 (CHAIR)      : Cobb 500 Broiler Performance & Nutrition Supplement 2022
 *   - Ross 308 (CHAIR)      : Ross 308 Broiler Nutrition Specifications 2022
 *   - ISA Brown (PONDEUSE)  : ISA Management Guide 2021 (Layer)
 *   - Lohmann Brown (PONDEUSE): Lohmann Brown Classic Management Guide 2022
 *
 * Granularité source : HEBDOMADAIRE → interpolé en JOURNALIER par le seed.
 * Méthode d'interpolation V1 : LINEAR (linéaire entre deux points hebdomadaires).
 *
 * Convention d'âge :
 *   - Chair : ageDay 0–42 (J0 = premier jour en élevage)
 *   - Pondeuse : ageWeek 0–80 (en semaines, converti en jours dans le seed)
 *     Les données d'âge en semaine sont stockées en jours (semaine × 7).
 *
 * Format des entrées hebdomadaires :
 *   { ageWeekEnd, dailyFeedGPerBird, bodyWeightG, ... }
 *   ageWeekEnd = âge en jours à la FIN de la semaine (ex: S1 → ageDay 7)
 *
 * Unités :
 *   - dailyFeedGPerBird : g/oiseau/jour (consommation journalière)
 *   - cumulativeFeedG   : g/oiseau (consommation cumulée depuis J0)
 *   - bodyWeightG       : g/oiseau (poids vif moyen)
 *   - layingRatePct     : % (0–100)
 *   - eggMassGPerBird   : g/oiseau/jour
 *   - feedPerEggG       : g aliment / g oeuf
 */

export const CURVE_VERSION = "2024-01"

// =============================================================================
// TYPES
// =============================================================================

export interface ChairWeeklyPoint {
  ageWeekEnd: number // âge en jours à la fin de la semaine (7, 14, 21, ...)
  dailyFeedGPerBird: number // g/oiseau/jour consommés dans la semaine
  cumulativeFeedG: number // g/oiseau cumulés depuis J0
  bodyWeightG: number // poids vif moyen en fin de semaine (g)
}

export interface LayerWeeklyPoint {
  ageWeekEnd: number // âge en jours (semaine × 7)
  dailyFeedGPerBird: number // g/oiseau/jour
  cumulativeFeedG: number // g/oiseau cumulé
  bodyWeightG: number // poids vif moyen (g)
  layingRatePct?: number // % taux de ponte (null si pré-ponte)
  eggMassGPerBird?: number // g/oiseau/jour de masse d'oeuf produite
  feedPerEggG?: number // g aliment / g oeuf produit
}

// =============================================================================
// COBB 500 — Poulet de chair
// Source : Cobb 500 Broiler Performance & Nutrition Supplement 2022
// Granularité : hebdomadaire — sera interpolé en journalier par le seed
// qualityLevel : MEDIUM (données hebdo, interpolation linéaire)
// =============================================================================

export const COBB500_WEEKLY: ChairWeeklyPoint[] = [
  // S0 → J0 (entrée en élevage)
  { ageWeekEnd: 0, dailyFeedGPerBird: 0, cumulativeFeedG: 0, bodyWeightG: 45 },
  // S1 → J7
  { ageWeekEnd: 7, dailyFeedGPerBird: 20, cumulativeFeedG: 140, bodyWeightG: 175 },
  // S2 → J14
  { ageWeekEnd: 14, dailyFeedGPerBird: 44, cumulativeFeedG: 448, bodyWeightG: 430 },
  // S3 → J21
  { ageWeekEnd: 21, dailyFeedGPerBird: 77, cumulativeFeedG: 987, bodyWeightG: 835 },
  // S4 → J28
  { ageWeekEnd: 28, dailyFeedGPerBird: 115, cumulativeFeedG: 1792, bodyWeightG: 1320 },
  // S5 → J35
  { ageWeekEnd: 35, dailyFeedGPerBird: 147, cumulativeFeedG: 2821, bodyWeightG: 1870 },
  // S6 → J42
  { ageWeekEnd: 42, dailyFeedGPerBird: 170, cumulativeFeedG: 4011, bodyWeightG: 2450 },
]

// =============================================================================
// ROSS 308 — Poulet de chair
// Source : Ross 308 Broiler Nutrition Specifications 2022
// Granularité : hebdomadaire — sera interpolé en journalier
// qualityLevel : MEDIUM
// =============================================================================

export const ROSS308_WEEKLY: ChairWeeklyPoint[] = [
  // S0 → J0
  { ageWeekEnd: 0, dailyFeedGPerBird: 0, cumulativeFeedG: 0, bodyWeightG: 42 },
  // S1 → J7
  { ageWeekEnd: 7, dailyFeedGPerBird: 21, cumulativeFeedG: 147, bodyWeightG: 185 },
  // S2 → J14
  { ageWeekEnd: 14, dailyFeedGPerBird: 46, cumulativeFeedG: 469, bodyWeightG: 455 },
  // S3 → J21
  { ageWeekEnd: 21, dailyFeedGPerBird: 80, cumulativeFeedG: 1029, bodyWeightG: 875 },
  // S4 → J28
  { ageWeekEnd: 28, dailyFeedGPerBird: 118, cumulativeFeedG: 1855, bodyWeightG: 1380 },
  // S5 → J35
  { ageWeekEnd: 35, dailyFeedGPerBird: 152, cumulativeFeedG: 2919, bodyWeightG: 1950 },
  // S6 → J42
  { ageWeekEnd: 42, dailyFeedGPerBird: 175, cumulativeFeedG: 4144, bodyWeightG: 2560 },
]

// =============================================================================
// ISA BROWN — Pondeuse
// Source : ISA Management Guide 2021 (Layer)
// Granularité : hebdomadaire (semaines 1–80) → interpolé en journalier
// qualityLevel : MEDIUM
//
// Phases :
//   S1–S17  : phase d'élevage (poulettes) — pas de ponte
//   S17–S20 : phase de montée en ponte
//   S20–S72 : phase de production (pic et descente)
//   S72–S80 : fin de cycle
// =============================================================================

export const ISA_BROWN_WEEKLY: LayerWeeklyPoint[] = [
  // Phase d'élevage poulettes (S1–S16) — pas de ponte
  { ageWeekEnd: 7, dailyFeedGPerBird: 18, cumulativeFeedG: 126, bodyWeightG: 95 },
  { ageWeekEnd: 14, dailyFeedGPerBird: 32, cumulativeFeedG: 350, bodyWeightG: 215 },
  { ageWeekEnd: 21, dailyFeedGPerBird: 44, cumulativeFeedG: 658, bodyWeightG: 380 },
  { ageWeekEnd: 28, dailyFeedGPerBird: 54, cumulativeFeedG: 1036, bodyWeightG: 550 },
  { ageWeekEnd: 35, dailyFeedGPerBird: 61, cumulativeFeedG: 1463, bodyWeightG: 720 },
  { ageWeekEnd: 42, dailyFeedGPerBird: 66, cumulativeFeedG: 1925, bodyWeightG: 890 },
  { ageWeekEnd: 49, dailyFeedGPerBird: 70, cumulativeFeedG: 2415, bodyWeightG: 1050 },
  { ageWeekEnd: 56, dailyFeedGPerBird: 74, cumulativeFeedG: 2933, bodyWeightG: 1200 },
  { ageWeekEnd: 63, dailyFeedGPerBird: 77, cumulativeFeedG: 3472, bodyWeightG: 1320 },
  { ageWeekEnd: 70, dailyFeedGPerBird: 79, cumulativeFeedG: 4025, bodyWeightG: 1430 },
  { ageWeekEnd: 77, dailyFeedGPerBird: 80, cumulativeFeedG: 4585, bodyWeightG: 1520 },
  { ageWeekEnd: 84, dailyFeedGPerBird: 81, cumulativeFeedG: 5152, bodyWeightG: 1600 },
  { ageWeekEnd: 91, dailyFeedGPerBird: 82, cumulativeFeedG: 5726, bodyWeightG: 1650 },
  { ageWeekEnd: 98, dailyFeedGPerBird: 82, cumulativeFeedG: 6300, bodyWeightG: 1680 },
  { ageWeekEnd: 105, dailyFeedGPerBird: 83, cumulativeFeedG: 6881, bodyWeightG: 1700 },
  { ageWeekEnd: 112, dailyFeedGPerBird: 83, cumulativeFeedG: 7462, bodyWeightG: 1710 },

  // Phase de montée en ponte (S17–S20) — ponte progressive
  { ageWeekEnd: 119, dailyFeedGPerBird: 95, cumulativeFeedG: 8127, bodyWeightG: 1730, layingRatePct: 15, eggMassGPerBird: 8, feedPerEggG: 11.9 },
  { ageWeekEnd: 126, dailyFeedGPerBird: 105, cumulativeFeedG: 8862, bodyWeightG: 1760, layingRatePct: 45, eggMassGPerBird: 24, feedPerEggG: 4.4 },
  { ageWeekEnd: 133, dailyFeedGPerBird: 110, cumulativeFeedG: 9632, bodyWeightG: 1790, layingRatePct: 75, eggMassGPerBird: 41, feedPerEggG: 2.7 },
  { ageWeekEnd: 140, dailyFeedGPerBird: 113, cumulativeFeedG: 10423, bodyWeightG: 1820, layingRatePct: 88, eggMassGPerBird: 49, feedPerEggG: 2.3 },

  // Phase de production — pic (S21–S30)
  { ageWeekEnd: 147, dailyFeedGPerBird: 114, cumulativeFeedG: 11221, bodyWeightG: 1840, layingRatePct: 92, eggMassGPerBird: 52, feedPerEggG: 2.2 },
  { ageWeekEnd: 154, dailyFeedGPerBird: 115, cumulativeFeedG: 12026, bodyWeightG: 1860, layingRatePct: 94, eggMassGPerBird: 54, feedPerEggG: 2.1 },
  { ageWeekEnd: 161, dailyFeedGPerBird: 115, cumulativeFeedG: 12831, bodyWeightG: 1870, layingRatePct: 94, eggMassGPerBird: 54, feedPerEggG: 2.1 },
  { ageWeekEnd: 168, dailyFeedGPerBird: 115, cumulativeFeedG: 13636, bodyWeightG: 1880, layingRatePct: 93, eggMassGPerBird: 54, feedPerEggG: 2.1 },
  { ageWeekEnd: 175, dailyFeedGPerBird: 115, cumulativeFeedG: 14441, bodyWeightG: 1890, layingRatePct: 93, eggMassGPerBird: 54, feedPerEggG: 2.1 },
  { ageWeekEnd: 182, dailyFeedGPerBird: 115, cumulativeFeedG: 15246, bodyWeightG: 1900, layingRatePct: 92, eggMassGPerBird: 54, feedPerEggG: 2.1 },
  { ageWeekEnd: 189, dailyFeedGPerBird: 114, cumulativeFeedG: 16044, bodyWeightG: 1910, layingRatePct: 92, eggMassGPerBird: 53, feedPerEggG: 2.2 },
  { ageWeekEnd: 196, dailyFeedGPerBird: 114, cumulativeFeedG: 16842, bodyWeightG: 1920, layingRatePct: 91, eggMassGPerBird: 53, feedPerEggG: 2.2 },
  { ageWeekEnd: 203, dailyFeedGPerBird: 114, cumulativeFeedG: 17640, bodyWeightG: 1930, layingRatePct: 90, eggMassGPerBird: 53, feedPerEggG: 2.2 },
  { ageWeekEnd: 210, dailyFeedGPerBird: 114, cumulativeFeedG: 18438, bodyWeightG: 1940, layingRatePct: 90, eggMassGPerBird: 53, feedPerEggG: 2.2 },

  // Phase de descente (S31–S60)
  { ageWeekEnd: 217, dailyFeedGPerBird: 113, cumulativeFeedG: 19229, bodyWeightG: 1950, layingRatePct: 89, eggMassGPerBird: 53, feedPerEggG: 2.2 },
  { ageWeekEnd: 224, dailyFeedGPerBird: 113, cumulativeFeedG: 20020, bodyWeightG: 1960, layingRatePct: 88, eggMassGPerBird: 52, feedPerEggG: 2.2 },
  { ageWeekEnd: 231, dailyFeedGPerBird: 112, cumulativeFeedG: 20804, bodyWeightG: 1970, layingRatePct: 87, eggMassGPerBird: 52, feedPerEggG: 2.2 },
  { ageWeekEnd: 238, dailyFeedGPerBird: 112, cumulativeFeedG: 21588, bodyWeightG: 1975, layingRatePct: 86, eggMassGPerBird: 52, feedPerEggG: 2.2 },
  { ageWeekEnd: 245, dailyFeedGPerBird: 111, cumulativeFeedG: 22365, bodyWeightG: 1980, layingRatePct: 85, eggMassGPerBird: 51, feedPerEggG: 2.2 },
  { ageWeekEnd: 252, dailyFeedGPerBird: 111, cumulativeFeedG: 23142, bodyWeightG: 1985, layingRatePct: 84, eggMassGPerBird: 51, feedPerEggG: 2.2 },
  { ageWeekEnd: 259, dailyFeedGPerBird: 110, cumulativeFeedG: 23912, bodyWeightG: 1990, layingRatePct: 83, eggMassGPerBird: 50, feedPerEggG: 2.2 },
  { ageWeekEnd: 266, dailyFeedGPerBird: 110, cumulativeFeedG: 24682, bodyWeightG: 1995, layingRatePct: 82, eggMassGPerBird: 50, feedPerEggG: 2.2 },
  { ageWeekEnd: 273, dailyFeedGPerBird: 109, cumulativeFeedG: 25445, bodyWeightG: 2000, layingRatePct: 81, eggMassGPerBird: 50, feedPerEggG: 2.2 },
  { ageWeekEnd: 280, dailyFeedGPerBird: 109, cumulativeFeedG: 26208, bodyWeightG: 2000, layingRatePct: 80, eggMassGPerBird: 49, feedPerEggG: 2.2 },
  { ageWeekEnd: 287, dailyFeedGPerBird: 109, cumulativeFeedG: 26971, bodyWeightG: 2005, layingRatePct: 79, eggMassGPerBird: 49, feedPerEggG: 2.2 },
  { ageWeekEnd: 294, dailyFeedGPerBird: 108, cumulativeFeedG: 27727, bodyWeightG: 2010, layingRatePct: 78, eggMassGPerBird: 48, feedPerEggG: 2.3 },
  { ageWeekEnd: 301, dailyFeedGPerBird: 108, cumulativeFeedG: 28483, bodyWeightG: 2010, layingRatePct: 77, eggMassGPerBird: 47, feedPerEggG: 2.3 },
  { ageWeekEnd: 308, dailyFeedGPerBird: 108, cumulativeFeedG: 29239, bodyWeightG: 2015, layingRatePct: 76, eggMassGPerBird: 47, feedPerEggG: 2.3 },
  { ageWeekEnd: 315, dailyFeedGPerBird: 107, cumulativeFeedG: 29988, bodyWeightG: 2020, layingRatePct: 75, eggMassGPerBird: 46, feedPerEggG: 2.3 },
  { ageWeekEnd: 322, dailyFeedGPerBird: 107, cumulativeFeedG: 30737, bodyWeightG: 2020, layingRatePct: 74, eggMassGPerBird: 46, feedPerEggG: 2.3 },
  { ageWeekEnd: 329, dailyFeedGPerBird: 107, cumulativeFeedG: 31486, bodyWeightG: 2025, layingRatePct: 73, eggMassGPerBird: 45, feedPerEggG: 2.4 },
  { ageWeekEnd: 336, dailyFeedGPerBird: 106, cumulativeFeedG: 32228, bodyWeightG: 2025, layingRatePct: 72, eggMassGPerBird: 44, feedPerEggG: 2.4 },
  { ageWeekEnd: 343, dailyFeedGPerBird: 106, cumulativeFeedG: 32970, bodyWeightG: 2030, layingRatePct: 71, eggMassGPerBird: 44, feedPerEggG: 2.4 },
  { ageWeekEnd: 350, dailyFeedGPerBird: 106, cumulativeFeedG: 33712, bodyWeightG: 2030, layingRatePct: 70, eggMassGPerBird: 43, feedPerEggG: 2.5 },

  // Fin de cycle (S51–S80) — pondeuses réformées progressivement
  { ageWeekEnd: 357, dailyFeedGPerBird: 106, cumulativeFeedG: 34454, bodyWeightG: 2035, layingRatePct: 68, eggMassGPerBird: 42, feedPerEggG: 2.5 },
  { ageWeekEnd: 364, dailyFeedGPerBird: 105, cumulativeFeedG: 35189, bodyWeightG: 2035, layingRatePct: 67, eggMassGPerBird: 41, feedPerEggG: 2.6 },
  { ageWeekEnd: 371, dailyFeedGPerBird: 105, cumulativeFeedG: 35924, bodyWeightG: 2040, layingRatePct: 66, eggMassGPerBird: 41, feedPerEggG: 2.6 },
  { ageWeekEnd: 378, dailyFeedGPerBird: 105, cumulativeFeedG: 36659, bodyWeightG: 2040, layingRatePct: 65, eggMassGPerBird: 40, feedPerEggG: 2.6 },
  { ageWeekEnd: 385, dailyFeedGPerBird: 104, cumulativeFeedG: 37387, bodyWeightG: 2040, layingRatePct: 64, eggMassGPerBird: 39, feedPerEggG: 2.7 },
  { ageWeekEnd: 392, dailyFeedGPerBird: 104, cumulativeFeedG: 38115, bodyWeightG: 2045, layingRatePct: 62, eggMassGPerBird: 38, feedPerEggG: 2.7 },
  { ageWeekEnd: 399, dailyFeedGPerBird: 104, cumulativeFeedG: 38843, bodyWeightG: 2045, layingRatePct: 61, eggMassGPerBird: 38, feedPerEggG: 2.7 },
  { ageWeekEnd: 406, dailyFeedGPerBird: 103, cumulativeFeedG: 39564, bodyWeightG: 2045, layingRatePct: 60, eggMassGPerBird: 37, feedPerEggG: 2.8 },
  { ageWeekEnd: 413, dailyFeedGPerBird: 103, cumulativeFeedG: 40285, bodyWeightG: 2050, layingRatePct: 58, eggMassGPerBird: 36, feedPerEggG: 2.9 },
  { ageWeekEnd: 420, dailyFeedGPerBird: 102, cumulativeFeedG: 40999, bodyWeightG: 2050, layingRatePct: 57, eggMassGPerBird: 35, feedPerEggG: 2.9 },
  { ageWeekEnd: 427, dailyFeedGPerBird: 102, cumulativeFeedG: 41713, bodyWeightG: 2050, layingRatePct: 55, eggMassGPerBird: 34, feedPerEggG: 3.0 },
  { ageWeekEnd: 434, dailyFeedGPerBird: 101, cumulativeFeedG: 42420, bodyWeightG: 2050, layingRatePct: 54, eggMassGPerBird: 33, feedPerEggG: 3.1 },
  { ageWeekEnd: 441, dailyFeedGPerBird: 101, cumulativeFeedG: 43127, bodyWeightG: 2050, layingRatePct: 52, eggMassGPerBird: 32, feedPerEggG: 3.2 },
  { ageWeekEnd: 448, dailyFeedGPerBird: 100, cumulativeFeedG: 43827, bodyWeightG: 2050, layingRatePct: 51, eggMassGPerBird: 31, feedPerEggG: 3.2 },
  { ageWeekEnd: 455, dailyFeedGPerBird: 100, cumulativeFeedG: 44527, bodyWeightG: 2050, layingRatePct: 49, eggMassGPerBird: 30, feedPerEggG: 3.3 },
  { ageWeekEnd: 462, dailyFeedGPerBird: 99, cumulativeFeedG: 45220, bodyWeightG: 2045, layingRatePct: 48, eggMassGPerBird: 30, feedPerEggG: 3.3 },
  { ageWeekEnd: 469, dailyFeedGPerBird: 99, cumulativeFeedG: 45913, bodyWeightG: 2045, layingRatePct: 46, eggMassGPerBird: 28, feedPerEggG: 3.5 },
  { ageWeekEnd: 476, dailyFeedGPerBird: 98, cumulativeFeedG: 46599, bodyWeightG: 2040, layingRatePct: 45, eggMassGPerBird: 28, feedPerEggG: 3.5 },
  { ageWeekEnd: 483, dailyFeedGPerBird: 98, cumulativeFeedG: 47285, bodyWeightG: 2040, layingRatePct: 43, eggMassGPerBird: 27, feedPerEggG: 3.6 },
  { ageWeekEnd: 490, dailyFeedGPerBird: 98, cumulativeFeedG: 47971, bodyWeightG: 2040, layingRatePct: 42, eggMassGPerBird: 26, feedPerEggG: 3.8 },
  { ageWeekEnd: 497, dailyFeedGPerBird: 97, cumulativeFeedG: 48650, bodyWeightG: 2035, layingRatePct: 40, eggMassGPerBird: 25, feedPerEggG: 3.9 },
  { ageWeekEnd: 504, dailyFeedGPerBird: 97, cumulativeFeedG: 49329, bodyWeightG: 2035, layingRatePct: 39, eggMassGPerBird: 24, feedPerEggG: 4.0 },
  { ageWeekEnd: 511, dailyFeedGPerBird: 96, cumulativeFeedG: 50001, bodyWeightG: 2030, layingRatePct: 37, eggMassGPerBird: 23, feedPerEggG: 4.2 },
  { ageWeekEnd: 518, dailyFeedGPerBird: 96, cumulativeFeedG: 50673, bodyWeightG: 2030, layingRatePct: 36, eggMassGPerBird: 22, feedPerEggG: 4.4 },
  { ageWeekEnd: 525, dailyFeedGPerBird: 95, cumulativeFeedG: 51338, bodyWeightG: 2025, layingRatePct: 34, eggMassGPerBird: 21, feedPerEggG: 4.5 },
  { ageWeekEnd: 532, dailyFeedGPerBird: 95, cumulativeFeedG: 52003, bodyWeightG: 2025, layingRatePct: 33, eggMassGPerBird: 20, feedPerEggG: 4.8 },
  { ageWeekEnd: 539, dailyFeedGPerBird: 94, cumulativeFeedG: 52661, bodyWeightG: 2020, layingRatePct: 31, eggMassGPerBird: 19, feedPerEggG: 4.9 },
  { ageWeekEnd: 546, dailyFeedGPerBird: 94, cumulativeFeedG: 53319, bodyWeightG: 2020, layingRatePct: 30, eggMassGPerBird: 18, feedPerEggG: 5.2 },
  { ageWeekEnd: 553, dailyFeedGPerBird: 93, cumulativeFeedG: 53970, bodyWeightG: 2015, layingRatePct: 28, eggMassGPerBird: 17, feedPerEggG: 5.5 },
  { ageWeekEnd: 560, dailyFeedGPerBird: 93, cumulativeFeedG: 54621, bodyWeightG: 2015, layingRatePct: 27, eggMassGPerBird: 17, feedPerEggG: 5.5 },
]

// =============================================================================
// LOHMANN BROWN — Pondeuse
// Source : Lohmann Brown Classic Management Guide 2022
// Granularité : hebdomadaire (semaines 1–70) → interpolé en journalier
// qualityLevel : MEDIUM
//
// Phases :
//   S1–S16  : phase d'élevage (poulettes) — pas de ponte
//   S17–S20 : phase de montée en ponte
//   S21–S70 : phase de production (pic et descente progressive)
//
// Note : La Lohmann Brown Classic a un cycle de production de 70–72 semaines.
//        Ici couverts jusqu'à S70 (490 jours) conformément au plan Phase 4.
// =============================================================================

export const LOHMANN_BROWN_WEEKLY: LayerWeeklyPoint[] = [
  // Phase d'élevage poulettes (S1–S16, J7–J112) — pas de ponte
  { ageWeekEnd: 7,   dailyFeedGPerBird: 14, cumulativeFeedG: 98,   bodyWeightG: 80 },
  { ageWeekEnd: 14,  dailyFeedGPerBird: 24, cumulativeFeedG: 266,  bodyWeightG: 180 },
  { ageWeekEnd: 21,  dailyFeedGPerBird: 34, cumulativeFeedG: 504,  bodyWeightG: 310 },
  { ageWeekEnd: 28,  dailyFeedGPerBird: 44, cumulativeFeedG: 812,  bodyWeightG: 460 },
  { ageWeekEnd: 35,  dailyFeedGPerBird: 52, cumulativeFeedG: 1176, bodyWeightG: 610 },
  { ageWeekEnd: 42,  dailyFeedGPerBird: 57, cumulativeFeedG: 1575, bodyWeightG: 750 },
  { ageWeekEnd: 49,  dailyFeedGPerBird: 61, cumulativeFeedG: 2002, bodyWeightG: 880 },
  { ageWeekEnd: 56,  dailyFeedGPerBird: 64, cumulativeFeedG: 2450, bodyWeightG: 990 },
  { ageWeekEnd: 63,  dailyFeedGPerBird: 67, cumulativeFeedG: 2919, bodyWeightG: 1080 },
  { ageWeekEnd: 70,  dailyFeedGPerBird: 69, cumulativeFeedG: 3402, bodyWeightG: 1150 },
  { ageWeekEnd: 77,  dailyFeedGPerBird: 70, cumulativeFeedG: 3892, bodyWeightG: 1200 },
  { ageWeekEnd: 84,  dailyFeedGPerBird: 71, cumulativeFeedG: 4389, bodyWeightG: 1250 },
  { ageWeekEnd: 91,  dailyFeedGPerBird: 72, cumulativeFeedG: 4893, bodyWeightG: 1290 },
  { ageWeekEnd: 98,  dailyFeedGPerBird: 73, cumulativeFeedG: 5404, bodyWeightG: 1325 },
  { ageWeekEnd: 105, dailyFeedGPerBird: 74, cumulativeFeedG: 5922, bodyWeightG: 1360 },
  { ageWeekEnd: 112, dailyFeedGPerBird: 75, cumulativeFeedG: 6447, bodyWeightG: 1390 },

  // Phase de montée en ponte (S17–S20, J119–J140)
  { ageWeekEnd: 119, dailyFeedGPerBird: 85,  cumulativeFeedG: 7042,  bodyWeightG: 1410, layingRatePct: 10, eggMassGPerBird: 5,  feedPerEggG: 17.0 },
  { ageWeekEnd: 126, dailyFeedGPerBird: 96,  cumulativeFeedG: 7714,  bodyWeightG: 1440, layingRatePct: 40, eggMassGPerBird: 22, feedPerEggG: 4.4  },
  { ageWeekEnd: 133, dailyFeedGPerBird: 105, cumulativeFeedG: 8449,  bodyWeightG: 1460, layingRatePct: 72, eggMassGPerBird: 40, feedPerEggG: 2.6  },
  { ageWeekEnd: 140, dailyFeedGPerBird: 108, cumulativeFeedG: 9205,  bodyWeightG: 1475, layingRatePct: 85, eggMassGPerBird: 48, feedPerEggG: 2.3  },

  // Phase de production — pic (S21–S30, J147–J210)
  { ageWeekEnd: 147, dailyFeedGPerBird: 110, cumulativeFeedG: 9975,  bodyWeightG: 1490, layingRatePct: 90, eggMassGPerBird: 51, feedPerEggG: 2.2 },
  { ageWeekEnd: 154, dailyFeedGPerBird: 111, cumulativeFeedG: 10752, bodyWeightG: 1505, layingRatePct: 92, eggMassGPerBird: 53, feedPerEggG: 2.1 },
  { ageWeekEnd: 161, dailyFeedGPerBird: 112, cumulativeFeedG: 11536, bodyWeightG: 1515, layingRatePct: 93, eggMassGPerBird: 54, feedPerEggG: 2.1 },
  { ageWeekEnd: 168, dailyFeedGPerBird: 112, cumulativeFeedG: 12320, bodyWeightG: 1525, layingRatePct: 93, eggMassGPerBird: 54, feedPerEggG: 2.1 },
  { ageWeekEnd: 175, dailyFeedGPerBird: 113, cumulativeFeedG: 13111, bodyWeightG: 1530, layingRatePct: 93, eggMassGPerBird: 54, feedPerEggG: 2.1 },
  { ageWeekEnd: 182, dailyFeedGPerBird: 113, cumulativeFeedG: 13902, bodyWeightG: 1535, layingRatePct: 92, eggMassGPerBird: 54, feedPerEggG: 2.1 },
  { ageWeekEnd: 189, dailyFeedGPerBird: 112, cumulativeFeedG: 14686, bodyWeightG: 1540, layingRatePct: 91, eggMassGPerBird: 53, feedPerEggG: 2.1 },
  { ageWeekEnd: 196, dailyFeedGPerBird: 112, cumulativeFeedG: 15470, bodyWeightG: 1545, layingRatePct: 90, eggMassGPerBird: 53, feedPerEggG: 2.1 },
  { ageWeekEnd: 203, dailyFeedGPerBird: 111, cumulativeFeedG: 16247, bodyWeightG: 1548, layingRatePct: 90, eggMassGPerBird: 53, feedPerEggG: 2.1 },
  { ageWeekEnd: 210, dailyFeedGPerBird: 111, cumulativeFeedG: 17024, bodyWeightG: 1550, layingRatePct: 89, eggMassGPerBird: 52, feedPerEggG: 2.1 },

  // Phase de descente (S31–S70, J217–J490)
  { ageWeekEnd: 217, dailyFeedGPerBird: 110, cumulativeFeedG: 17794, bodyWeightG: 1552, layingRatePct: 88, eggMassGPerBird: 52, feedPerEggG: 2.1 },
  { ageWeekEnd: 224, dailyFeedGPerBird: 110, cumulativeFeedG: 18564, bodyWeightG: 1554, layingRatePct: 87, eggMassGPerBird: 51, feedPerEggG: 2.2 },
  { ageWeekEnd: 231, dailyFeedGPerBird: 109, cumulativeFeedG: 19327, bodyWeightG: 1556, layingRatePct: 86, eggMassGPerBird: 51, feedPerEggG: 2.2 },
  { ageWeekEnd: 238, dailyFeedGPerBird: 109, cumulativeFeedG: 20090, bodyWeightG: 1558, layingRatePct: 85, eggMassGPerBird: 50, feedPerEggG: 2.2 },
  { ageWeekEnd: 245, dailyFeedGPerBird: 109, cumulativeFeedG: 20853, bodyWeightG: 1560, layingRatePct: 84, eggMassGPerBird: 50, feedPerEggG: 2.2 },
  { ageWeekEnd: 252, dailyFeedGPerBird: 108, cumulativeFeedG: 21609, bodyWeightG: 1562, layingRatePct: 83, eggMassGPerBird: 49, feedPerEggG: 2.2 },
  { ageWeekEnd: 259, dailyFeedGPerBird: 108, cumulativeFeedG: 22365, bodyWeightG: 1564, layingRatePct: 82, eggMassGPerBird: 49, feedPerEggG: 2.2 },
  { ageWeekEnd: 266, dailyFeedGPerBird: 107, cumulativeFeedG: 23114, bodyWeightG: 1566, layingRatePct: 81, eggMassGPerBird: 48, feedPerEggG: 2.2 },
  { ageWeekEnd: 273, dailyFeedGPerBird: 107, cumulativeFeedG: 23863, bodyWeightG: 1568, layingRatePct: 80, eggMassGPerBird: 48, feedPerEggG: 2.2 },
  { ageWeekEnd: 280, dailyFeedGPerBird: 106, cumulativeFeedG: 24605, bodyWeightG: 1570, layingRatePct: 79, eggMassGPerBird: 47, feedPerEggG: 2.3 },
  { ageWeekEnd: 287, dailyFeedGPerBird: 106, cumulativeFeedG: 25347, bodyWeightG: 1572, layingRatePct: 78, eggMassGPerBird: 47, feedPerEggG: 2.3 },
  { ageWeekEnd: 294, dailyFeedGPerBird: 105, cumulativeFeedG: 26082, bodyWeightG: 1574, layingRatePct: 77, eggMassGPerBird: 46, feedPerEggG: 2.3 },
  { ageWeekEnd: 301, dailyFeedGPerBird: 105, cumulativeFeedG: 26817, bodyWeightG: 1575, layingRatePct: 76, eggMassGPerBird: 46, feedPerEggG: 2.3 },
  { ageWeekEnd: 308, dailyFeedGPerBird: 104, cumulativeFeedG: 27545, bodyWeightG: 1576, layingRatePct: 75, eggMassGPerBird: 45, feedPerEggG: 2.3 },
  { ageWeekEnd: 315, dailyFeedGPerBird: 104, cumulativeFeedG: 28273, bodyWeightG: 1577, layingRatePct: 74, eggMassGPerBird: 44, feedPerEggG: 2.4 },
  { ageWeekEnd: 322, dailyFeedGPerBird: 103, cumulativeFeedG: 28994, bodyWeightG: 1578, layingRatePct: 73, eggMassGPerBird: 43, feedPerEggG: 2.4 },
  { ageWeekEnd: 329, dailyFeedGPerBird: 103, cumulativeFeedG: 29715, bodyWeightG: 1579, layingRatePct: 72, eggMassGPerBird: 43, feedPerEggG: 2.4 },
  { ageWeekEnd: 336, dailyFeedGPerBird: 102, cumulativeFeedG: 30429, bodyWeightG: 1580, layingRatePct: 71, eggMassGPerBird: 42, feedPerEggG: 2.4 },
  { ageWeekEnd: 343, dailyFeedGPerBird: 102, cumulativeFeedG: 31143, bodyWeightG: 1581, layingRatePct: 70, eggMassGPerBird: 42, feedPerEggG: 2.4 },
  { ageWeekEnd: 350, dailyFeedGPerBird: 101, cumulativeFeedG: 31850, bodyWeightG: 1582, layingRatePct: 69, eggMassGPerBird: 41, feedPerEggG: 2.5 },
  { ageWeekEnd: 357, dailyFeedGPerBird: 101, cumulativeFeedG: 32557, bodyWeightG: 1583, layingRatePct: 68, eggMassGPerBird: 40, feedPerEggG: 2.5 },
  { ageWeekEnd: 364, dailyFeedGPerBird: 100, cumulativeFeedG: 33257, bodyWeightG: 1584, layingRatePct: 67, eggMassGPerBird: 40, feedPerEggG: 2.5 },
  { ageWeekEnd: 371, dailyFeedGPerBird: 100, cumulativeFeedG: 33957, bodyWeightG: 1585, layingRatePct: 66, eggMassGPerBird: 39, feedPerEggG: 2.6 },
  { ageWeekEnd: 378, dailyFeedGPerBird: 99,  cumulativeFeedG: 34650, bodyWeightG: 1585, layingRatePct: 65, eggMassGPerBird: 38, feedPerEggG: 2.6 },
  { ageWeekEnd: 385, dailyFeedGPerBird: 99,  cumulativeFeedG: 35343, bodyWeightG: 1585, layingRatePct: 63, eggMassGPerBird: 38, feedPerEggG: 2.6 },
  { ageWeekEnd: 392, dailyFeedGPerBird: 98,  cumulativeFeedG: 36029, bodyWeightG: 1585, layingRatePct: 62, eggMassGPerBird: 37, feedPerEggG: 2.6 },
  { ageWeekEnd: 399, dailyFeedGPerBird: 98,  cumulativeFeedG: 36715, bodyWeightG: 1585, layingRatePct: 61, eggMassGPerBird: 36, feedPerEggG: 2.7 },
  { ageWeekEnd: 406, dailyFeedGPerBird: 97,  cumulativeFeedG: 37394, bodyWeightG: 1585, layingRatePct: 59, eggMassGPerBird: 35, feedPerEggG: 2.8 },
  { ageWeekEnd: 413, dailyFeedGPerBird: 97,  cumulativeFeedG: 38073, bodyWeightG: 1585, layingRatePct: 58, eggMassGPerBird: 35, feedPerEggG: 2.8 },
  { ageWeekEnd: 420, dailyFeedGPerBird: 96,  cumulativeFeedG: 38745, bodyWeightG: 1585, layingRatePct: 57, eggMassGPerBird: 34, feedPerEggG: 2.8 },
  { ageWeekEnd: 427, dailyFeedGPerBird: 96,  cumulativeFeedG: 39417, bodyWeightG: 1585, layingRatePct: 56, eggMassGPerBird: 33, feedPerEggG: 2.9 },
  { ageWeekEnd: 434, dailyFeedGPerBird: 95,  cumulativeFeedG: 40082, bodyWeightG: 1585, layingRatePct: 55, eggMassGPerBird: 33, feedPerEggG: 2.9 },
  { ageWeekEnd: 441, dailyFeedGPerBird: 95,  cumulativeFeedG: 40747, bodyWeightG: 1585, layingRatePct: 53, eggMassGPerBird: 32, feedPerEggG: 3.0 },
  { ageWeekEnd: 448, dailyFeedGPerBird: 94,  cumulativeFeedG: 41405, bodyWeightG: 1583, layingRatePct: 52, eggMassGPerBird: 31, feedPerEggG: 3.0 },
  { ageWeekEnd: 455, dailyFeedGPerBird: 94,  cumulativeFeedG: 42063, bodyWeightG: 1582, layingRatePct: 51, eggMassGPerBird: 31, feedPerEggG: 3.0 },
  { ageWeekEnd: 462, dailyFeedGPerBird: 93,  cumulativeFeedG: 42714, bodyWeightG: 1580, layingRatePct: 50, eggMassGPerBird: 30, feedPerEggG: 3.1 },
  { ageWeekEnd: 469, dailyFeedGPerBird: 93,  cumulativeFeedG: 43365, bodyWeightG: 1578, layingRatePct: 49, eggMassGPerBird: 30, feedPerEggG: 3.1 },
  { ageWeekEnd: 476, dailyFeedGPerBird: 92,  cumulativeFeedG: 44009, bodyWeightG: 1575, layingRatePct: 48, eggMassGPerBird: 29, feedPerEggG: 3.2 },
  { ageWeekEnd: 483, dailyFeedGPerBird: 92,  cumulativeFeedG: 44653, bodyWeightG: 1572, layingRatePct: 47, eggMassGPerBird: 28, feedPerEggG: 3.3 },
  { ageWeekEnd: 490, dailyFeedGPerBird: 91,  cumulativeFeedG: 45290, bodyWeightG: 1570, layingRatePct: 46, eggMassGPerBird: 28, feedPerEggG: 3.3 },
]

// =============================================================================
// MÉTADONNÉES DES COURBES (pour le seed)
// =============================================================================

export interface CurveMetadata {
  breedCode: string
  batchType: "CHAIR" | "PONDEUSE"
  sourceLabel: string
  sourceUrl: string
  version: string
  qualityLevel: "HIGH" | "MEDIUM" | "LOW" | "ESTIMATED"
  maxAgeDay: number // dernier jour d'âge à générer
  notes: string
}

export const CURVE_METADATA: CurveMetadata[] = [
  {
    breedCode: "COBB500",
    batchType: "CHAIR",
    sourceLabel: "Cobb 500 Broiler Performance & Nutrition Supplement 2022",
    sourceUrl: "https://www.cobb-vantress.com/resources/cobb-500-broiler-performance-nutrition-supplement/",
    version: CURVE_VERSION,
    qualityLevel: "MEDIUM",
    maxAgeDay: 42,
    notes:
      "Données hebdomadaires S0–S6. Interpolation linéaire journalière. " +
      "Table de référence constructeur pour mix mâles+femelles. " +
      "Conditions optimales (élevage industriel contrôlé) — à ajuster via profil Sénégal.",
  },
  {
    breedCode: "ROSS308",
    batchType: "CHAIR",
    sourceLabel: "Ross 308 Broiler Nutrition Specifications 2022",
    sourceUrl: "https://www.aviagen.com/brands/ross/products/ross-308-broiler/",
    version: CURVE_VERSION,
    qualityLevel: "MEDIUM",
    maxAgeDay: 42,
    notes:
      "Données hebdomadaires S0–S6. Interpolation linéaire journalière. " +
      "Mix sexes. Conditions industrielles optimales.",
  },
  {
    breedCode: "ISA_BROWN",
    batchType: "PONDEUSE",
    sourceLabel: "ISA Brown Layer Management Guide 2021",
    sourceUrl: "https://www.hendrix-genetics.com/en/products/layers/isa-brown/",
    version: CURVE_VERSION,
    qualityLevel: "MEDIUM",
    maxAgeDay: 560, // 80 semaines
    notes:
      "Données hebdomadaires S1–S80. Interpolation linéaire journalière. " +
      "Phase poulette J0–J112, montée ponte J113–J140, production J141–J560. " +
      "Conditions optimales — ajuster via profil Sénégal pour chaleur et qualité aliment.",
  },
  {
    breedCode: "LOHMANN_BROWN",
    batchType: "PONDEUSE",
    sourceLabel: "Lohmann Brown Classic Management Guide 2022",
    sourceUrl: "https://www.lohmann-breeders.com/media/management-guides/",
    version: CURVE_VERSION,
    qualityLevel: "MEDIUM",
    maxAgeDay: 490, // 70 semaines
    notes:
      "Données hebdomadaires S1–S70. Interpolation linéaire journalière. " +
      "Phase poulette J0–J112 (S1–S16), montée ponte J113–J140 (S17–S20), production J141–J490 (S21–S70). " +
      "Pic de ponte ~93% vers S25. Conditions optimales — ajuster via profil Sénégal.",
  },
]
