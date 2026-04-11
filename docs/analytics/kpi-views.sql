-- =============================================================================
-- SunuFarm — Vues KPI produit (Phase 5 Sous-lot 4)
-- =============================================================================
--
-- 3 métriques clés pour suivre la performance de conversion :
--
--   v_kpi_free_to_starter    — conversion FREE → STARTER (30 jours glissants)
--   v_kpi_starter_to_pro     — conversion STARTER → PRO  (30 jours glissants)
--   v_kpi_cta_dropoff        — drop-off pricing_cta_clicked → payment_requested
--
-- Usage :
--   Coller ce fichier dans le SQL editor Supabase et exécuter.
--   Les vues sont ensuite permanentes et requêtables à tout moment.
--
-- Lecture rapide (tableau de bord) :
--   SELECT * FROM v_kpi_free_to_starter;
--   SELECT * FROM v_kpi_starter_to_pro;
--   SELECT * FROM v_kpi_cta_dropoff;
--
-- Agrégations temporelles : voir section 4 et 5 en bas de fichier.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — CRÉATION DES VUES (à exécuter une seule fois)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vue 1 : conversion FREE → STARTER (30 jours glissants)
--
-- Logique :
--   - orgs_exposed   : orgs ayant eu au moins un paywall_viewed avec plan = 'FREE'
--   - orgs_converted : parmi elles, celles qui ont ensuite activé le plan STARTER
--   - La fenêtre est 30 jours glissants depuis NOW()
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_kpi_free_to_starter AS
WITH window_start AS (
  SELECT NOW() - INTERVAL '30 days' AS ts
),
exposed AS (
  SELECT DISTINCT organization_id
  FROM analytics_events, window_start
  WHERE event       = 'paywall_viewed'
    AND plan        = 'FREE'
    AND created_at >= window_start.ts
    AND organization_id IS NOT NULL
),
converted AS (
  SELECT DISTINCT e.organization_id
  FROM exposed e
  JOIN analytics_events a
    ON a.organization_id = e.organization_id
   AND a.event           = 'subscription_activated'
   AND a.plan            = 'STARTER'
   AND a.created_at     >= (SELECT ts FROM window_start)
)
SELECT
  (SELECT COUNT(*) FROM exposed)                                          AS orgs_exposed,
  (SELECT COUNT(*) FROM converted)                                        AS orgs_converted,
  ROUND(
    100.0 * (SELECT COUNT(*) FROM converted)
          / NULLIF((SELECT COUNT(*) FROM exposed), 0),
    1
  )                                                                       AS conversion_pct,
  NOW() - INTERVAL '30 days'                                             AS window_start,
  NOW()                                                                   AS window_end;


-- -----------------------------------------------------------------------------
-- Vue 2 : conversion STARTER → PRO (30 jours glissants)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_kpi_starter_to_pro AS
WITH window_start AS (
  SELECT NOW() - INTERVAL '30 days' AS ts
),
exposed AS (
  SELECT DISTINCT organization_id
  FROM analytics_events, window_start
  WHERE event       = 'paywall_viewed'
    AND plan        = 'STARTER'
    AND created_at >= window_start.ts
    AND organization_id IS NOT NULL
),
converted AS (
  SELECT DISTINCT e.organization_id
  FROM exposed e
  JOIN analytics_events a
    ON a.organization_id = e.organization_id
   AND a.event           = 'subscription_activated'
   AND a.plan            = 'PRO'
   AND a.created_at     >= (SELECT ts FROM window_start)
)
SELECT
  (SELECT COUNT(*) FROM exposed)                                          AS orgs_exposed,
  (SELECT COUNT(*) FROM converted)                                        AS orgs_converted,
  ROUND(
    100.0 * (SELECT COUNT(*) FROM converted)
          / NULLIF((SELECT COUNT(*) FROM exposed), 0),
    1
  )                                                                       AS conversion_pct,
  NOW() - INTERVAL '30 days'                                             AS window_start,
  NOW()                                                                   AS window_end;


