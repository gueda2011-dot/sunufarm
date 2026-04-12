# Pricing Evolution

Ce document est la source de verite pour la strategie de pricing, de monetisation et de suivi d'execution du projet SunuFarm.

Derniere mise a jour : 2026-04-11  
Phase active : `Phase 5 - Automatisation (Sous-lot 1 : Instrumentation — DONE)`

---

## Objectifs

- Garder la saisie journaliere accessible sans friction pour creer l'habitude.
- Monetiser au moment ou l'utilisateur veut prendre une decision economique.
- Faire de `Starter` un plan d'organisation, de `Pro` un plan d'argent et de decision, et de `Business` un plan de pilotage transverse.
- Montrer la valeur avant verrouillage avec des apercus, du flou, du watermark ou des statuts partiels.
- Faire converger le produit, le code et l'UX vers une logique d'entitlements claire et maintenable.
- Faire de ce document le point d'ancrage commun pour le produit, l'implementation et le suivi.

---

## Plans

### Gratuit

- 1 ferme
- 1 lot actif
- saisie journaliere complete
- vue simple du lot
- historique limite
- apercu decisionnel partiel (statuts, flou, preview)

### Starter - 3000 FCFA

- lots illimites
- ventes
- depenses
- stock basique
- historique complet
- export PDF avec watermark
- support WhatsApp standard

### Pro - 10000 FCFA

- rentabilite reelle par lot
- prix minimum de vente
- alertes mortalite
- alertes surconsommation aliment
- alertes stock faible
- analyse par lot
- export sans watermark
- support prioritaire
- rappels intelligents WhatsApp

### Business - 25000 FCFA

- multi-fermes
- equipe et roles
- dashboard global
- comparaison entre lots
- rapports avances
- export comptable

---

## Principes Produit

- Ne jamais bloquer la saisie journaliere.
- Monetiser au moment de verite.
- Montrer la valeur avant de la verrouiller.
- `Starter` = organisation.
- `Pro` = argent et decision.
- `Business` = pilotage global.
- Les paywalls doivent etre contextuels.
- Les controles serveurs sont la source de verite.
- Une fonctionnalite premium ne doit jamais etre protegee uniquement par l'UI.

---

## Trigger Conditions

Les paywalls de decision ne doivent s'activer que lorsque l'utilisateur a suffisamment de donnees.

Conditions minimales :

- au moins 3 jours de saisie
- au moins une depense d’aliment
- OU au moins une vente
- OU detection d'une anomalie

Logique :

- avant : `access = blocked`
- apres : `access = preview` ou `locked`
- avec bon plan : `access = full`

Objectif :

- eviter la frustration
- maximiser la conversion

---

## Progressive Value Exposure

FREE :
- statut simple : rentable / risque / incertain

STARTER :
- intervalle estimatif

PRO :
- valeur exacte

Objectif :

- creer de la curiosite
- renforcer la valeur
- pousser vers Pro

---

## Core Economic Driver

Le principal cout est l’aliment.

Conséquences :

- detecter toute derive
- alerter sur surconsommation
- integrer dans toutes les decisions

Objectif :

- faire de SunuFarm un outil anti-perte

---

## Architecture Cible

### Offer Catalog

- FREE, STARTER, PRO, BUSINESS
- prix, labels, CTA
- compatibilite BASIC

---

### Entitlements

Exemples :

- FARM_LIMIT
- ACTIVE_BATCH_LIMIT
- SALES
- EXPENSES
- BASIC_STOCK
- FULL_HISTORY
- DECISION_PREVIEW
- REAL_PROFITABILITY
- BREAK_EVEN_PRICE
- ALERT_MORTALITY
- ALERT_FEED_OVERUSE
- ALERT_LOW_STOCK
- LOT_ANALYSIS
- EXPORT_PDF
- EXPORT_WITHOUT_WATERMARK
- MULTI_FARM
- TEAM_ROLES
- GLOBAL_DASHBOARD
- BATCH_COMPARISON
- ADVANCED_REPORTS
- ACCOUNTING_EXPORT
- WHATSAPP_SMART_REMINDERS

---

### Gate Resolver

Retourne :

- access: full | preview | blocked | locked
- reason
- upgradePlan
- usage
- limit
- watermark
- cta

#### Access Semantics

- blocked : pas assez de donnees
- preview : valeur partielle visible
- locked : valeur calculee mais payante
- full : acces complet

---

### FeatureGate UI

Gere :

- blur
- preview
- CTA upgrade
- blocage
- watermark
- limite atteinte

---

### Enforcement

- controle serveur obligatoire
- UI alignee
- pas de duplication des regles

---

## UX Rule — No Dead Ends

Aucun paywall ne doit bloquer sans :

- explication
- valeur visible
- CTA clair

---

## Phases

### Phase 1 - Fondations pricing

Status : DONE

#### Checklist

- [x] Cartographier les usages actuels
- [x] Creer Offer Catalog
- [x] Creer Entitlements
- [x] Creer Gate Resolver
- [x] Creer FeatureGate
- [x] Support legacy BASIC
- [x] Migrer ecrans critiques

---

### Phase 2 - Monetization UX

Status : DONE

- [x] Audit rapide des ecrans deja migres
- [x] Premier paywall contextuel sur le detail lot autour de la rentabilite
- [x] Definition explicite des etats `blocked / preview / full` sur la zone rentabilite
- [x] Preview sur cartes rapports
- [x] Prix minimum de vente visible comme lecture premium centrale
- [x] Harmonisation de la grammaire economique `blocked / preview / full`
- [x] Harmonisation des CTA et messages sur les surfaces premium principales
- [x] Blur / CTA
- [x] Historique limite vs complet
- [x] Watermark export sur sous-lot reports
- [x] Page pricing

---

### Phase 3 - Pro

Status : DONE

- [x] Audit du systeme d alertes existant
- [x] Segmentation rappels simples vs alertes actionnables Pro
- [x] Integration initiale au gate resolver
- [x] Premier UX d alertes pour retention / conversion
- [x] Priorite, actions et hierarchie visuelle des alertes
- [x] Cadence, deduplication et anti-bruit du flux d alertes
- [x] Tendance par fenetre glissante (worsening / stable / improving)
- [x] Actions guidees : labels verbaux, URLs directes, tab/anchor, label trend-aware
- [x] UX finition : bouton high-priority, suppression consequence contradictoire, label vaccination contextuel
- [ ] Moments de verite — DIFFERE (Phase 5 ou iteration ulterieure)

Note : les "moments de verite" (declenchement d alertes directement dans les ecrans metier — ex: alerte prix min au moment de saisir une vente) ont ete identifies mais deprioritises. La couche alertes est jugee stable et suffisante pour la conversion Pro actuelle.

---

### Phase 4 - Business

Status : DONE

Objectif : debloquer le plan Business en rendant ses trois fonctionnalites distinctives reellement utilisables.

Perimetre :

- Multi-fermes : plusieurs fermes par organisation, navigation contextuelle
- Equipe et roles : invitation de membres, gestion des droits par ferme
- Dashboard global : vue agregee cross-fermes et cross-lots

Principes pour Phase 4 :

- L'entitlement `MULTI_FARM` existe deja dans le gate resolver — s appuyer dessus.
- Le schema `farmPermissions` est deja en base — les roles sont definis.
- Ne pas casser la logique single-farm des plans FREE / STARTER / PRO.
- Chaque fonctionnalite Business doit etre inaccessible (gate locked) sur les autres plans.

Sous-lots prevus :

#### Phase 4 — Sous-lot 1 : Audit perimetre Business — DONE

Resultats de l'audit :
- FARM_LIMIT : gate resolver en place, enforcement serveur correct, paywall basique (sans CTA /pricing)
- TEAM_ROLES : gate resolver en place, mais aucun gate plan sur team/page.tsx — management accessible a tous les plans
- GLOBAL_DASHBOARD : gate resolver + FeatureGateCard en place sur /business — complet
- BATCH_COMPARISON, ACCOUNTING_EXPORT : gate resolver en place, pas encore de surface UI Business independante

Actions decidees :
- Sous-lot 2 : upgrader le paywall fermes (FeatureGateCard avec highlights et CTA)
- Sous-lot 3 : ajouter gate TEAM_ROLES sur team/page.tsx

#### Phase 4 — Sous-lot 2 : Multi-fermes — DONE

- [x] Paywall ferme upgrade : FeatureGateCard avec highlights Business et CTA /pricing (FarmsClient.tsx)
- Note : navigation entre fermes (farm switcher header) differe en V2 — scope MVP = paywall contextuel correct

