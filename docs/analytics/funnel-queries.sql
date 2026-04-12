-- =============================================================================
-- SunuFarm — Funnel Analytics Queries (Phase 5 Sous-lot 2)
-- =============================================================================
--
-- All queries run against the analytics_events table.
-- Replace :start_date / :end_date with the desired window.
--
-- Table schema:
--   analytics_events (id, user_id, organization_id, event, plan, properties JSONB, created_at)
--
-- Events in the funnel:
--   paywall_viewed                → user hit a gated feature
--   pricing_page_visited          → user opened /pricing
--   pricing_cta_clicked           → user clicked "Choisir <plan>" → WhatsApp redirect
--   subscription_payment_requested → user submitted payment form (fills WhatsApp black box)
--   subscription_activated         → plan was activated (user_confirm | admin_direct | admin_wave)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. RAW FUNNEL — unique orgs at each step (30-day rolling window)
-- -----------------------------------------------------------------------------

WITH window AS (
  SELECT
    organization_id,
    MAX(CASE WHEN event = 'paywall_viewed'                 THEN 1 ELSE 0 END) AS saw_paywall,
    MAX(CASE WHEN event = 'pricing_page_visited'           THEN 1 ELSE 0 END) AS visited_pricing,
    MAX(CASE WHEN event = 'pricing_cta_clicked'            THEN 1 ELSE 0 END) AS clicked_cta,
    MAX(CASE WHEN event = 'subscription_payment_requested' THEN 1 ELSE 0 END) AS payment_requested,
    MAX(CASE WHEN event = 'subscription_activated'         THEN 1 ELSE 0 END) AS activated
  FROM analytics_events
  WHERE created_at >= :start_date
    AND created_at <  :end_date
    AND organization_id IS NOT NULL
  GROUP BY organization_id
)
SELECT
  SUM(saw_paywall)       AS step1_paywall_viewed,
  SUM(visited_pricing)   AS step2_pricing_visited,
  SUM(clicked_cta)       AS step3_cta_clicked,
  SUM(payment_requested) AS step4_payment_requested,
  SUM(activated)         AS step5_activated,
  -- drop-off rates (% who moved forward)
  ROUND(100.0 * SUM(visited_pricing)   / NULLIF(SUM(saw_paywall),       0), 1) AS pct_paywall_to_pricing,
  ROUND(100.0 * SUM(clicked_cta)       / NULLIF(SUM(visited_pricing),   0), 1) AS pct_pricing_to_cta,
  ROUND(100.0 * SUM(payment_requested) / NULLIF(SUM(clicked_cta),       0), 1) AS pct_cta_to_payment,
  ROUND(100.0 * SUM(activated)         / NULLIF(SUM(payment_requested), 0), 1) AS pct_payment_to_activated,
  ROUND(100.0 * SUM(activated)         / NULLIF(SUM(saw_paywall),       0), 1) AS pct_overall_conversion
FROM window;


-- -----------------------------------------------------------------------------
-- 2. CONVERSION BY SURFACE — which paywall converts best
--    (surface = properties->>'surface' on paywall_viewed events)
-- -----------------------------------------------------------------------------

WITH paywall_orgs AS (
  SELECT
    organization_id,
    properties->>'surface' AS surface,
    MIN(created_at)        AS first_seen_at
  FROM analytics_events
  WHERE event = 'paywall_viewed'
    AND created_at >= :start_date
    AND created_at <  :end_date
    AND organization_id IS NOT NULL
  GROUP BY organization_id, properties->>'surface'
),
activations AS (
  SELECT DISTINCT organization_id
  FROM analytics_events
  WHERE event = 'subscription_activated'
    AND created_at >= :start_date
    AND created_at <  :end_date
)
SELECT
  p.surface,
  COUNT(DISTINCT p.organization_id)                                AS orgs_who_saw_paywall,
  COUNT(DISTINCT a.organization_id)                                AS orgs_who_activated,
  ROUND(100.0 * COUNT(DISTINCT a.organization_id)
        / NULLIF(COUNT(DISTINCT p.organization_id), 0), 1)        AS conversion_pct
FROM paywall_orgs p
LEFT JOIN activations a ON a.organization_id = p.organization_id
GROUP BY p.surface
ORDER BY conversion_pct DESC NULLS LAST;


-- -----------------------------------------------------------------------------
-- 3. CONVERSION BY TARGET PLAN — which plan is clicked most / converts best
--    (targetPlan = properties->>'targetPlan' on pricing_cta_clicked events)
-- -----------------------------------------------------------------------------

WITH cta_orgs AS (
  SELECT
    organization_id,
    properties->>'targetPlan' AS target_plan,
    MIN(created_at)           AS first_clicked_at
  FROM analytics_events
  WHERE event = 'pricing_cta_clicked'
    AND created_at >= :start_date
    AND created_at <  :end_date
    AND organization_id IS NOT NULL
  GROUP BY organization_id, properties->>'targetPlan'
),
activations AS (
  SELECT
    organization_id,
    plan AS activated_plan
  FROM analytics_events
  WHERE event = 'subscription_activated'
    AND created_at >= :start_date
    AND created_at <  :end_date
)
SELECT
  c.target_plan,
  COUNT(DISTINCT c.organization_id)                               AS orgs_clicked_cta,
  COUNT(DISTINCT a.organization_id)                               AS orgs_activated,
  ROUND(100.0 * COUNT(DISTINCT a.organization_id)
        / NULLIF(COUNT(DISTINCT c.organization_id), 0), 1)       AS click_to_activation_pct