-- -----------------------------------------------------------------------------
-- Vue 3 : drop-off CTA → payment_requested (48h)
--
-- Logique :
--   - orgs_clicked   : orgs ayant eu pricing_cta_clicked dans les 30 derniers jours
--   - orgs_converted : parmi elles, celles qui ont soumis un payment_requested
--                      dans les 48h suivant le premier clic
--   - drop_pct       : % qui ont cliqué mais n'ont PAS soumis de paiement
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_kpi_cta_dropoff AS
WITH window_start AS (
  SELECT NOW() - INTERVAL '30 days' AS ts
),
first_cta AS (
  SELECT
    organization_id,
    MIN(created_at) AS first_clicked_at
  FROM analytics_events, window_start
  WHERE event             = 'pricing_cta_clicked'
    AND created_at       >= window_start.ts
    AND organization_id  IS NOT NULL
  GROUP BY organization_id
),
followed_by_payment AS (
  SELECT DISTINCT fc.organization_id
  FROM first_cta fc
  JOIN analytics_events a
    ON a.organization_id = fc.organization_id
   AND a.event           = 'subscription_payment_requested'
   AND a.created_at      BETWEEN fc.first_clicked_at
                              AND fc.first_clicked_at + INTERVAL '48 hours'
)
SELECT
  (SELECT COUNT(*) FROM first_cta)                                        AS orgs_clicked_cta,
  (SELECT COUNT(*) FROM followed_by_payment)                              AS orgs_submitted_payment,
  (SELECT COUNT(*) FROM first_cta)
    - (SELECT COUNT(*) FROM followed_by_payment)                          AS orgs_dropped,
  ROUND(
    100.0 * ((SELECT COUNT(*) FROM first_cta)
             - (SELECT COUNT(*) FROM followed_by_payment))
          / NULLIF((SELECT COUNT(*) FROM first_cta), 0),
    1
  )                                                                       AS drop_pct,
  NOW() - INTERVAL '30 days'                                             AS window_start,
  NOW()                                                                   AS window_end;


-- =============================================================================
-- SECTION 2 — LECTURE INSTANTANÉE (à exécuter après création des vues)
-- =============================================================================

-- Tableau de bord complet en une seule requête
SELECT
  'FREE → STARTER'                       AS metric,
  orgs_exposed,
  orgs_converted,
  conversion_pct                         AS pct,
  window_start::date                     AS depuis
FROM v_kpi_free_to_starter

UNION ALL

SELECT
  'STARTER → PRO',
  orgs_exposed,
  orgs_converted,
  conversion_pct,
  window_start::date
FROM v_kpi_starter_to_pro

UNION ALL

SELECT
  'Drop-off CTA → Paiement (48h)',
  orgs_clicked_cta,
  orgs_dropped,
  drop_pct,
  window_start::date
FROM v_kpi_cta_dropoff

ORDER BY metric;


-- =============================================================================
-- SECTION 3 — AGRÉGATION PAR JOUR (7 derniers jours)
-- =============================================================================

-- Activations par jour et par transition de plan
SELECT
  created_at::date                        AS day,
  plan                                    AS activated_plan,
  COUNT(DISTINCT organization_id)         AS orgs_activated
FROM analytics_events
WHERE event      = 'subscription_activated'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY day, plan
ORDER BY day DESC, plan;

-- Paywalls vus par jour et par surface (top signaux de friction)
SELECT
  created_at::date                        AS day,
  properties->>'surface'                  AS surface,
  plan                                    AS plan_at_view,
  COUNT(DISTINCT organization_id)         AS unique_orgs
FROM analytics_events
WHERE event      = 'paywall_viewed'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY day, surface, plan_at_view
ORDER BY day DESC, unique_orgs DESC;