#### Phase 4 — Sous-lot 3 : Equipe et roles — DONE

- [x] Gate TEAM_ROLES ajoute dans team/page.tsx (parallele avec fetch members)
- [x] canManageTeam = isOwner && teamRolesGate.access === "full"
- [x] Card info contextuelle : message different selon isOwner (plan insuffisant) vs non-owner
- [x] Section admin remplacee par FeatureGateCard pour non-Business
- [x] Liste membres reste visible en lecture seule pour tous les plans
- Note : farmPermissions par ferme differe — le schema existe mais l'UI sera Phase 4 iteration suivante

#### Phase 4 — Sous-lot 4 : Dashboard global — DONE (existait deja)

- [x] /business gate GLOBAL_DASHBOARD avec FeatureGateCard — en place depuis Phase 1
- Note : cross-farm KPIs seront enrichis quand les orgs Business auront plusieurs fermes reelles

Checklist :

- [x] Sous-lot 1 : audit perimetre Business
- [x] Sous-lot 2 : multi-fermes (paywall)
- [x] Sous-lot 3 : equipe et roles (gate plan)
- [x] Sous-lot 4 : dashboard global (existait)

---

### Phase 5 - Automatisation

Status : IN PROGRESS

Objectif : mesurer avant d automatiser. Poser une base d instrumentation solide pour comprendre ce qui convertit et ce qui est vraiment utilise, avant tout rappel ou automatisation avancee.

Principes :
- Ne jamais bloquer le chemin utilisateur : track() est fire-and-forget
- Mesurer cote serveur en priorite (Server Components, API routes)
- Cote client : uniquement via Server Actions (jamais de SDK analytics navigateur en Phase 5 Sous-lot 1)
- Une table unique analytics_events — append-only, jamais mise a jour ni supprimee

#### Phase 5 — Sous-lot 1 : Instrumentation et funnel

Perimetre :
- Table analytique : analytics_events (Prisma, PostgreSQL)
- Couche track() : src/lib/analytics.ts — fire and forget, erreurs avalees
- Server Action : src/actions/analytics.ts — trackAlertAction pour les clics client
- Route redirect : app/api/track/pricing-cta — enregistre clic + redirige vers WhatsApp

Evenements traces :
  paywall_viewed        — quand un FeatureGateCard est rendu (5 surfaces instrumentees)
  pricing_page_visited  — quand /pricing est visite, avec contexte from=
  pricing_cta_clicked   — quand un bouton "Choisir plan" est clique (via redirect route)
  export_launched       — quand un rapport est telecharge (3 routes instrumentees)
  alert_action_clicked  — quand un bouton action d alerte est clique (NotificationDropdown)

Funnel mesurable :
  FREE -> STARTER  : paywall_viewed(batch_limit | full_history) -> pricing_page_visited(from=batch_limit) -> pricing_cta_clicked(STARTER)
  STARTER -> PRO   : paywall_viewed(profitability | margin | mortality | reports) -> pricing_page_visited -> pricing_cta_clicked(PRO)
  PRO -> BUSINESS  : paywall_viewed(business | team | farm_limit) -> pricing_page_visited -> pricing_cta_clicked(BUSINESS)

Surfaces instrumentees :
  - batches/[id]/page.tsx    : profitability, mortality, margin gates
  - reports/page.tsx         : reports gate
  - business/page.tsx        : GLOBAL_DASHBOARD gate
  - batches/new/page.tsx     : ACTIVE_BATCH_LIMIT gate
  - team/page.tsx            : TEAM_ROLES gate (owners uniquement)
  - FeatureGateCard          : prop trackingSurface -> /pricing?from= URL
  - /pricing page            : searchParams.from -> track pricing_page_visited
  - /api/track/pricing-cta   : track pricing_cta_clicked + redirect WhatsApp
  - 3 routes export          : track export_launched avec format + reportType
  - NotificationDropdown     : handleNavigate -> trackAlertAction server action

Checklist :
- [x] Sous-lot 1 : schema + couche analytics + instrumentation (5 paywalls, 3 exports, alertes, pricing)
- [x] Sous-lot 2 : exploitation funnel + evenements manquants + requetes d'analyse
- [x] Sous-lot 3 : analyse friction + recommandations produit + correction trous de tracking
- [x] Sous-lot 4 : vues KPI produit + agregations jour/semaine + verification coherence

#### Phase 5 — Sous-lot 2 : Exploitation funnel

Perimetre :
- Evenement subscription_activated ajoute a AnalyticsEventName
- Instrumentation dans activateOrganizationSubscription (src/lib/subscription-lifecycle.ts)
  - properties : { plan, triggeredBy, amountFcfa }
  - triggeredBy : "user_confirm" | "admin_direct" | "admin_wave"
  - Couvre les 3 chemins d'activation : confirmSubscriptionPayment, adminUpdateOrganizationSubscription, confirmPaymentTransaction (Wave)
- Requetes d'analyse creees dans docs/analytics/funnel-queries.sql :
  1. Funnel brut : unique orgs a chaque etape + taux de conversion
  2. Conversion par surface : quel paywall convertit le mieux
  3. Conversion par plan cible : quel plan est le plus clique / converti
  4. Drop-off par etape : ou les orgs abandonnent le funnel
  5. Breakdown activations : repartition par plan et triggeredBy
  6. Cohorte hebdomadaire : evolution dans le temps
  7. Audit de coherence : detecte les proprietes manquantes

Funnel complet mesurable :
  paywall_viewed -> pricing_page_visited -> pricing_cta_clicked -> subscription_activated
  Taux global = orgs ayant active / orgs ayant vu un paywall

Proprietes verifiees coherentes :
  paywall_viewed      : entitlement + surface + access (toutes les 5 surfaces ok)
  pricing_cta_clicked : targetPlan + from (route /api/track/pricing-cta)
  subscription_activated : plan + triggeredBy + amountFcfa (les 3 chemins)

#### Phase 5 — Sous-lot 3 : Analyse friction + optimisation funnel

Perimetre :
- Audit complet des call sites track() → 3 trous de tracking identifies et corriges
- Nouvel evenement subscription_payment_requested ajoute au funnel
- Funnel complet en 5 etapes apres corrections

Trous corriges :
  1. FULL_HISTORY surface manquante :
     - batches/[id]/page.tsx : ajout track(paywall_viewed) pour historyGate
     - RecentDailyRecords.tsx : lien /pricing -> /pricing?from=full_history
  2. farm_limit surface manquante :
     - farms/page.tsx : ajout track(paywall_viewed) quand farmGate.access != "full"
     - FarmsClient.tsx FeatureGateCard : ajout trackingSurface="farm_limit"
  3. Boite noire WhatsApp :
     - subscriptions.ts createSubscriptionPaymentRequest : ajout track(subscription_payment_requested)
     - proprietes : { plan, amountFcfa, paymentMethod }
     - comble le gap entre pricing_cta_clicked (WhatsApp) et subscription_activated

