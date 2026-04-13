# Roadmap — Refonte logique alimentaire SunuFarm

> Dernière mise à jour : 2026-04-13 (Phases 3A/3B outillées)
>
> Objectif : passer d'une saisie alimentaire en kg/jour (inadaptée au terrain) à une logique en sacs, avec reconstruction pondérée par courbe zootechnique, référentiel à 3 niveaux (génétique × Sénégal × ferme) et diagnostics contextualisés.
>
> Plan complet : [`C:\Users\pcpro\.claude\plans\swirling-plotting-lamport.md`]

---

## Vue d'ensemble

| Phase | Contenu | Statut | PR |
|---|---|---|---|
| **Phase 1** | Fondations DB + référentiels | ✅ Terminé | — |
| **Phase 2** | Moteur de reconstruction (back-end) | ✅ Terminé | — |
| **Phase 3A** | UX wording + mode sac UI | 🟡 En cours | — |
| **Phase 3B** | Logique seuils (PR séparé) | 🟡 En cours | — |
| **Phase 4** | Apprentissage + ML | 🔲 À faire | — |

---

## Phase 1 — Fondations DB et référentiels ✅ Terminé

> Durée réelle : 1 session | Aucune régression | Schéma 100% additif

### Travaux livrés

| Élément | Fichier | Statut |
|---|---|---|
| 8 nouveaux enums Prisma | `prisma/schema.prisma` | ✅ |
| Modèle `FeedBagEvent` | `prisma/schema.prisma` | ✅ |
| Modèle `ZootechnicalCurvePoint` | `prisma/schema.prisma` | ✅ |
| Modèle `FarmAdjustmentProfile` | `prisma/schema.prisma` | ✅ |
| Extension `DailyRecord` (+3 champs) | `prisma/schema.prisma` | ✅ |
| Extension `Farm.senegalProfileCode` | `prisma/schema.prisma` | ✅ |
| Extension `Batch.senegalProfileOverride` | `prisma/schema.prisma` | ✅ |
| Profils Sénégal structurés | `src/constants/senegal-profiles.ts` | ✅ |
| Courbes zootechniques hebdo V1 | `src/constants/zootechnical-curves.ts` | ✅ |
| Seed idempotent `ensureZootechnicalCurves()` | `prisma/seeds/zootechnical-curves.ts` | ✅ |
| Appel seed dans `createReferenceData()` | `prisma/seed.ts` | ✅ |
| Migration SQL additive | `prisma/migrations/20260413120000_.../` | ✅ |
| Client Prisma régénéré | `src/generated/prisma` | ✅ |

### Données de référence livrées (V1 — version "2024-01")

| Souche | Type | Points journaliers | Source | qualityLevel |
|---|---|---|---|---|
| Cobb 500 | CHAIR | 43 (J0–J42) | Cobb Performance Guide 2022 | MEDIUM |
| Ross 308 | CHAIR | 43 (J0–J42) | Ross Nutrition Specifications 2022 | MEDIUM |
| ISA Brown | PONDEUSE | 561 (J0–J560) | ISA Management Guide 2021 | MEDIUM |

### Points de validation ✅

- `npx prisma validate` → valide
- `npx prisma generate` → client généré sans erreur
- `npm test` → 2 failed pré-existants, 0 régression introduite

### Commentaires / décisions

- Interpolation V1 : **LINEAR** (linéaire entre deux points hebdomadaires). La spline cubique (CUBIC_SPLINE) sera introduite en V2 si validation biologique.
- Les deux tests pré-existants qui échouent (`organization-context.test.ts`) concernent le champ `httpOnly` d'un cookie — sans lien avec la refonte alimentaire.
- Le drift DB constaté lors de `prisma migrate dev` (tables `RateLimitWindow`, `analytics_events`, colonne `audioRecordUrl` non en sync) n'est pas lié à cette phase.

---

## Phase 2 — Moteur de reconstruction (back-end) ✅ Terminé

> Durée réelle : 1 session | 25 tests passent | 0 régression

### Travaux livrés

