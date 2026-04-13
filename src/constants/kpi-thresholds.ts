/**
 * SunuFarm — Seuils d'alerte KPI
 *
 * Convention de nommage : {METRIQUE}_{SEVERITE}_{TYPE}
 *   _RATE → ratio (0–1), pas un pourcentage
 *   _DAYS → nombre de jours
 *
 * Paramétrables par organisation en V2.
 */

export const KPI_THRESHOLDS = {
  // Aucun verdict de performance avant cet age
  PERFORMANCE_VERDICT_MIN_AGE_DAYS: 7,

  // Mortalité journalière (ratio 0–1)
  MORTALITY_DAILY_WARNING_RATE_BROILER:  0.005, // ≥ 0.5%/jour → warning
  MORTALITY_DAILY_CRITICAL_RATE_BROILER: 0.010, // ≥ 1.0%/jour → critical
  MORTALITY_DAILY_WARNING_RATE_LAYER:    0.003, // ≥ 0.3%/jour → warning
  MORTALITY_DAILY_CRITICAL_RATE_LAYER:   0.006, // ≥ 0.6%/jour → critical

  // Taux de ponte pondeuses (ratio 0–1)
  LAYING_RATE_WARNING_RATE:  0.70, // < 70% → warning
  LAYING_RATE_CRITICAL_RATE: 0.60, // < 60% → critical

  // Stock aliment (jours de consommation estimée)
  FEED_STOCK_WARNING_DAYS:  3, // < 3 jours → warning
  FEED_STOCK_CRITICAL_DAYS: 1, // < 1 jour  → critical

  // Stock médicament (jours de consommation estimée)
  // Seuil plus élevé car les ruptures médicament ont un impact sanitaire direct.
  MEDICINE_STOCK_WARNING_DAYS:  7, // < 7 jours → warning
  MEDICINE_STOCK_CRITICAL_DAYS: 2, // < 2 jours → critical

  // Retard vaccination (jours)
  VACCINATION_DELAY_WARNING_DAYS: 2,

  // Créances clients (jours)
  RECEIVABLE_WARNING_DAYS: 30,

  // Motif mortalité non renseigné (jours consécutifs)
  MORTALITY_REASON_MISSING_DAYS: 3,
} as const