Funnel complet apres corrections (5 etapes) :
  paywall_viewed
  -> pricing_page_visited  (from = surface d'origine)
  -> pricing_cta_clicked   (targetPlan + from)
  -> subscription_payment_requested  (plan + amountFcfa + paymentMethod)  ← nouveau
  -> subscription_activated          (plan + triggeredBy + amountFcfa)

Surfaces desormais toutes instrumentees (7 surfaces) :
  batch_detail (profitability, mortality, margin), full_history, batch_limit, reports, business, team, farm_limit

Recommandations produit (identifies lors de l'audit, non implementees) :
  R1 — Analyser quel paywall convertit le mieux via query 2 une fois les donnees accumulees
       Hypothese : full_history (FREE) et batch_limit (FREE) ont le plus haut volume de vues
       Action attendue : si full_history > 20% des vues mais < 5% de conversion → renforcer le message Starter
  R2 — Mesurer le drop-off cta->payment (step 3->4) pour detecter la friction WhatsApp
       Si > 70% des clics CTA n aboutissent pas a un payment_requested en 48h → le tunnel WhatsApp est le goulot principal
       Action attendue : ajouter un relance par notification in-app 24h apres clic CTA sans payment
  R3 — Surveiller payment->activation (step 4->5) pour detecter les retards admin
       Si > 48h entre payment_requested et activation → processus manuel trop lent
       Action attendue : alerter l admin via notification quand un paiement reste PENDING > 24h

#### Phase 5 — Sous-lot 4 : Vues KPI produit

Perimetre :
- 3 vues PostgreSQL persistantes dans docs/analytics/kpi-views.sql
- Interrogeables directement depuis le SQL editor Supabase, sans UI supplementaire

Vues creees (CREATE OR REPLACE VIEW) :
  v_kpi_free_to_starter   — orgs FREE exposees a un paywall -> orgs ayant active STARTER (30j glissants)
  v_kpi_starter_to_pro    — orgs STARTER exposees a un paywall -> orgs ayant active PRO (30j glissants)
  v_kpi_cta_dropoff       — orgs ayant clique CTA -> % n'ayant pas soumis de paiement dans les 48h

Lecture instantanee :
  SELECT * FROM v_kpi_free_to_starter;
  SELECT * FROM v_kpi_starter_to_pro;
  SELECT * FROM v_kpi_cta_dropoff;
  -- ou les 3 en une seule requete (section 2 du fichier)

Agregations temporelles disponibles :
  - Par jour : 7 derniers jours — activations, paywalls par surface, CTA par plan cible
  - Par semaine : 8 dernieres semaines — conversion FREE->STARTER, STARTER->PRO, drop-off CTA->paiement

Verification de coherence (section 5) :
  - 6 controles automatiques : surfaces manquantes, plans manquants, triggeredBy inconnu, organization_id null
  - Resultat attendu : 0 anomalie sur chaque ligne

---

## Definition of Done (Phase 1)

- catalogue implemente
- entitlements centralises
- gate resolver en place
- 3 ecrans migrés
- BASIC encore fonctionnel

---

## Non-Goals (Phase 1)

- pas de WhatsApp intelligent
- pas de refonte alertes complete
- pas de redesign global UI
- pas de migration destructive

---

## Success Metrics

- conversion FREE → STARTER
- conversion STARTER → PRO
- clics paywalls
- activation utilisateur

---

## Progress Tracking

### Global

- Phase 1 : DONE
- Phase 2 : DONE
- Phase 3 : DONE
- Phase 4 : DONE
- Phase 5 : IN PROGRESS

---

### Completed in Phase 1

- nouveau `Offer Catalog` cree
- nouveau module `Entitlements` cree
- nouveau `Gate Resolver` cree
- nouveau composant `FeatureGateCard` cree
- compatibilite legacy `BASIC` ajoutee via `commercialPlan`
- migrations critiques appliquees sur :
  - detail lot
  - rapports
  - business
  - creation lot
  - limites fermes
- enforcement serveur aligne sur le resolver pour :
  - profitability
  - predictive
  - business
  - limits lots / fermes
  - exports rapports critiques

### Verification

- `npx tsc --noEmit` : OK
- `npx eslint ...` sur les fichiers modifies : OK

---

### Phase 2 - Sous-lot 1

Statut :

- audit et premier paywall contextuel livres

Audit rapide des ecrans deja migres :

- `detail lot` : gating serveur correct, mais le mode `preview` etait encore rendu comme un simple paywall sans valeur visible
- `rapports` : comportement coherent en `locked / full`, mais pas encore de preview metier visible
- `business` : comportement coherent en `locked / full`, reserve au plan `Business`
- `exports rapports` : enforcement serveur en place, mais experience `watermark Starter` encore a rendre visible et produit
- compatibilite legacy `BASIC` : conservee via mapping `BASIC actif -> STARTER`, `BASIC non payant / absent -> FREE`

Etat cible maintenant visible sur la rentabilite lot :

- `blocked` : moins de 3 jours de saisie ou pas encore de signal economique exploitable
- `preview` : FREE ou STARTER avec assez de donnees, affichage d'une decision preview sans valeur exacte
- `full` : PRO, BUSINESS ou trial actif, affichage de la rentabilite exacte

Travail livre :

- correction du trigger decisionnel pour inclure aussi les ventes deja saisies
- ajout d'une vraie `ProfitabilityPreviewCard` sur le detail lot
- differentiation visible des niveaux de valeur :
  - FREE : statut simple
  - STARTER : fourchette estimative de pression economique
  - PRO : valeur exacte
- conservation stricte de la saisie journaliere sans blocage
- conservation stricte de la compatibilite legacy

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint "app/(dashboard)/batches/[id]/page.tsx" "app/(dashboard)/batches/[id]/_components/ProfitabilityPreviewCard.tsx"` : OK

---

### Phase 2 - Sous-lot 2

Statut :

- reports preview et watermark Starter livres

Audit rapide de la surface reports :

- `reports/page.tsx` etait encore en hard lock `locked / full` sans vraie valeur visible pour FREE ou STARTER
- l'export mensuel PDF etait bloque pour tous les plans non Pro, donc la promesse `Starter = export PDF avec watermark` n'etait pas encore materialisee
- la compatibilite legacy `BASIC` restait correcte via le mapping `BASIC actif -> STARTER`

Travail livre :

- ajout d'une vraie decision preview sur la page `Rapports`
- alignement du gate `ADVANCED_REPORTS` avec les etats :
  - `blocked` : pas assez de donnees mensuelles utiles
  - `preview` : tendance visible sans rapport complet
  - `full` : rapport complet Pro / Business
- ajout d'un `ReportsPreviewCard` coherent avec la logique du detail lot :
  - FREE : signal simple
  - STARTER : zone estimative
  - PRO : lecture complete
- ouverture du PDF mensuel preview pour `Starter` avec watermark visible
- ajout d'un watermark visible sur les exports PDF concernes pour eviter les incoherences entre surfaces

Comportement attendu par plan :

- `FREE` :
  - page reports en `blocked` ou `preview` selon les donnees
  - pas d'export mensuel
- `STARTER` :
  - page reports en `preview`
  - export PDF mensuel preview avec watermark
- `PRO` :
  - page reports en `full`
  - exports complets sans watermark
- `BUSINESS` :
  - page reports en `full`
  - exports complets sans watermark
- `legacy BASIC actif` :
  - comportement identique a `STARTER`

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint "app/(dashboard)/reports/page.tsx" "app/(dashboard)/reports/_components/ReportsPreviewCard.tsx" "app/api/reports/monthly/route.ts" "app/api/reports/batch/[id]/route.ts" "src/lib/reports-preview.ts" "src/lib/gate-resolver.ts" "src/components/pdf/MonthlyReportDocument.tsx" "src/components/pdf/BatchReportDocument.tsx"` : OK

---

### Phase 2 - Sous-lot 3

Statut :

- prix minimum de vente et harmonisation des surfaces premium economiques livres

Audit rapide des surfaces premium restantes liees a la decision economique :

- le `prix minimum de vente` existait dans la carte full de rentabilite, mais n'etait pas encore traite comme une lecture premium visible en mode preview
- le gate `BREAK_EVEN_PRICE` existait dans le resolver mais n'etait pas branche explicitement sur le detail lot
- les cartes premium autour de la marge et de la mortalite utilisaient encore une copie moins homogène que `rentabilite` et `reports`

Travail livre :

- branchement explicite du gate `BREAK_EVEN_PRICE` sur le detail lot
- enrichissement de la `decision preview` du lot pour inclure le `prix minimum de vente`
- niveau de valeur maintenant visible :
  - FREE : signal simple
  - STARTER : fourchette estimative
  - PRO : valeur exacte
- harmonisation de la copie du resolver pour distinguer :
  - `REAL_PROFITABILITY`
  - `BREAK_EVEN_PRICE`
- harmonisation des hints premium sur :
  - projection de marge
  - prediction mortalite
- premier cadrage UX pour la future separation :
  - rappels simples accessibles
  - alertes actionnables reservees au plan Pro

Comportement attendu par plan :

- `FREE` :
  - signal simple sur rentabilite
  - signal simple ou preparation sur prix minimum
- `STARTER` :
  - fourchette estimative sur rentabilite
  - fourchette estimative sur prix minimum
- `PRO` :
  - rentabilite exacte
  - prix minimum exact
- `BUSINESS` :
  - meme lecture exacte que Pro sur ces surfaces
- `legacy BASIC actif` :
  - comportement identique a `STARTER`

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint "app/(dashboard)/batches/[id]/page.tsx" "app/(dashboard)/batches/[id]/_components/ProfitabilityPreviewCard.tsx" "src/lib/gate-resolver.ts"` : OK

---

### Phase 2 - Sous-lot 4

Statut :

- consolidation UX et conversion Pro livrees sur les surfaces premium principales

Audit global des surfaces premium :

- `detail lot` : bonne logique produit, mais les CTA et messages variaient encore selon les cartes
- `reports` : bonne logique preview, mais la promesse Pro etait moins explicite que sur le detail lot
- `marge / mortalite` : cards encore coherentes techniquement, mais ton plus generique et moins oriente decision

Travail livre :

- creation d'une couche de copy partagee dans `src/lib/premium-surface-copy.ts`
- harmonisation des surfaces premium autour d'une meme logique :
  - signal
  - estimation
  - precision Pro
- harmonisation de la structure visuelle de `FeatureGateCard`
- harmonisation des CTA pour les surfaces premium principales :
  - rentabilite / prix minimum
  - reports
  - projection de marge
  - prediction mortalite
- clarification plus explicite de la valeur Pro :
  - eviter la perte
  - fixer le bon prix
  - piloter le mois
  - agir plus tot

Verification de coherence produit :

- `FREE` : signal
- `STARTER` : estimation
- `PRO` : precision
- `BUSINESS` : precision + pilotage transverse
- `legacy BASIC actif` : comportement identique a `STARTER`

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint "app/(dashboard)/batches/[id]/page.tsx" "app/(dashboard)/batches/[id]/_components/ProfitabilityPreviewCard.tsx" "app/(dashboard)/reports/page.tsx" "app/(dashboard)/reports/_components/ReportsPreviewCard.tsx" "src/components/subscription/FeatureGateCard.tsx" "src/lib/gate-resolver.ts" "src/lib/premium-surface-copy.ts"` : OK

---

### Phase 2 - Sous-lot 5

Statut :

- historique limite vs complet livre

Travail livre :

- ajout de `FULL_HISTORY` dans `SubscriptionEntitlement` et `PLAN_ENTITLEMENTS` :
  - FREE : false
  - STARTER, PRO, BUSINESS : true
- ajout de la constante `FREE_HISTORY_LIMIT = 7` dans `entitlements.ts`
- ajout du cas `FULL_HISTORY` dans `gate-resolver.ts` :
  - FREE → `locked` (upgrade Starter)
  - STARTER+ → `full`
- resolution du `historyGate` dans le detail lot
- passage de `historyLocked` et `totalRecordsCount` au composant `RecentDailyRecords`
- ajout d une banniere visuelle dans `RecentDailyRecords` quand `historyLocked = true` :
  - nombre de saisies visibles + nombre cache
  - message d upgrade vers Starter
  - lien "Voir les plans" → `/pricing`

Comportement attendu :

- FREE : 7 saisies visibles + banniere "Historique limite"
- STARTER+ : 7 saisies visibles + lien "Saisir / Voir tout" (sans banniere)
- le lien "Voir tout" est retire pour FREE (remplace par "Saisir" uniquement)

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint` cible : OK

---

### Phase 2 - Sous-lot 6

Statut :

- blur et CTA fonctionnel livres

Travail livre :

- `FeatureGateCard` : CTA passe de `<p>` a `<Link href="/pricing">` avec fleche visuelle et hover
- `ProfitabilityPreviewCard` : colonne "Lecture Pro" blurée avec icone verrou :
  - valeur fake blurée : `blur-sm select-none`
  - overlay semi-transparent + icone `Lock` centree
  - meme traitement sur la colonne "Lecture Pro" du prix minimum de vente
- `ReportsPreviewCard` : colonne "Lecture Pro" blurée avec meme pattern

Effet produit :

- l utilisateur voit qu il y a quelque chose derriere la colonne Pro
- le flou suggere la valeur sans la reveler
- le CTA conduit maintenant vers la page pricing au lieu d etre un texte mort

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint` cible : OK

---

### Phase 2 - Sous-lot 7

Statut :

- page pricing livree

Travail livre :

- creation de `app/(dashboard)/pricing/page.tsx`
- affichage des 4 plans en grille (FREE / STARTER / PRO / BUSINESS)
- donnees issues de `COMMERCIAL_PLAN_CATALOG` (source de verite unique)
- badge "Plan actuel" sur le plan de l utilisateur connecte (detection via `getOrganizationSubscription`)
- badge "Recommande" sur le plan PRO
- tableau de comparaison detaillee sur les fonctionnalites cles
- CTA "Choisir {plan}" → lien WhatsApp pre-rempli
- note de bas de page : sans engagement, contact WhatsApp
- plan FREE et plan actuel sans CTA (affichage neutre)

Comportement attendu :

- tous les utilisateurs connectes peuvent acceder a `/pricing`
- le plan actuel est mis en evidence avec un ring vert
- les CTAs sont fonctionnels (WhatsApp) pour STARTER, PRO, BUSINESS

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint` cible : OK

---

### Phase 3 - Sous-lot 5

Statut :

- actions immédiates livrées : labels ciblés, URLs directes (tab + anchor hash), bouton high-priority proéminent

Objectif :

- transformer chaque alerte en déclencheur d action directe
- réduire la friction entre la notification et la zone concernée dans l interface
- rendre le bouton d action visuellement dominant pour les alertes critiques

Audit initial (avant ce sous-lot) :

- `BATCH_VACCINATION_REMINDER` : aucune action définie → fall-through vers `{}` (invisible)
- Tous les types stock → `/stock` sans onglet : l utilisateur arrive sur le tab par défaut (aliment), même pour une alerte médicament
- Labels génériques : "Voir le lot" pour mortalité, marge, motif manquant — pas d intention d action
- Aucun anchor hash sur les cards de prédiction → navigation générique vers la page
- Bouton action identique visuellement pour `high`, `medium`, `low`

Travail livré :

**`src/actions/notifications.ts` — `getNotificationActionInfo()`**

- `FEED_STOCK`      → `"Gérer le stock aliment"` + `/stock?tab=aliment`
- `FEED_STOCK_RUPTURE` → `"Réapprovisionner"` + `/stock?tab=aliment`
- `MEDICINE_STOCK`  → `"Gérer le stock médicament"` + `/stock?tab=medicament`
- `MEDICINE_STOCK_EXPIRY` → `"Gérer l expiration"` + `/stock?tab=medicament`
- `MEDICINE_STOCK_RUPTURE` → `"Réapprovisionner"` + `/stock?tab=medicament`
- `DAILY_RECORD_MISSING` (groupée) → `"Saisir pour les lots"` + `/batches`
- `DAILY_RECORD_MISSING` (individuelle) → `"Saisir maintenant"` + `/batches/{id}` (inchangé)
- `DAILY_RECORD` → `"Documenter l anomalie"` + `/batches/{batchId}`
- `BATCH` (motif) → `"Saisir le motif"` + `/batches/{id}`
- `BATCH_MORTALITY_PREDICTIVE` → `"Analyser le risque"` + `/batches/{id}#alerte-mortalite`
- `BATCH_MARGIN_PREDICTIVE` → `"Analyser la marge"` + `/batches/{id}#alerte-marge`
- `BATCH_VACCINATION_REMINDER` → `"Voir la vaccination"` + `/batches/{batchId}#sante`
  (extraction du batchId depuis le resourceId composite `{batchId}:{vaccineName}:{dayOfAge}`)
- `INVOICE_OVERDUE` → `"Voir les créances"` + `/finances`
- `FARM_WEATHER` → `"Voir les fermes"` + `/farms` (inchangé)

**`app/(dashboard)/stock/page.tsx`**

- ajout du paramètre `searchParams: Promise<{ tab?: string }>` sur le Server Component
- dérivation de `initialTab: "ALIMENT" | "MEDICAMENT"` selon `?tab=medicament`
- propagation via prop `initialTab` vers `StockPageClient`

**`app/(dashboard)/stock/_components/StockPageClient.tsx`**

- ajout de `initialTab?: "ALIMENT" | "MEDICAMENT"` dans le type `Props`
- `useState<StockTab>(initialTab ?? "ALIMENT")` — tab présélectionné au montage

**`app/(dashboard)/batches/[id]/_components/BatchMortalityPredictionCard.tsx`**

- `<section id="alerte-mortalite" ...>` — cible du scroll depuis les alertes mortalité

**`app/(dashboard)/batches/[id]/_components/BatchMarginProjectionCard.tsx`**

- `<section id="alerte-marge" ...>` — cible du scroll depuis les alertes marge

**`app/(dashboard)/batches/[id]/_components/HealthSection.tsx`**

- `<div id="sante" ...>` — cible du scroll depuis les rappels vaccination

**`src/components/layout/NotificationDropdown.tsx`**

- bouton action `high` : pleine largeur, fond rouge (`bg-red-600`), font semibold, icon → se distingue clairement
- bouton action `medium` / `low` : inchangé (inline, petit, amber / gray)
- le bouton haute priorité est positionné AVANT la ligne meta (date / Persistant) pour être immédiatement visible

Decision produit prise :

- le tab stock est résolu côté serveur (searchParams) → pas de `useSearchParams()` côté client, pas de Suspense boundary supplémentaire
- le scroll vers l anchor hash est natif navigateur → aucun `useEffect` requis si les sections sont server-rendered
- `BATCH_VACCINATION_REMINDER` utilise le split de resourceId (composite UUID:nom:jour) pour retrouver le batchId — fiable car les UUID ne contiennent pas de `:`
- les labels d action utilisent un verbe d action ("Saisir", "Réapprovisionner", "Analyser") plutôt qu un état ("Voir") — intention claire pour l utilisateur

Verification :

- `npx tsc --noEmit` : OK

**Addendum — passe de finition (Session 14)**

Travail additionnel sur la coherence action / tendance :

- `DAILY_RECORD` : URL mise a jour vers `/batches/{id}#saisies` + `id="saisies"` ajoute sur `RecentDailyRecords`
- `BATCH_VACCINATION_REMINDER` : label contextualise selon `isTomorrow` : "Vacciner maintenant" si J, "Preparer la vaccination" si J-1
- `getNotifications` map step : `getWorseningActionLabel()` — label plus urgent si `trend = worsening` + `priority = high` :
  - `BATCH_MORTALITY_PREDICTIVE` → "Corriger maintenant"
  - `BATCH_MARGIN_PREDICTIVE` → "Agir sur la marge"
  - `FEED/MEDICINE_STOCK_RUPTURE` → "Reapprovisionner d urgence"
- `NotificationDropdown` : consequence supprimee si `trend = improving` (le signal se redresse, la consequence alarmisteest contradictoire — la ligne tendance suffit)
- `NotificationDropdown` : bouton action `high` + `improving` → amber (`bg-amber-500`) au lieu de rouge — urgence attenueemais action toujours encouragee
- `npx tsc --noEmit` : OK

---

### Phase 3 - Sous-lot 4

Statut :

- couche d intelligence livree : tendance par signal (worsening / stable / improving) — calcul par fenetre glissante

Objectif :

- ajouter une notion d evolution robuste du probleme sur chaque alerte recurrente
- utiliser une moyenne sur deux demi-fenetres temporelles plutot qu une comparaison ponctuelle J-1 vs J-2
- ignorer la tendance si pas assez de points de mesure (minimum 2 signaux anterieurs valides)
- afficher : icone + couleur + label + micro explication dans la dropdown

Architecture du calcul (window-based) :

- fenetre de reference : 14 jours (au lieu de 7) pour accumuler assez de points par signal
- une seule requete Prisma supplementaire (commune avec `isRecurring`)
- signaux anterieurs groupes par cle `resourceType:resourceId`, tries par date decroissante
- division en deux demi-fenetres : recente (premiere moitie) et ancienne (deuxieme moitie)
- la notification courante est integree dans la fenetre recente pour le calcul de la moyenne
- minimum 2 signaux anterieurs avec metrique valide requis — sinon `undefined` (pas de badge)
- comparaison par delta relatif (evite d etre sensible aux unites : FCFA, kg, %, jours)

Metriques par resourceType :

- `DAILY_RECORD`               → `mortalityRate`         (hausse = aggravation, seuil 20 %)
- `FEED_STOCK`                 → `quantityKg`            (baisse = aggravation, seuil 15 %)
- `MEDICINE_STOCK`             → `quantityOnHand`        (baisse = aggravation, seuil 15 %)
- `FEED/MEDICINE_STOCK_RUPTURE`→ `daysToStockout`        (baisse = aggravation, seuil 20 %)
- `BATCH_MORTALITY_PREDICTIVE` → `riskScore`             (hausse = aggravation, seuil 15 %)
- `BATCH_MARGIN_PREDICTIVE`    → `projectedProfitFcfa`   (baisse = aggravation, seuil 15 %)
- `MEDICINE_STOCK_EXPIRY`      → `daysLeft`              (baisse = aggravation, seuil 25 %)
- autres types                 → `undefined` (pas de tendance affichee)

Gestion des cas limites :

- reference (fenetre ancienne) = 0 : cas traite explicitement selon la direction du type
- metadonnees partiellement absentes : valeurs nulles ignorees (filter null)
- delta relatif < seuil → "stable" (pas de badge — silence = bonne nouvelle)
- ordonnancement preserve depuis la requete orderBy desc → pas de tri supplementaire

UX dans NotificationDropdown :

- ligne de tendance positionnee apres la consequence, avant la ligne date/badges/action
- `worsening` : fond rouge, icone TrendingUp, label "S aggrave" + micro explication
- `improving` : fond vert, icone TrendingDown, label "S ameliore" + micro explication
- `stable` ou `undefined` : rien — silence volontaire pour ne pas creer de bruit visuel
- TREND_COPY : table exhaustive par `resourceType` pour les micro explications

Helpers introduits dans `notifications.ts` :

- `TREND_HIGHER_IS_WORSE` : table de direction par type
- `TREND_STABLE_THRESHOLD` : seuils relatifs par type
- `extractTrendMetric()` : extrait la metrique numerique d un objet metadata
- `calculateWindowTrend()` : calcul principal avec split en deux fenetres

Decision produit prise :

- la tendance n est calculee que pour les signaux `isRecurring: true` : sans precedent recent dans les 7 derniers jours, pas de baseline coherente
- "stable" ne genere aucun badge : un signal persistant et stable n a pas besoin d un label supplementaire
- les seuils sont larges par design (15-25 %) pour eviter les faux positifs sur du bruit de mesure
- la priorite CSS n est pas modifiee automatiquement : `worsening` est un signal additionnel, pas un ecrasement de priorite

Verification :

- `npx tsc --noEmit` : OK

---

### Phase 3 - Sous-lot 3

Statut :

- qualite du flux d alertes livree : cadence, deduplication, anti-bruit

Audit du flux existant (avant ce sous-lot) :

- `MEDICINE_STOCK_EXPIRY` : se repetait chaque jour pendant jusqu a 30 jours pour un stock qui ne change pas → signal fortement bruyant
- `MEDICINE_STOCK`, `FEED_STOCK` : alertes quotidiennes alors que le signal peut persister plusieurs jours sans action possible
- `DAILY_RECORD_MISSING` : generait N notifications pour N lots actifs sans saisie → explosion si plusieurs lots actifs
- `BATCH_VACCINATION_REMINDER`, `INVOICE_OVERDUE`, `BATCH` (motif manquant) : tous quotidiens, trop frequents pour leur urgence reelle
- aucun signal de persistance : un signal critique revenant 5 jours de suite apparaissait comme "nouveau" a chaque fois
- notifications LU jamais archivees → accumulation indefinie en base

Travail livre :

- remplacement de la deduplication calendaire par une fenetre glissante par `resourceType` :
  - `MEDICINE_STOCK_EXPIRY` : 7 jours (peremption lente)
  - `MEDICINE_STOCK` : 3 jours
  - `FEED_STOCK` : 2 jours
  - `BATCH` (motif manquant) : 2 jours
  - `BATCH_VACCINATION_REMINDER` : 3 jours
  - `INVOICE_OVERDUE` : 3 jours
  - alertes critiques et hygiene quotidienne : 1 jour (inchange)
- regroupement de `DAILY_RECORD_MISSING` :
  - si 1 lot manquant → notification individuelle (action `/batches/{batchId}`)
  - si 2+ lots manquants → notification groupee unique (action `/batches`)
  - evite l explosion du nombre de notifications avec plusieurs lots actifs
- detection de persistance `isRecurring` dans `getNotifications` :
  - 1 requete supplementaire pour detecter les signaux apparus dans les 7 derniers jours
  - badge "Persistant" afiche dans la dropdown pour les signaux non resolus
- auto-archival silencieux dans `generateNotificationsForOrganization` :
  - les notifications LU datant de plus de 14 jours sont automatiquement archivees
  - operation idempotente, silencieuse, ne bloque pas la generation
- mise a jour de `getNotificationActionInfo` pour le cas groupe :
  - `resourceId` commencant par `grouped-` → action `/batches` avec label "Voir les lots"

Comportement attendu :

- `MEDICINE_STOCK_EXPIRY` : 1 rappel maximum par semaine (au lieu de 30)
- plusieurs lots actifs sans saisie → 1 seule notification groupee
- signal critique persistant → badge "Persistant" visible
- liste de notifications → automatiquement epuree des elements lus depuis > 14 jours

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint "src/actions/notifications.ts" "src/components/layout/NotificationDropdown.tsx"` : OK

---

### Phase 3 - Sous-lot 2

Statut :

- moteur de retention et d action livre sur les alertes premium

Audit du sous-lot 1 :

- `priority` absente du type `NotificationSummary` : les alertes actionnables n etaient pas distinguees visuellement des rappels simples
- `actionUrl` absent : aucune alerte ne proposait un chemin direct vers le lot, le stock ou les finances
- tri dans `getNotifications` basé uniquement sur `createdAt` : les alertes critiques pouvaient etre enfouies sous des rappels de saisie
- teasers Pro sans `priority` : leur importance visuelle n etait pas encodee dans le type
- dropdown sans groupes : critique, important et rappels coexistaient sans separation lisible

Travail livre :

- ajout de `priority: "high" | "medium" | "low"` dans `NotificationSummary`
- ajout de `actionLabel` et `actionUrl` dans `NotificationSummary`
- ajout de `priority: "high"` dans `NotificationTeaser` (tous les teasers sont critiques)
- enrichissement de `decorateNotification` :
  - priorite calculee a partir de `alertKind` + `signalTone` + `resourceType`
  - `high` : alertes actionnables critiques (rupture imminente, risque mortalite, derive marge)
  - `medium` : alertes actionnables warning (creances) ou anomalies simples avec consequence (mortalite, motif manquant)
  - `low` : rappels simples (saisie, stock bas, peremption, meteo)
  - action URL derivee du `resourceType` :
    - `DAILY_RECORD_MISSING` → `/batches/{batchId}` avec label "Saisir maintenant"
    - `BATCH`, `BATCH_MORTALITY_PREDICTIVE`, `BATCH_MARGIN_PREDICTIVE` → `/batches/{resourceId}` avec label "Voir le lot"
    - stocks → `/stock`
    - finances → `/finances`
    - fermes → `/farms`
- tri serveur dans `getNotifications` : high → medium → low puis par date
- refonte complete de `NotificationDropdown` :
  - sections distinctes : Critique / Important / Rappels / Alertes Pro
  - bordure gauche coloree par priorite (rouge, orange, transparente)
  - icone alerte pour les high-priority
  - bouton action inline avec couleur coherente a la priorite
  - collapse des rappels low apres 3 avec bouton "N autres rappels"
  - teasers Pro avec bordure et fond coherents au `signalTone`

Comportement attendu par plan :

- `FREE` : rappels low uniquement + teasers Pro eventuel
- `STARTER` : rappels low + eventuellement motif manquant (medium) + teasers Pro
- `PRO` : alertes high (ruptures, mortalite, marge) visibles en tete + medium + low
- `BUSINESS` : meme base que Pro
- `legacy BASIC actif` : comportement identique a `STARTER`

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint "src/actions/notifications.ts" "src/components/layout/NotificationDropdown.tsx"` : OK

---

### Phase 3 - Sous-lot 1

Statut :

- moteur initial d alertes premium livre

Audit du systeme d alertes existant :

- alertes visibles pour tous :
  - stock aliment sous seuil
  - stock medicament bas
  - medicament proche peremption
  - saisie journaliere manquante
  - mortalite elevee du jour
  - motif de mortalite manquant
- alertes deja premium dans le moteur :
  - rupture stock predictive
  - risque mortalite predictif
  - projection de marge negative
  - meteo
  - rappels vaccination
  - creances en retard
- principal ecart produit :
  - les alertes premium existaient surtout comme logique de generation
  - la surface utilisateur ne distinguait pas clairement `rappel simple` vs `alerte actionnable`

Segmentation produit retenue :

- `FREE / STARTER` :
  - rappels simples
  - hygiene de saisie
  - stock bas
  - peremption
  - motifs manquants
- `PRO` :
  - alertes actionnables a forte valeur economique
  - derive mortalite
  - rupture stock
  - projection de marge negative

Travail livre :

- enrichissement serveur des notifications avec :
  - `alertKind`
  - `signalLabel`
  - `signalTone`
  - `consequence`
- ajout de teasers Pro dans la dropdown notifications quand le plan n a pas encore acces aux lectures actionnables
- integration du `gate resolver` pour les alertes predictives dans :
  - la generation
  - la presentation des teasers
- filtrage des notifications predictives si un plan non-Pro en possede encore historiquement
- UX dropdown renforcee :
  - signal visuel
  - consequence lisible
  - CTA oriente action / conversion

Verification produit :

- `FREE` : rappels simples + teasers Pro eventuels si la donnee devient exploitable
- `STARTER` : rappels simples + teasers Pro eventuels si la donnee devient exploitable
- `PRO` : alertes actionnables visibles comme telles
- `BUSINESS` : meme base que Pro sur les alertes actionnables
- `legacy BASIC actif` : comportement identique a `STARTER`

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint "src/actions/notifications.ts" "src/components/layout/NotificationDropdown.tsx" "src/lib/gate-resolver.ts" "src/lib/premium-surface-copy.ts"` : OK

---

## Session Log

### Session 1 - 2026-04-11

- creation roadmap
- analyse repo
- definition phases

### Session 2 - 2026-04-11

Contexte :

- implementation de la Phase 1 dans le code

Travail realise :

- creation de `src/lib/offer-catalog.ts`
- creation de `src/lib/entitlements.ts`
- creation de `src/lib/gate-resolver.ts`
- creation de `src/components/subscription/FeatureGateCard.tsx`
- extension de `src/lib/subscriptions.server.ts` avec :
  - `commercialPlan`
  - `currentPlanLabel`
  - `hasPaidAccess`
  - compatibilite legacy `BASIC`
- migration vers le resolver sur :
  - `src/actions/profitability.ts`
  - `src/actions/predictive.ts`
  - `src/actions/business.ts`
  - `src/actions/batches.ts`
  - `src/actions/farms.ts`
- migration UI sur :
  - `app/(dashboard)/batches/[id]/page.tsx`
  - `app/(dashboard)/reports/page.tsx`
  - `app/(dashboard)/business/page.tsx`
  - `app/(dashboard)/batches/new/page.tsx`
  - `app/(dashboard)/farms/page.tsx`
  - `app/(dashboard)/farms/_components/FarmsClient.tsx`
- migration enforcement exports sur :
  - `app/api/reports/monthly/route.ts`
  - `app/api/reports/business/route.ts`
  - `app/api/reports/batch/[id]/route.ts`

Verification :

- `npx tsc --noEmit` passe
- `npx eslint` cible sur les fichiers modifies passe

Decision :

- la Phase 1 est consideree comme livree selon la `Definition of Done`
- la prochaine priorite devient la Phase 2, centree sur l'UX de monetisation

### Session 3 - 2026-04-11

Contexte :

- sous-lot controle de validation et de demarrage de la Phase 2
- objectif limite au comportement reel des plans et a la premiere experience de paywall contextuel sur la rentabilite lot

Travail realise :

- audit rapide des ecrans deja migres :
  - `app/(dashboard)/batches/[id]/page.tsx`
  - `app/(dashboard)/reports/page.tsx`
  - `app/(dashboard)/business/page.tsx`
  - `app/api/reports/batch/[id]/route.ts`
- validation de la compatibilite legacy `BASIC`
- correction du trigger de rentabilite lot pour tenir compte de :
  - 3 jours de saisie minimum
  - depenses
  - ventes
  - ou anomalie mortalite
- creation de `app/(dashboard)/batches/[id]/_components/ProfitabilityPreviewCard.tsx`
- integration du preview dans `app/(dashboard)/batches/[id]/page.tsx`

Decision UX prise :

- sur le detail lot, on ne montre plus un paywall nu quand `preview` est disponible
- la surface rentabilite suit maintenant cette logique :
  - `blocked` : pas assez de donnees
  - `preview` : decision preview visible sans valeur exacte
  - `full` : lecture economique complete
- l'etat `locked` reste reserve aux autres surfaces premium qui n'ont pas encore recu leur preview metier

Verification :

- `npx tsc --noEmit` passe
- `npx eslint` cible sur les fichiers modifies passe

Risques / reste a traiter :

- `reports` et `business` n'ont pas encore de preview metier equivalent
- `watermark Starter` reste encore principalement technique, pas encore transforme en experience visible complete

### Session 4 - 2026-04-11

Contexte :

- sous-lot controle Phase 2 sur `reports + watermark Starter`
- objectif : livrer une vraie experience preview sur les rapports sans ouvrir toute la Phase 2

Travail realise :

- audit rapide de :
  - `app/(dashboard)/reports/page.tsx`
  - `app/(dashboard)/reports/_components/ReportsPageClient.tsx`
  - `app/api/reports/monthly/route.ts`
  - `app/api/reports/batch/[id]/route.ts`
- extension du gate `ADVANCED_REPORTS` pour supporter `blocked / preview / full`
- creation de `src/lib/reports-preview.ts`
- creation de `app/(dashboard)/reports/_components/ReportsPreviewCard.tsx`
- integration du preview sur la page reports
- ouverture d'un PDF mensuel preview pour `Starter`
- ajout d'un watermark visible sur les PDF concernes

Decision UX prise :

- la page `reports` suit maintenant la meme grammaire que le detail lot :
  - FREE voit un signal simple
  - STARTER voit une zone estimative + un PDF watermarked
  - PRO / BUSINESS voient la lecture complete
- le watermark est traite comme un signe de valeur partiellement debloquee, pas comme un simple artefact technique

Verification :

- `npx tsc --noEmit` passe
- `npx eslint` cible sur les fichiers modifies passe

Risques / reste a traiter :

- il reste a harmoniser les surfaces premium qui sont encore purement `locked / full`
- l'historique limite vs complet n'est pas encore visible comme experience produit sur les ecrans
- la page pricing reste a construire pour relier toutes les experiences de paywall

### Session 5 - 2026-04-11

Contexte :

- sous-lot controle Phase 2 centre sur `prix minimum de vente + homogenisation des surfaces premium`
- objectif : traiter explicitement la lecture `BREAK_EVEN_PRICE` sans multiplier les composants divergents

Travail realise :

- audit des surfaces premium economiques restantes autour du detail lot
- branchement du gate `BREAK_EVEN_PRICE` sur `app/(dashboard)/batches/[id]/page.tsx`
- enrichissement de `app/(dashboard)/batches/[id]/_components/ProfitabilityPreviewCard.tsx` pour inclure :
  - preview du prix minimum de vente
  - cas broiler
  - cas pondeuse avec dependance aux saisies d oeufs
- harmonisation de la copie dans `src/lib/gate-resolver.ts`
- harmonisation des `footerHint` premium pour :
  - projection de marge
  - prediction mortalite

Decision UX prise :

- le prix minimum de vente n'est plus un detail cache dans la lecture full
- il devient une lecture premium centrale, exposee dans la meme grammaire produit que :
  - rentabilite lot
  - reports preview
- les alertes premium commencent a etre formulees comme des lectures actionnables distinctes des rappels simples

Verification :

- `npx tsc --noEmit` passe
- `npx eslint` cible sur les fichiers modifies passe

Risques / reste a traiter :

- les surfaces encore purement `locked / full` doivent etre harmonisees sans explosion de composants
- la separation complete `alertes simples` vs `alertes premium` reste un chantier suivant
- l'historique limite / complet n'est toujours pas visible comme levier produit

### Session 6 - 2026-04-11

Contexte :

- sous-lot de consolidation et de conversion
- objectif : renforcer la coherence UX entre les surfaces premium sans ajouter de nouvelle grosse fonctionnalite

Travail realise :

- audit global de :
  - `detail lot`
  - `reports`
  - cartes premium `marge` et `mortalite`
- creation de `src/lib/premium-surface-copy.ts`
- harmonisation de `src/components/subscription/FeatureGateCard.tsx`
- harmonisation des CTA et highlights dans :
  - `app/(dashboard)/batches/[id]/page.tsx`
  - `app/(dashboard)/reports/page.tsx`
- clarification de la promesse Pro dans les previews :
  - `app/(dashboard)/batches/[id]/_components/ProfitabilityPreviewCard.tsx`
  - `app/(dashboard)/reports/_components/ReportsPreviewCard.tsx`

Decision UX prise :

- les surfaces premium principales doivent maintenant parler la meme langue produit
- la valeur Pro est formulee comme une aide a decider :
  - eviter la perte
  - fixer le bon prix
  - piloter le mois
  - agir avant la derive
- `FeatureGateCard` devient la base commune des etats `blocked / locked`, tandis que les previews gardent le meme ton et la meme promesse

Verification :

- `npx tsc --noEmit` passe
- `npx eslint` cible sur les fichiers modifies passe

Risques / reste a traiter :

- l'historique limite / complet reste le prochain levier de monetisation visible pour `FREE` vs `STARTER`
- la separation explicite entre `rappels simples` et `alertes premium` reste a formaliser dans le produit
- une page pricing dediee sera utile pour capitaliser sur la nouvelle coherence UX

### Session 14 - 2026-04-11

Contexte :

- passe de validation et finition sur la couche "action guidee"
- audit complet de chaque alerte actionable (label, URL, tab, anchor, tendance)

Audit realise :

- 14 types verifies : labels verbaux, URLs avec tab/anchor, priorites coherentes
- 1 gap cible : `DAILY_RECORD` pointait vers le lot sans anchor → section saisies non visible immediatement
- 1 finesse manquante : label vaccination identique J-1 et J — pas contextualise
- 1 contradiction UX : consequence alarmisteaffichee meme si le signal s ameliore
- 1 incoherence visuelle : bouton rouge pour improving+high — urgence surestimee

Travail realise :

- anchor `#saisies` sur `RecentDailyRecords` + URL `DAILY_RECORD` mise a jour
- label vaccination : "Vacciner maintenant" si J, "Preparer la vaccination" si J-1 (isTomorrow)
- `getWorseningActionLabel()` : override du label pour worsening+high (verbe d action direct)
- suppression de la consequence statique si trend=improving (evite la contradiction)
- bouton high+improving → amber au lieu de rouge (urgence attenueemais presence maintenue)

Verification :

- `npx tsc --noEmit` : OK

---

### Session 13 - 2026-04-11

Contexte :

- Phase 3 Sous-lot 5 : transformation des alertes en actions immédiates (labels, URLs, UX)

Travail realise :

- audit complet de `getNotificationActionInfo` : identification des 5 manques principaux
- refactorisation complete de la fonction avec labels verbaux et URLs ciblées
- ajout de l action manquante sur `BATCH_VACCINATION_REMINDER`
- routing par tab sur `/stock` via searchParams serveur + prop `initialTab`
- ajout de `id=` sur `BatchMortalityPredictionCard`, `BatchMarginProjectionCard`, `HealthSection`
- bouton action plein-largeur fond rouge pour les alertes `high` dans `NotificationDropdown`
- mise a jour `pricing-evolution.md` (Phase 3 Sous-lot 5 + Session 13)

Verification :

- `npx tsc --noEmit` : OK

---

### Session 12 - 2026-04-11

Contexte :

- iteration sur Phase 3 Sous-lot 4 : remplacement du calcul de tendance ponctuel (J-1 vs J) par un calcul base sur des fenetres glissantes

Motif de l iteration :

- le calcul J-1 vs J est trop sensible au bruit de mesure : un seul spike peut generer un faux "worsening"
- l utilisateur a exprime des contraintes fortes : calcul robuste, seuil calibre, UX enrichie avec micro explication

Travail realise :

- suppression de `calculateTrend()` (comparaison simple J-1 vs J)
- introduction de trois helpers :
  - `TREND_HIGHER_IS_WORSE` : table de direction par resourceType
  - `TREND_STABLE_THRESHOLD` : seuils relatifs par type (15 % a 25 %)
  - `extractTrendMetric()` : extraction de la metrique numerique pertinente
- introduction de `calculateWindowTrend()` :
  - requiert 2 signaux anterieurs minimum avec metrique valide
  - divise les signaux en deux demi-fenetres (recente / ancienne)
  - integre la notification courante dans la fenetre recente
  - comparaison par delta relatif par rapport a la reference ancienne
  - gestion explicite du cas reference = 0
- extension de la fenetre Prisma : 7 jours → 14 jours pour la requete des signaux anterieurs
- ajout de `createdAt: true` et `orderBy: { createdAt: "desc" }` dans la requete
- groupement des signaux anterieurs par cle `resourceType:resourceId` (Map)
- `isRecurring` recalcule depuis le subset 7 jours du groupe (logique inchangee)
- remplacement des simples badges `↗ / ↘` par une ligne de tendance structuree :
  - icone `TrendingUp` (rouge) ou `TrendingDown` (vert) via lucide-react
  - label "S aggrave" / "S ameliore" + separateur "—" + micro explication par type
  - fond colore (bg-red-50 ou bg-green-50) pour ancrer visuellement la ligne
- introduction de `TREND_COPY` dans `NotificationDropdown.tsx` : table de micro explications par resourceType et sens de tendance
- introduction de `getTrendCopy()` helper de lecture de cette table

Verification :

- `npx tsc --noEmit` : OK

---

### Session 11 - 2026-04-11

Contexte :

- Phase 3 Sous-lot 4 (premiere version) : ajout de la notion de tendance sur les alertes recurrentes

Travail realise (remplace par Session 12) :

- premiere implementation : comparaison simple `calculateTrend(currentMeta, priorMeta)` J-1 vs J
- badges simples dans `NotificationRow` : `↗ S'aggrave` / `↘ S'ameliore`
- remplace par l approche fenetre glissante en Session 12 (plus robuste)

---

### Session 10 - 2026-04-11

Contexte :

- finalisation de la Phase 2 — Monetization UX
- 3 items restants : Blur/CTA, Historique limite, Page pricing

Travail realise :

- sub-lot 5 : ajout de `FULL_HISTORY` dans le systeme d entitlements + gate resolver + banniere visuelle dans `RecentDailyRecords`
- sub-lot 6 : blur CSS + icone verrou sur les colonnes Pro dans les previews rentabilite et rapports + CTA `FeatureGateCard` transforme en lien fonctionnel vers `/pricing`
- sub-lot 7 : creation de `app/(dashboard)/pricing/page.tsx` avec grille plans + tableau comparatif + CTA WhatsApp + detection plan actuel

Decision produit prise :

- la page pricing est un Server Component (authenticated) accessible depuis la dropdown et les CTAs paywalls
- le lien WhatsApp est pre-rempli avec le nom du plan — conversion directe sans friction
- le blur utilise des valeurs fake realistes pour suggerer la valeur Pro sans la reveler
- `FULL_HISTORY` est un entitlement a part entiere — extensible a d autres surfaces (daily, rapports)

Phase 2 marquee DONE.

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint` cible sur tous les fichiers modifies : OK

---

### Session 9 - 2026-04-11

Contexte :

- sous-lot 3 de la Phase 3 : qualite du flux d alertes (cadence, deduplication, anti-bruit)

Travail realise :

- audit complet du flux de generation et de deduplication des notifications
- identification de 5 vecteurs de bruit principaux
- remplacement de `calendarDayStart` par `getCooldownStart(resourceType)` avec fenetre glissante
- ajout de `NOTIFICATION_COOLDOWN_DAYS` : table de cooldowns par resourceType
- refactorisation de `checkMissedDailyRecords` avec logique de regroupement (1 lot / N lots)
- mise a jour de `getNotificationActionInfo` pour les notifications groupees
- ajout de la detection `isRecurring` dans `getNotifications` (1 requete Prisma supplementaire)
- ajout du badge "Persistant" dans `NotificationDropdown`
- ajout de l auto-archival dans `generateNotificationsForOrganization`
- mise a jour du header de documentation du fichier `notifications.ts`

Decision produit prise :

- les alertes critiques (rupture, mortalite, marge) restent a 1 jour de cooldown : le signal est important chaque jour
- les rappels basse priorite ont un cooldown etendu : l utilisateur ne doit pas etre pollue par des signaux qu il ne peut pas resoudre immediatement
- le groupement des saisies manquantes reduit le volume de notifications sans perdre l information
- `isRecurring` est un indicateur produit, pas un blocage : l alerte reste visible mais son contexte est clarifie

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint "src/actions/notifications.ts" "src/components/layout/NotificationDropdown.tsx"` : OK

Risques / reste a traiter :

- la detection `isRecurring` utilise une fenetre 24h→7j : un signal qui revient apres 8 jours ne sera pas marque persistant. C est acceptable pour le MVP.
- les notifications `NON_LU` stales (> 14 jours) ne sont pas auto-archivees (uniquement les LU). Intentionnel : un signal non lu reste visible jusqu a action explicite.
- les moments de verite restent le prochain chantier de Phase 3

---

### Session 8 - 2026-04-11

Contexte :

- sous-lot 2 de la Phase 3 : renforcement du moteur d alertes comme moteur de retention et d action

Travail realise :

- enrichissement du type `NotificationSummary` avec `priority`, `actionLabel`, `actionUrl`
- enrichissement du type `NotificationTeaser` avec `priority: "high"`
- refactorisation de `decorateNotification` en separant :
  - `getNotificationPriority` : calcul de la priorite
  - `getNotificationActionInfo` : calcul du chemin d action
- tri serveur des notifications par priorite dans `getNotifications`
- mise a jour des labels de `signalLabel` dans les teasers pour coherence avec le vocabulaire high-priority
- refonte complete de `NotificationDropdown` avec :
  - composants extraits : `SectionLabel`, `NotificationRow`, `TeaserRow`
  - groupes visuels par priorite avec sections labellisees
  - couleur de bordure gauche et de fond par priorite
  - bouton d action inline colore par priorite
  - collapse des rappels low-priority apres 3

Decision UX prise :

- la dropdown devient une surface a lecture hierarchique : critique en tete, rappels en bas
- les teasers Pro sont systematiquement traites comme high-priority visuellement
- le bouton d action inline evite de sortir de la dropdown pour trouver le bon ecran
- les rappels basse priorite sont disponibles mais ne parasitent plus la lecture des alertes importantes

Verification :

- `npx tsc --noEmit` : OK
- `npx eslint "src/actions/notifications.ts" "src/components/layout/NotificationDropdown.tsx"` : OK

Risques / reste a traiter :

- les "moments de verite" restent a formaliser comme experience produit complete
- la page pricing dediee pourrait capitaliser sur la nouvelle coherence alertes
- les alertes meteo et vaccination pourraient recevoir un `actionUrl` vers `/farms` et `/health`

---

### Session 7 - 2026-04-11

Contexte :

- demarrage de la Phase 3 sur les alertes premium
- objectif : faire des alertes un moteur de retention et de conversion sans casser le systeme existant

Travail realise :

- audit du moteur d alertes dans `src/actions/notifications.ts`
- audit de la surface d affichage reelle dans `src/components/layout/NotificationDropdown.tsx`
- segmentation des alertes en :
  - rappels simples
  - alertes actionnables
- enrichissement des notifications retournees par le serveur avec :
  - type d alerte
  - signal visuel
  - consequence
- creation de teasers Pro dans la dropdown quand les lectures predictives ne sont pas encore debloquees
- integration du `gate resolver` dans la logique premium des alertes predictives

Decision UX prise :

- les alertes simples doivent aider a tenir le rythme sans surcharger
- les alertes Pro doivent expliquer :
  - quel risque apparait
  - quelle perte possible se profile
  - pourquoi Pro aide a agir plus tot
- la dropdown devient la premiere surface de conversion des alertes, sans creer une experience parallele

Verification :

- `npx tsc --noEmit` passe
- `npx eslint` cible sur les fichiers modifies passe

Risques / reste a traiter :

- la priorisation economique des alertes premium peut encore etre affinee
- la future separation `rappels simples` vs `alertes premium` devra etre visible aussi hors dropdown si l usage le justifie
- les alertes meteo / vaccination / creances peuvent demander une seconde passe de segmentation produit

---

## Agent Execution Rules

- lire ce document
- mettre a jour progress
- mettre a jour session log
- ne jamais casser la saisie
- respecter entitlements
- utiliser gate resolver

---

## Next Task

Phase 3 Sous-lots 2 a 5 livres avec passe de finition (priorite, qualite, tendance, actions guidees, UX trend-aware). La couche "action" est considered stable. Prochain sous-lot : les moments de verite — declenchement contextuel des alertes au bon moment du parcours utilisateur (exemple : alerte prix minimum visible au moment de saisir une vente, rappel stock visible en acces stock).

Contexte :

- les alertes sont maintenant priorisees, enrichies d actions, hierarchisees et anti-bruit
- la prochaine etape est de relier ces alertes a des surfaces de decision concretes dans le produit
- un "moment de verite" = un signal critique qui conduit l utilisateur a une action qui change le resultat economique du lot

Priorite produit :

- rupture aliment imminente : le stock va manquer → l utilisateur doit commander. Relier a la page stock ou fournisseur
- derive mortalite : le lot perd des animaux → l utilisateur doit documenter, corriger. Relier au lot, a la saisie journaliere
- projection marge negative : le lot va perdre de l argent → l utilisateur doit voir la rentabilite, comprendre le levier

Pour chaque moment de verite :

- verifier que l action inline dans la dropdown conduit bien a la bonne surface
- verifier que cette surface montre clairement ce qui doit etre fait
- verifier que le chemin est court (2 clics max)

Garder la meme discipline :

- audit rapide avant modification
- correction ciblee
- compatibilite legacy intacte
- roadmap mise a jour a la fin du sous-lot

Definition of done :

- les 3 moments de verite principaux ont un chemin d action complet et lisible
- pas de regression sur les notifications existantes ni sur la saisie journaliere
- roadmap mise a jour