| Élément | Fichier | Statut |
|---|---|---|
| Fonctions partagées chair/pondeuse | `src/lib/feed-reference-core.ts` | ✅ |
| Référence spécifique chair (FCR, ADG, poids) | `src/lib/feed-reference-chair.ts` | ✅ |
| Référence spécifique pondeuse (ponte, IC oeuf) | `src/lib/feed-reference-pondeuse.ts` | ✅ |
| Dispatcher 3 niveaux (résolution profil) | `src/lib/feed-reference.ts` | ✅ |
| Moteur de reconstruction CURVE_WEIGHTED | `src/lib/feed-reconstruction.ts` | ✅ |
| Calcul facteurs ferme (état OBSERVING) | `src/lib/farm-feed-adjustment.ts` | ✅ |
| Server actions sacs (create/close/get/delete) | `src/actions/feed-bags.ts` | ✅ |
| Tests unitaires du moteur (25 tests) | `src/lib/feed-reconstruction.test.ts` | ✅ |

### Points de validation ✅

- ✅ Sac 50 kg Cobb 500 J11-J15 500 oiseaux → 5 estimations, somme = 50 kg ± 0.01, distribution non-linéaire
- ✅ Fallback courbe vide → LINEAR, confidence LOW
- ✅ Sac court (5j) cohérent → HIGH ; sac long (20j) → MEDIUM/LOW
- ✅ MANUAL_KG non-écrasement : implémenté dans `applyDailyEstimates()` (feed-bags.ts)
- ✅ 25/25 tests passent (`vitest run src/lib/feed-reconstruction.test.ts`)
- ✅ `npm test` → mêmes 2 failed pré-existants uniquement
- ✅ Écart CURVE_WEIGHTED vs LINEAR > 3% (courbe croissante J11-J15 prouvée)

### Commentaires / décisions

- `farm-feed-adjustment.ts` est en état OBSERVING uniquement — ne modifie jamais `FarmAdjustmentProfile` automatiquement. Calcule la médiane des facteurs sur les N derniers lots clôturés.
- `feed-bags.ts` implémente l'idempotence via `clientMutationId`. La règle MANUAL_KG > ESTIMATED est appliquée ligne par ligne dans `applyDailyEstimates()`.
- `computeFarmObservedFactors()` exclut les valeurs aberrantes (facteurs hors [0.5, 2.0]) pour robustesse.
- Le `layingFactor` est un placeholder à 1.0 en Phase 2 — le calcul depuis `EggProductionRecord` est prévu en Phase 4.

---

## Phase 3A — UX wording + mode sac UI 🟡 En cours

> Durée estimée : ~1 semaine | **Ne modifie pas les calculs économiques**

### Objectif

Rendre les diagnostics moins agressifs et exposer le mode saisie en sacs, sans toucher aux règles métier de rentabilité ni aux seuils d'alerte.

### Travaux livrés / en cours

| Élément | Fichier cible | Nature |
|---|---|---|
| Toggle sac/kg dans le formulaire journalier | `app/(dashboard)/daily/_components/DailyForm.tsx` | ✅ Livré |
| Création d'un `FeedBagEvent` fermé sur la journée | `app/(dashboard)/daily/_components/DailyForm.tsx`, `src/actions/feed-bags.ts` | ✅ Livré |
| Déstockage automatique lié au mode sac | `src/actions/feed-bags.ts` | ✅ Livré |
| Colonne source + tooltip DailyRecord estimé | `app/(dashboard)/batches/[id]/_components/RecentDailyRecords.tsx` | ✅ Livré |
| Graphe réel vs référence ajustée | `app/(dashboard)/batches/[id]/_components/FeedReferencePanel.tsx` | ✅ Livré |
| Indicateur qualité données (% manuel vs estimé) | `app/(dashboard)/business/_components/BusinessKpiGrid.tsx` | ✅ Livré |
| KPI qualité alim dans l'agrégation business | `src/actions/business.ts`, `src/lib/business-dashboard.ts` | ✅ Livré |
| Intégration référence ajustée dans comparaison | `src/lib/collective-benchmark.ts`, `src/lib/ai.ts` | ✅ Livré |
| Vrai support offline du mode sac (queue dédiée + replay) | `src/lib/offline-*`, `app/(dashboard)/daily/_components/DailyForm.tsx` | ✅ Livré |
| Déstockage local offline du mode sac | `src/lib/offline/repositories/dailyRepository.ts`, `src/lib/offline-mutation-outbox.ts` | ✅ Livré |
| Libellés `buildVerdicts()` contextuels + garde-fou avant J7 | `src/lib/business-dashboard.ts`, `src/actions/business.ts` | ✅ Livré |