-- CTA cliqués par jour (signaux d'intent)
SELECT
  created_at::date                        AS day,
  properties->>'targetPlan'               AS target_plan,
  COUNT(DISTINCT organization_id)         AS unique_orgs
FROM analytics_events
WHERE event      = 'pricing_cta_clicked'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY day, target_plan
ORDER BY day DESC;


-- =============================================================================
-- SECTION 4 — AGRÉGATION PAR SEMAINE (8 dernières semaines)
-- =============================================================================

-- Conversion hebdomadaire FREE → STARTER
WITH weekly_exposed AS (
  SELECT
    DATE_TRUNC('week', created_at) AS week,
    organization_id
  FROM analytics_events
  WHERE event       = 'paywall_viewed'
    AND plan        = 'FREE'
    AND created_at >= NOW() - INTERVAL '8 weeks'
    AND organization_id IS NOT NULL
),
weekly_converted AS (
  SELECT
    DATE_TRUNC('week', a.created_at) AS week,
    a.organization_id
  FROM analytics_events a
  WHERE a.event = 'subscription_activated'
    AND a.plan  = 'STARTER'
    AND a.created_at >= NOW() - INTERVAL '8 weeks'
)
SELECT
  e.week,
  COUNT(DISTINCT e.organization_id)                                        AS exposed,
  COUNT(DISTINCT c.organization_id)                                        AS converted,
  ROUND(
    100.0 * COUNT(DISTINCT c.organization_id)
          / NULLIF(COUNT(DISTINCT e.organization_id), 0),
    1
  )                                                                        AS conversion_pct
FROM weekly_exposed e
LEFT JOIN weekly_converted c
  ON c.organization_id = e.organization_id
 AND c.week            = e.week
GROUP BY e.week
ORDER BY e.week DESC;

-- Conversion hebdomadaire STARTER → PRO
WITH weekly_exposed AS (
  SELECT
    DATE_TRUNC('week', created_at) AS week,
    organization_id
  FROM analytics_events
  WHERE event       = 'paywall_viewed'
    AND plan        = 'STARTER'
    AND created_at >= NOW() - INTERVAL '8 weeks'
    AND organization_id IS NOT NULL
),
weekly_converted AS (
  SELECT
    DATE_TRUNC('week', a.created_at) AS week,
    a.organization_id
  FROM analytics_events a
  WHERE a.event = 'subscription_activated'
    AND a.plan  = 'PRO'
    AND a.created_at >= NOW() - INTERVAL '8 weeks'
)
SELECT
  e.week,
  COUNT(DISTINCT e.organization_id)                                        AS exposed,
  COUNT(DISTINCT c.organization_id)                                        AS converted,
  ROUND(
    100.0 * COUNT(DISTINCT c.organization_id)
          / NULLIF(COUNT(DISTINCT e.organization_id), 0),
    1
  )                                                                        AS conversion_pct
FROM weekly_exposed e
LEFT JOIN weekly_converted c
  ON c.organization_id = e.organization_id
 AND c.week            = e.week
GROUP BY e.week
ORDER BY e.week DESC;

-- Drop-off CTA → paiement par semaine
WITH weekly_cta AS (
  SELECT
    DATE_TRUNC('week', created_at) AS week,
    organization_id,
    MIN(created_at)                AS first_cta_at
  FROM analytics_events
  WHERE event       = 'pricing_cta_clicked'
    AND created_at >= NOW() - INTERVAL '8 weeks'
    AND organization_id IS NOT NULL
  GROUP BY week, organization_id
),
weekly_payment AS (
  SELECT DISTINCT
    DATE_TRUNC('week', wc.first_cta_at) AS week,
    wc.organization_id
  FROM weekly_cta wc
  JOIN analytics_events a
    ON a.organization_id = wc.organization_id
   AND a.event           = 'subscription_payment_requested'
   AND a.created_at      BETWEEN wc.first_cta_at AND wc.first_cta_at + INTERVAL '48 hours'
)
SELECT
  wc.week,
  COUNT(DISTINCT wc.organization_id)                                       AS orgs_clicked,
  COUNT(DISTINCT wp.organization_id)                                       AS orgs_paid,
  COUNT(DISTINCT wc.organization_id) - COUNT(DISTINCT wp.organization_id) AS orgs_dropped,
  ROUND(
    100.0 * (COUNT(DISTINCT wc.organization_id) - COUNT(DISTINCT wp.organization_id))
          / NULLIF(COUNT(DISTINCT wc.organization_id), 0),
    1
  )                                                                        AS drop_pct
FROM weekly_cta wc
LEFT JOIN weekly_payment wp
  ON wp.organization_id = wc.organization_id
 AND wp.week            = wc.week
GROUP BY wc.week
ORDER BY wc.week DESC;


-- =============================================================================
-- SECTION 5 — VÉRIFICATION DE COHÉRENCE RAPIDE
-- =============================================================================
-- Résultat attendu : 0 pour chaque ligne.
-- Si des lignes ont count > 0, le tracking a un problème sur ces surfaces.

SELECT issue, cnt AS anomalies FROM (

  SELECT 'paywall_viewed sans surface'       AS issue,
         COUNT(*)                            AS cnt
  FROM analytics_events
  WHERE event      = 'paywall_viewed'
    AND (properties->>'surface' IS NULL OR properties->>'surface' = '')

  UNION ALL

  SELECT 'paywall_viewed sans plan',
         COUNT(*)
  FROM analytics_events
  WHERE event = 'paywall_viewed'
    AND plan IS NULL

  UNION ALL

  SELECT 'pricing_cta_clicked sans targetPlan',
         COUNT(*)
  FROM analytics_events
  WHERE event = 'pricing_cta_clicked'
    AND (properties->>'targetPlan' IS NULL OR properties->>'targetPlan' = '')

  UNION ALL

  SELECT 'subscription_payment_requested sans plan cible',
         COUNT(*)
  FROM analytics_events
  WHERE event = 'subscription_payment_requested'
    AND (properties->>'plan' IS NULL OR properties->>'plan' = '')

  UNION ALL

  SELECT 'subscription_activated sans triggeredBy connu',
         COUNT(*)
  FROM analytics_events
  WHERE event = 'subscription_activated'
    AND properties->>'triggeredBy' NOT IN ('user_confirm', 'admin_direct', 'admin_wave')

  UNION ALL

  SELECT 'events sans organization_id (hors pricing_page_visited)',
         COUNT(*)
  FROM analytics_events
  WHERE organization_id IS NULL
    AND event != 'pricing_page_visited'

) checks
WHERE cnt > 0
ORDER BY cnt DESC;