FROM cta_orgs c
LEFT JOIN activations a
  ON a.organization_id = c.organization_id
 AND a.activated_plan  = c.target_plan
GROUP BY c.target_plan
ORDER BY orgs_clicked_cta DESC;


-- -----------------------------------------------------------------------------
-- 4. DROP-OFF BY STEP — where do orgs abandon the funnel
-- -----------------------------------------------------------------------------

WITH steps AS (
  SELECT
    organization_id,
    MAX(CASE WHEN event = 'paywall_viewed'                 THEN 1 ELSE 0 END) AS s1,
    MAX(CASE WHEN event = 'pricing_page_visited'           THEN 1 ELSE 0 END) AS s2,
    MAX(CASE WHEN event = 'pricing_cta_clicked'            THEN 1 ELSE 0 END) AS s3,
    MAX(CASE WHEN event = 'subscription_payment_requested' THEN 1 ELSE 0 END) AS s4,
    MAX(CASE WHEN event = 'subscription_activated'         THEN 1 ELSE 0 END) AS s5
  FROM analytics_events
  WHERE created_at >= :start_date
    AND created_at <  :end_date
    AND organization_id IS NOT NULL
  GROUP BY organization_id
)
SELECT
  'After paywall (never visited pricing)'   AS drop_point,
  COUNT(*) FILTER (WHERE s1 = 1 AND s2 = 0) AS orgs_dropped
FROM steps
UNION ALL
SELECT
  'After pricing (never clicked CTA)',
  COUNT(*) FILTER (WHERE s2 = 1 AND s3 = 0)
FROM steps
UNION ALL
SELECT
  'After CTA click (never submitted payment)',
  COUNT(*) FILTER (WHERE s3 = 1 AND s4 = 0)
FROM steps
UNION ALL
SELECT
  'After payment submitted (never activated)',
  COUNT(*) FILTER (WHERE s4 = 1 AND s5 = 0)
FROM steps
ORDER BY drop_point;


-- -----------------------------------------------------------------------------
-- 5. ACTIVATION BREAKDOWN — how plans are activated
--    (triggeredBy = properties->>'triggeredBy' on subscription_activated events)
-- -----------------------------------------------------------------------------

SELECT
  plan                              AS activated_plan,
  properties->>'triggeredBy'       AS triggered_by,
  COUNT(*)                          AS activations,
  ROUND(AVG((properties->>'amountFcfa')::numeric), 0) AS avg_amount_fcfa
FROM analytics_events
WHERE event = 'subscription_activated'
  AND created_at >= :start_date
  AND created_at <  :end_date
GROUP BY plan, properties->>'triggeredBy'
ORDER BY plan, triggered_by;


-- -----------------------------------------------------------------------------
-- 6. WEEKLY COHORT — paywall views and activations over time
-- -----------------------------------------------------------------------------

SELECT
  DATE_TRUNC('week', created_at) AS week,
  event,
  COUNT(DISTINCT organization_id) AS unique_orgs,
  COUNT(*)                        AS total_events
FROM analytics_events
WHERE event IN ('paywall_viewed', 'pricing_page_visited', 'pricing_cta_clicked', 'subscription_payment_requested', 'subscription_activated')
  AND created_at >= :start_date
  AND created_at <  :end_date
GROUP BY week, event
ORDER BY week, event;


-- -----------------------------------------------------------------------------
-- 7. PROPERTY CONSISTENCY CHECK — audit for missing fields
--    Run this to spot tracking gaps (should return 0 rows for each check)
-- -----------------------------------------------------------------------------

-- Paywall views without surface
SELECT 'paywall_viewed missing surface' AS issue, COUNT(*) AS rows
FROM analytics_events
WHERE event = 'paywall_viewed'
  AND (properties->>'surface' IS NULL OR properties->>'surface' = '')

UNION ALL

-- Paywall views without entitlement
SELECT 'paywall_viewed missing entitlement', COUNT(*)
FROM analytics_events
WHERE event = 'paywall_viewed'
  AND (properties->>'entitlement' IS NULL OR properties->>'entitlement' = '')

UNION ALL

-- Pricing CTA clicks without targetPlan
SELECT 'pricing_cta_clicked missing targetPlan', COUNT(*)
FROM analytics_events
WHERE event = 'pricing_cta_clicked'
  AND (properties->>'targetPlan' IS NULL OR properties->>'targetPlan' = '')

UNION ALL

-- Subscription activations without triggeredBy
SELECT 'subscription_activated missing triggeredBy', COUNT(*)
FROM analytics_events
WHERE event = 'subscription_activated'
  AND (properties->>'triggeredBy' IS NULL OR properties->>'triggeredBy' = 'unknown')

UNION ALL

-- Events without organization_id
SELECT 'any event missing organization_id', COUNT(*)
FROM analytics_events
WHERE organization_id IS NULL
  AND event != 'pricing_page_visited'  -- anonymous visits allowed

ORDER BY issue;