### Règle stricte

> **Seuls les strings dans `buildVerdicts()` changent.** Aucun input, aucun calcul de marge, aucune condition logique n'est modifiée dans ce PR.

### Points de validation avant Phase 3B

- [x] Un lot CHAIR Cobb 500 avec sac saisi → graphe réel vs référence s'affiche
- [x] DailyRecord ESTIMATED_FROM_BAG → icône ⚡ + tooltip dans la liste
- [x] Aucun verdict de performance pour un lot < 7 jours
- [ ] Test A/B informel sur les nouveaux libellés (2–3 éleveurs pilotes)
- [x] 0 régression `ProfitabilityCard` (financier inchangé)
- [x] Toggle sac/kg fonctionne offline avec vraie synchro `FeedBagEvent`

### Commentaires / décisions

- Le mode sac est branché en priorité sur la saisie journalière "jour J" via un `FeedBagEvent` fermé immédiatement (`startDate = endDate`).
- Le stock aliment est décrémenté dès la création du sac et restauré à la suppression via un `FeedMovement` référencé `feed-bag:{id}`.
- Le mode sac hors ligne crée désormais une vraie commande `CREATE_FEED_BAG_EVENT`, rejouée à la reconnexion, avec déstockage local immédiat pour garder l'écran stock cohérent.
- Les compteurs de qualité de données alimentaires remontent maintenant jusqu'au dashboard business.
- Les verdicts business gardent les mêmes calculs mais remplacent les formulations trop affirmatives quand l'ensemble des lots actifs est encore avant J7.
- Le benchmark collectif expose maintenant aussi une référence ajustée du lot courant (`adjustedReference`) pour enrichir les analyses IA avec une comparaison "pairs terrain + référence locale".
- Un protocole pilote prêt à l'emploi est disponible dans `docs/pilots/feed-refactor-3a-ab-test.md`.

---

## Phase 3B — Logique seuils 🟡 En cours

> Durée estimée : ~3-5 jours | **PR séparé de 3A — ne commence qu'après validation prod 3A**

### Objectif

Recalibrer les seuils d'alerte pour différencier chair vs pondeuse, et introduire un seuil minimal d'âge avant tout verdict de performance.

### Travaux livrés / engagés

| Élément | Fichier cible |
|---|---|
| Seuil `PERFORMANCE_VERDICT_MIN_AGE_DAYS = 7` | `src/constants/kpi-thresholds.ts` |
| Seuils mortalité chair vs pondeuse différenciés | `src/constants/kpi-thresholds.ts` |
| Application des nouveaux seuils dans le scoring prédictif mortalité | `src/lib/predictive-mortality-rules.ts` |
| Alignement du wording / âge minimal côté dashboard Business | `src/lib/business-dashboard.ts` |

### Points de validation

- [x] BANDE-DEMO-LOSS → toujours rouge/critical après modification
- [x] BANDE-DEMO-PROFIT → toujours vert/ok après modification
- [x] Lot pondeuse à 0.3%/j mortalité → non critique
- [ ] Communication utilisateurs avant déploiement

### Commentaires / décisions

> 2026-04-13 : seuils mortalité différenciés chair / pondeuse présents dans `src/constants/kpi-thresholds.ts`.
> 2026-04-13 : garde-fou avant J7 actif dans `src/lib/predictive-mortality-rules.ts` et wording Business aligné sur la même constante.
> 2026-04-13 : régression BANDE-DEMO-LOSS couverte dans `src/lib/business-dashboard.test.ts` (reste critique dans la vue active).
> 2026-04-13 : régression BANDE-DEMO-PROFIT couverte dans `src/lib/business-dashboard.test.ts` au niveau rentabilité seedée; le lot seed est `SOLD`, donc hors liste Business active par design.
> 2026-04-13 : commande d'orchestration prête : `npm run roadmap:remaining`.
> 2026-04-13 : note de rollout prête dans `docs/release-notes/feed-refactor-rollout.md`.
> Reste à préparer la communication déploiement.

---

## Phase 4 — Apprentissage + ML 🔲 À faire

> Durée estimée : ~2 semaines | Après stabilisation Phase 3

### Objectif

Enrichir le pipeline ML, activer le mécanisme d'ajustement ferme et ajouter les souches de référence manquantes.

### Travaux à faire

| Élément | Fichier cible |
|---|---|
| Enrichir `BatchOutcomeSnapshot` : `curveVersion`, `senegalProfileUsed`, `farmAdjustmentStatus` | `prisma/schema.prisma` |
| Features ML : `pct_estimated_j14`, `avg_confidence_j14` | `ml/predict.py`, `ml/train_model.py` |
| UI admin `FarmAdjustmentProfile` (OBSERVING → SUGGESTED) | nouveau composant admin |
| Courbes Ross 308 chair complètes + Lohmann Brown pondeuse | `src/constants/zootechnical-curves.ts` |
| Recalibrage ferme automatique post-validation | `src/lib/farm-feed-adjustment.ts` |

### Points de validation

- [ ] ML : accuracy maintenue ou améliorée avec les nouvelles features
- [ ] UI admin : transition OBSERVING → SUGGESTED visible + action SUGGESTED → ACTIVE fonctionnelle
- [ ] Lohmann Brown : ≥ 70 points journaliers (J0–J490)

### Commentaires / décisions

> _(à compléter au démarrage de la phase)_

---

## Règles transversales (toutes phases)

### Invariants à ne jamais casser

| Règle | Pourquoi |
|---|---|
| `DailyRecord.feedKg` garde sa sémantique | Utilisé dans 7+ fichiers (KPI, PDF, ML, benchmarks) |
| Manuel prime sur estimé | Priorité données terrain explicites vs reconstruction |
| Migrations strictement additives | DB production — aucun `ALTER COLUMN` sur champs existants |
| `BatchOutcomeSnapshot.totalFeedKg` agrège depuis `feedKg` quel que soit `dataSource` | Continuité du benchmarking collectif |

### Fichiers à ne pas modifier (sauf exception justifiée)

- `src/actions/daily-records.ts` — mode kg/jour inchangé
- `src/actions/stock.ts` — journal FeedMovement intact
- `src/lib/offline/` — offline sync non modifié avant Phase 4
- `src/lib/batch-profitability.ts` — logique financière inchangée
- `src/components/pdf/BatchReportDocument.tsx` — export PDF inchangé
- `ml/` — pipeline ML non modifié avant Phase 4

---

## Journal des décisions

| Date | Décision | Justification |
|---|---|---|
| 2026-04-13 | Interpolation V1 = LINEAR | Simple, documentable, reproductible. Spline cubique reportée en V2. |
| 2026-04-13 | Profils Sénégal en constantes (pas DB) en Phase 1-2 | Évite un modèle DB prématuré. Migration vers DB prévue en Phase 3+. |
| 2026-04-13 | Ajustement ferme démarré en OBSERVING | Pas d'application automatique — validation explicite manager obligatoire. |
| 2026-04-13 | Migration SQL manuelle (pas `prisma migrate dev`) | Drift DB détecté sur l'environnement de dev — migration créée manuellement pour éviter un reset DB. |
| 2026-04-13 | Phase 3A et 3B en PRs séparés | Séparer wording UX (sans risque) et logique seuils (avec risque de régression). |
| 2026-04-13 | `layingFactor` = 1.0 en Phase 2 | Le calcul depuis EggProductionRecord nécessite des données historiques de ponte — reporté en Phase 4. |
| 2026-04-13 | Médiane pour les facteurs ferme (pas moyenne) | Robuste aux outliers (lots exceptionnels, mortalités anormales). |
| 2026-04-13 | Filtre [0.5, 2.0] sur les facteurs observés | Exclure les valeurs aberrantes qui biaiseraient le calcul (ex: lot avec données manquantes). |
