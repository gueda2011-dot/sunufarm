# PROGRESS.md - SunuFarm

> Mis a jour apres chaque session de travail.
> Derniere mise a jour : 2026-03-30 (Session 55)

---

## Etat global

| Bloc | Description | Etat reel |
|---|---|---|
| Fondations produit | Analyse fonctionnelle, architecture, modelisation et schema Prisma | Termine |
| Socle technique | Env, auth, permissions, validators, audit, formatters, helpers communs | En place |
| Backend metier | Server Actions coeur de produit (`batches`, `daily`, `stock`, `health`, `sales`, `purchases`, `expenses`, `subscriptions`) | Largement en place |
| Frontend metier | Pages dashboard et modules terrain/admin principaux | Largement en place |
| Dashboard / KPI | Dashboard principal, KPI lot, rapports mensuels, exports PDF | En place |
| Parcours email | Confirmation d'email et notifications via Resend | En place, depend de la config env |
| Achats / finance / stock | Paiement fournisseur, envoi au stock, sorties terrain, integrite admin V1 | En place, encore a durcir |
| Donnees demo | Seed / demo stable pour onboarding et validations manuelles | En place |
| Observabilite / securite | Health admin, logs critiques, backup / restore, incident response, rate limiting | En place |
| Chantiers ouverts | Durcissement anti-orphelins, outillage admin V2, simplification UX restante | En cours |

### Lecture rapide

- Le projet n'est plus au stade "schema + maquettes" : le coeur applicatif fonctionne deja sur les domaines principaux
- Les modules terrain critiques sont presents : `lots`, `saisie journaliere`, `stock`, `sante`, `achats`, `depenses`, `ventes`, `dashboard`
- Les sujets encore ouverts sont surtout des sujets de fiabilisation, d'outillage admin et de simplification UX, pas des blocs coeur absents

### Modules produit - etat actuel

| Module | Etat |
|---|---|
| Lots | Fonctionnel |
| Saisie journaliere | Fonctionnelle, avec impact stock aliment |
| Sante | Fonctionnelle, avec impact stock medicament |
| Stock | Fonctionnel, avec creation d'articles, mouvements et correction admin V1 |
| Achats fournisseur | Fonctionnel, avec paiements et envoi au stock |
| Depenses / finances | Fonctionnel |
| Dashboard | Fonctionnel, achats + depenses integres dans les KPI |
| Rapports | Fonctionnels au MVP |
| Admin plateforme | Fonctionnel, avec supervision de base et integrite stock V1 |
| Emails transactionnels | Fonctionnels si Resend est correctement configure |

---

## Pilotage scalabilite

- Roadmap de reference enregistree dans `docs/SCALABILITY_ROADMAP.md`
- Priorite active : execution du trimestre courant a partir de `docs/QUARTERLY_ROADMAP.md`
- Phase 0 terminee le 2026-03-28
- Phase 1 terminee : socle env + erreurs API + permissions serveur critiques
- Phase 2 terminee : audit Prisma + bornes sur les listes metier + index composes appliques
- Phase 3 terminee : logique metier partagee + pattern commun des Server Actions
- Phase 4 terminee : CI + tests critiques + matrice de non-regression
- Phase 5 terminee : observabilite critique + sante applicative + backup / restore + incident response
- Phase 6 terminee : workflow equipe + onboarding + ownership + priorisation + trajectoire async/cache

### Priorites produit / tech actives

- Fiabiliser encore les flux croises `achats -> stock -> lot -> dashboard`
- Eviter a la source les orphelins de stock lors des suppressions d'achat
- Etendre l'outillage admin de correction au-dela des cas simples deja couverts
- Continuer a reduire la charge cognitive utilisateur entre `Achats`, `Depenses`, `Stock` et `Saisie`

---

## Decisions techniques prises

| Decision | Valeur | Raison |
|---|---|---|
| Version Prisma reelle | 7.5 | Projet initialise avec Prisma 7 |
| Version Next.js reelle | 16.2 | Projet initialise avec Next.js 16 |
| Version Zod reelle | 4.x | Dependance installee |
| Generator Prisma | `prisma-client` | Syntaxe Prisma 7 |
| Config datasource | `prisma.config.ts` | Pattern Prisma 7 |
| Env var base de donnees | `SUNUFARM_DATABASE_URL` | Convention projet |
| Permissions ferme | JSON dans `UserOrganization.farmPermissions` | MVP - table separee en V2 |
| Motif mortalite | Optionnel, defaut "Non precise" | Decision terrain validee |
| Types de ventes MVP | Poulets vifs, oeufs, fientes uniquement | Decision produit validee |

---

## Session 1 - 2026-03-20

### Travail effectue

- Etapes 1-3 : analyse fonctionnelle, architecture et modelisation validees
- Etapes 4-5 : roadmap et arborescence completes presentees
- Etape 6 : `prisma/schema.prisma` genere (37 modeles, 13 enums)
- `prisma.config.ts` mis a jour pour `SUNUFARM_DATABASE_URL`
- `PROGRESS.md` cree

### Fichiers crees / modifies

- `prisma/schema.prisma` - schema complet production-ready
- `prisma.config.ts` - variable env corrigee

### Prochaine session

- Commencer par `prisma db push` ou `prisma migrate dev` pour valider le schema en base
- Puis Etape 7 : `prisma/seed.ts` avec donnees senegalaises realistes
- Puis Etape 8 : utilitaires (`formatters.ts`, `kpi.ts`, `permissions.ts`, `audit.ts`, `validators/`)

---

## Session 2 - 2026-03-28

### Travail effectue

- Creation de la roadmap de scalabilite dans `docs/SCALABILITY_ROADMAP.md`
- Phase 0 terminee
- Suppression des warnings lint dans `src/actions/eggs.ts`, `src/actions/health.ts` et `src/actions/sales.ts`
- Alignement de `README.md` avec les vraies variables d'environnement et les scripts Prisma
- Ajout d'un socle de conventions via `.editorconfig` et `docs/CODE_CONVENTIONS.md`
- Verification HTTP locale des garde-fous publics et des protections d'exports
- Correctif multi-tenant sur `app/api/reports/batch/[id]/route.ts` pour utiliser l'organisation active
- Demarrage de la Phase 1
- Ajout de `src/lib/env.ts` pour centraliser la validation d'environnement
- Ajout de `src/lib/action-result.ts` et `src/lib/api-response.ts` pour homogeniser les reponses serveur
- Alignement des routes critiques `reports`, `subscriptions`, `payments` et `ai`
- Renforcement des permissions module cote serveur sur les actions critiques `batches`, `daily`, `farms` et `subscriptions`
- Mise a jour de `docs/OPERATIONS.md` avec une procedure de deploiement plus reproductible

### Resultat

- `npm run lint` sans warnings
- `npm run test` vert
- `npm run build` vert
- Verification locale validee sur `/`, `/login`, `/dashboard`, `/api/reports/monthly` et `/manifest.webmanifest`
- Les fondations Phase 1 sont posees, mais l'extension des permissions module a toutes les actions reste a finir

### Prochaine session recommandee

- Finir l'extension des permissions module sur les actions restantes
- Ajouter des tests sur `env`, `api-response` et les garde-fous de permissions
- Clore completement la Phase 1 avant de passer a la Phase 2

---

## Session 3 - 2026-03-28

### Travail effectue

- Demarrage effectif de la Phase 2 avec audit des hotspots Prisma sur `reports`, `dashboard`, `sales`, `purchases`, `expenses`, `customers`, `suppliers` et `notifications`
- Optimisation de `src/actions/customers.ts` : suppression du chargement complet des ventes liees, remplace par `sale.groupBy(...)`
- Optimisation de `src/actions/suppliers.ts` : suppression du chargement complet des achats lies, remplace par `purchase.groupBy(...)`
- Ajout d'une borne explicite `limit <= 200` sur les listes `customers` et `suppliers`
- Preparation d'index composes dans `prisma/schema.prisma` pour les filtres frequents `organizationId + date/statut`
- Borne detaillee ajoutee dans `src/lib/monthly-reports.ts` pour plafonner les onglets `depenses`, `ventes` et `achats` des exports mensuels a 500 lignes par flux, avec signalement dans la synthese
- Mise a jour de `docs/SCALABILITY_ROADMAP.md` pour passer la Phase 2 en cours

### Resultat

- `npm run lint` vert
- `npm test` vert
- `npm run build` vert
- Les listes clients/fournisseurs ne dependent plus du chargement integral de tous les achats/ventes lies
- Les exports mensuels ne peuvent plus grossir sans borne sur les onglets detailes principaux

### Prochaine session recommandee

- Poursuivre sur `notifications`, qui reste le hotspot Phase 2 le plus evident
- Generaliser les bornes explicites sur les listes encore non limitees (`health`, `stock`, `buildings`, referentiels de formulaires)
- Transformer les index prepares en migration Prisma des que l'on ouvre le chantier base de donnees

---

## Session 4 - 2026-03-28

### Travail effectue

- Mise en place d'un cron applicatif `app/api/cron/notifications/route.ts`
- Ajout d'une generation serveur reutilisable des alertes via `generateNotificationsForOrganization(...)`
- Ajout d'un digest email automatique dans `src/lib/notification-emails.ts` quand Resend est configure
- Ajout de `vercel.json` pour planifier le cron `/api/cron/notifications` chaque jour
- Passage du cron `/api/cron/notifications` a une frequence de 6 heures
- Ajout de `CRON_SECRET` dans la configuration d'environnement et la documentation d'exploitation
- Ajout d'une preference membre `emailNotificationsEnabled` sur l'organisation et branchement dans l'ecran equipe

### Resultat

- Les notifications ne dependent plus uniquement de l'ouverture de l'application
- L'app peut maintenant generer automatiquement les alertes metier et envoyer un recap email selon la preference de chaque membre
- `npm run lint`, `npm test` et `npm run build` restent verts

### Prochaine session recommandee

- Optimiser structurellement `src/actions/notifications.ts` pour reduire les boucles et ecritures redondantes
- Ajouter des tests cibles sur le cron et le filtrage des emails de notification
- Passer les index prepares en migration Prisma reelle

---

## Session 5 - 2026-03-28

### Travail effectue

- Refactor du moteur `src/actions/notifications.ts` pour mutualiser la creation des alertes par signal avec `createNotificationsIfAbsent(...)`
- Ajout d'une migration Prisma explicite `prisma/migrations/20260328183000_phase2_indexes_and_notification_preferences/migration.sql`
- La migration couvre les index composes Phase 2 et la nouvelle preference `emailNotificationsEnabled`
- Regeneration Prisma et validation complete apres refactor

### Resultat

- `npm run lint` vert
- `npm test` vert
- `npm run build` vert
- Le moteur de notifications est plus scalable qu'au debut de la phase
- La Phase 2 est tres avancee, mais pas encore fermee

### Prochaine session recommandee

- Generaliser les bornes explicites sur les listes encore non limitees (`health`, `stock`, `buildings`)
- Ajouter une petite mesure des temps de reponse ou un budget documente sur `dashboard` et `reports`
- Rejouer la migration sur la base cible pour finaliser l'aspect donnees/performance

---

## Session 6 - 2026-03-28

### Travail effectue

- Ajout d'une borne explicite sur `getVaccinationPlans` dans `src/actions/health.ts` avec `limit <= 100` et defaut `50`
- Ajout d'une borne explicite sur `getFeedStocks` et `getMedicineStocks` dans `src/actions/stock.ts` avec `limit <= 100` et defaut `50`
- Ajout d'une borne explicite sur `getBuildings` dans `src/actions/buildings.ts` avec `limit <= 100` et defaut `50`
- Documentation d'un budget de performance Phase 2 dans `docs/SCALABILITY_ROADMAP.md` et `docs/OPERATIONS.md`

### Resultat

- Les derniers `findMany` critiques identifies cote `health`, `stock` et `buildings` ne sont plus non bornes
- La Phase 2 dispose maintenant d'un cadre de performance explicite pour `dashboard`, `reports` et `notifications`
- La migration Prisma `20260328183000_phase2_indexes_and_notification_preferences` a ete appliquee avec succes sur la base configuree
- La Phase 2 est cloturee et la priorite active bascule vers la Phase 3

### Prochaine session recommandee

- Demarrer la Phase 3 en extrayant les logiques metier les plus chargees dans des services/domaines dedies
- Standardiser les DTO/view models entre `dashboard`, `reports` et `batches`
- Finir le durcissement restant de la Phase 1 sur les modules secondaires encore heterogenes

---

## Session 7 - 2026-03-28

### Travail effectue

- Demarrage effectif de la Phase 3 avec extraction d'un helper de domaine partage dans `src/lib/batch-metrics.ts`
- Centralisation du calcul `ageDay`, `liveCount`, `mortalityRatePct` et de la detection `missingSaisie`
- Remplacement des recalculs locaux dans `app/(dashboard)/batches/[id]/page.tsx`, `app/api/reports/batch/[id]/route.ts` et `src/lib/ai.ts`
- Ajout d'un test unitaire de contrat metier dans `src/lib/batch-metrics.test.ts`
- Mise a jour de la roadmap pour marquer la Phase 3 en cours

### Resultat

- Le detail lot, le PDF de lot et la preparation IA reposent maintenant sur la meme logique operationnelle
- La duplication de calculs entre page, export et IA baisse des le premier bloc de la Phase 3
- La structure devient plus lisible pour un nouveau dev sur le domaine `batches`

### Prochaine session recommandee

- Extraire un view model partage pour `dashboard`
- Extraire un view model partage pour les rapports mensuels
- Documenter la separation cible entre `app/`, `src/actions/`, `src/lib/` et `src/components/`

---

## Session 8 - 2026-03-28

### Travail effectue

- Extraction d'un view model partage du dashboard dans `src/lib/dashboard-view.ts`
- Centralisation des KPI, alertes de saisie, tri des lots actifs et preparation des points du graphique mortalite
- Simplification de `app/(dashboard)/dashboard/page.tsx`, qui orchestre maintenant le chargement puis delegue les calculs au view model
- Simplification de `app/(dashboard)/_components/ActiveBatchList.tsx`, qui recoit des cartes deja preparees au lieu de recalculer localement age et etat de saisie
- Ajout d'un test unitaire dans `src/lib/dashboard-view.test.ts`

### Resultat

- Le dashboard suit maintenant une separation plus nette entre chargement des donnees, assemblage metier et rendu
- La duplication entre page serveur et composants de presentation baisse sur un second axe concret de la Phase 3
- La structure devient plus predictable pour continuer sur les rapports mensuels

### Prochaine session recommandee

- Extraire le view model des rapports mensuels hors de `src/lib/monthly-reports.ts`
- Documenter la separation cible entre `app/`, `src/actions/`, `src/lib/` et `src/components/`
- Continuer l'uniformisation `validation + autorisation + mutation` sur les actions restantes

---

## Session 9 - 2026-03-28

### Travail effectue

- Extraction du view model des rapports mensuels dans `src/lib/monthly-report-view.ts`
- Separation entre chargement Prisma / formats de sortie dans `src/lib/monthly-reports.ts` et assemblage metier du DTO mensuel
- Simplification de `app/(dashboard)/reports/page.tsx` et `app/(dashboard)/reports/_components/ReportsPageClient.tsx` autour d'une prop unique `report`
- Alignement du PDF mensuel sur le meme type partage dans `src/components/pdf/MonthlyReportDocument.tsx`
- Ajout d'un test unitaire dans `src/lib/monthly-report-view.test.ts`

### Resultat

- Les rapports mensuels suivent maintenant la meme logique d'architecture que le detail lot et le dashboard
- Le DTO `MonthlyReportData` devient une vraie interface de domaine partagee entre page, API et exports
- La duplication de mapping entre surfaces baisse encore sur un troisieme axe majeur de la Phase 3

### Prochaine session recommandee

- Documenter la separation cible entre `app/`, `src/actions/`, `src/lib/` et `src/components/`
- Continuer l'uniformisation `validation + autorisation + mutation` sur les actions restantes
- Reviser ensuite le domaine abonnements / paiements comme prochain candidat d'extraction

---

## Session 10 - 2026-03-28

### Travail effectue

- Ajout d'une reference d'architecture dans `docs/ARCHITECTURE.md`
- Formalisation de la separation cible entre `app/`, `src/actions/`, `src/lib/` et `src/components/`
- Extraction des transitions d'abonnement partagees dans `src/lib/subscription-lifecycle.ts`
- Rebranchement de `src/actions/subscriptions.ts` et `src/lib/payments.ts` sur cette logique de domaine commune

### Resultat

- La Phase 3 est maintenant documentee et plus explicite pour les prochains refactors
- Le domaine `subscriptions / payments` commence a sortir de la logique inline dans les actions
- Le risque de divergence entre activation admin, activation apres paiement et demarrage d'essai baisse

### Prochaine session recommandee

- Continuer l'uniformisation `validation + autorisation + mutation` sur les actions restantes
- Poursuivre l'extraction du domaine `subscriptions / payments` avec des tests de contrat dedies
- Isoler ensuite branding, formatters et primitives de presentation si on veut continuer a fermer la Phase 3

---

## Session 11 - 2026-03-28

### Travail effectue

- Ajout de helpers d'acces communs dans `src/lib/auth.ts` avec `requireOrganizationModuleContext()` et `requireRole()`
- Refactor de `src/actions/subscriptions.ts` pour utiliser ce pattern commun sur les flux `paiement`, `confirmation`, `rejet` et `credits IA`
- Nettoyage final des warnings apres refactor

### Resultat

- Le pattern `validation + autorisation + mutation` devient plus concret et reutilisable dans le code
- Le domaine `subscriptions / payments` est maintenant plus coherent sur la sequence d'acces serveur
- La Phase 3 continue de se fermer sans casser la validation technique

### Prochaine session recommandee

- Etendre `requireOrganizationModuleContext()` et `requireRole()` aux autres actions qui repetent encore ce schema
- Ajouter des tests de contrat dedies au domaine `subscription-lifecycle`
- Continuer ensuite sur l'isolation branding / formatters / primitives de presentation

---

## Session 12 - 2026-03-28

### Travail effectue

- Ajout d'un test de contrat dedie dans `src/lib/subscription-lifecycle.test.ts`
- Verification du calcul de fin de periode via `buildSubscriptionPeriodEnd(...)`
- Verification des payloads `upsert` pour `activateOrganizationSubscription(...)`
- Verification des payloads `upsert` et du calcul d'essai pour `startOrganizationTrial(...)`
- Validation complete apres ajout des tests

### Resultat

- Le domaine `subscriptions / payments` est maintenant protege par des tests de contrat sur ses transitions metier les plus sensibles
- Le risque de regression silencieuse entre essai, activation admin et activation apres paiement baisse avant de poursuivre les refactors Phase 3
- `npm run lint`, `npm test` et `npm run build` restent verts

### Prochaine session recommandee

- Continuer l'extension du pattern `validation + autorisation + mutation` sur les actions restantes, en priorite `batches`
- Isoler ensuite les primitives de presentation transverses (`branding`, `formatters`, helpers d'affichage) pour continuer a fermer la Phase 3
- Revenir sur la cloture complete de la Phase 3 une fois ces deux blocs consolides

---

## Session 13 - 2026-03-28

### Travail effectue

- Alignement de `src/actions/batches.ts` sur le helper `requireOrganizationModuleContext()`
- Remplacement de la sequence repetitive `requireSession + requireMembership + requireModuleAccess` sur `getBatches`, `getBatch`, `createBatch`, `updateBatch`, `closeBatch` et `deleteBatch`
- Conservation des controles metier fins existants sur `canPerformAction(...)`, quotas d'abonnement et droits par ferme
- Validation complete apres refactor

### Resultat

- Le domaine `batches`, qui est un des coeurs du produit, suit maintenant le meme pattern d'acces serveur que les autres domaines deja refactorises
- La duplication structurelle baisse encore sans changer les regles metier des lots
- `npm run lint`, `npm test` et `npm run build` restent verts

### Prochaine session recommandee

- Finir l'uniformisation du pattern sur les actions restantes les plus chargees
- Isoler ensuite les primitives de presentation transverses (`branding`, `formatters`, helpers d'affichage) pour rapprocher la cloture de la Phase 3
- Statuer ensuite sur la fermeture complete de la Phase 3

---

## Session 14 - 2026-03-28

### Travail effectue

- Alignement de `src/actions/organizations.ts` sur `requireOrganizationModuleContext()`
- Remplacement de la sequence repetitive `requireSession + requireMembership + requireModuleAccess` sur les flux `membres`, `roles`, `permissions module` et `preferences de notification`
- Conservation des gardes metier existants sur `INVITE_USER`, dernier `OWNER` et audit trail
- Validation complete apres refactor

### Resultat

- Le domaine `organization / team` suit maintenant le meme pattern d'acces serveur que `subscriptions`, `batches`, `farms`, `customers`, `suppliers`, `purchases` et `expenses`
- La Phase 3 gagne encore en cohesion architecturale sans changer les regles produit
- `npm run lint`, `npm test` et `npm run build` restent verts

### Prochaine session recommandee

- Finir l'uniformisation sur les actions restantes les plus lourdes (`buildings`, `daily-records`, `stock`, puis `health` si on veut aller au bout)
- Basculer ensuite sur l'isolation des primitives de presentation transverses (`branding`, `formatters`, helpers d'affichage)
- Statuer ensuite sur la cloture complete de la Phase 3

---

## Session 15 - 2026-03-28

### Travail effectue

- Alignement de `src/actions/buildings.ts` sur `requireOrganizationModuleContext()`
- Remplacement de la sequence repetitive `requireSession + requireMembership` sur `getBuildings`, `getBuilding`, `createBuilding`, `updateBuilding` et `deleteBuilding`
- Conservation des gardes metier existants sur `MANAGE_FARMS` et `canAccessFarm(...)`
- Validation complete apres refactor

### Resultat

- Le domaine `buildings` suit maintenant le meme pattern d'acces serveur que les autres domaines deja homogenises
- La Phase 3 continue de gagner en lisibilite sans changement de comportement produit
- `npm run lint`, `npm test` et `npm run build` restent verts

### Prochaine session recommandee

- Traiter `src/actions/daily-records.ts`, qui est le dernier gros bloc metier vraiment structurant cote actions
- Basculer ensuite sur l'isolation des primitives de presentation transverses (`branding`, `formatters`, helpers d'affichage)
- Statuer enfin sur la cloture complete de la Phase 3

---

## Session 16 - 2026-03-28

### Travail effectue

- Alignement de `src/actions/daily-records.ts` sur `requireOrganizationModuleContext()`
- Remplacement de la sequence repetitive `requireSession + requireMembership + requireModuleAccess` sur `getDailyRecords`, `getDailyRecord`, `createDailyRecord` et `updateDailyRecord`
- Conservation des regles metier existantes sur `CREATE_DAILY_RECORD`, `UPDATE_DAILY_RECORD`, verrouillage J+1 et controles d'acces par ferme
- Validation complete apres refactor

### Resultat

- Le domaine `daily-records`, qui est un des plus critiques du produit terrain, suit maintenant le meme pattern d'acces serveur que les autres grands blocs refactorises
- La Phase 3 est tres avancee cote architecture des actions et des view models
- `npm run lint`, `npm test` et `npm run build` restent verts

### Prochaine session recommandee

- Isoler les primitives de presentation transverses (`branding`, `formatters`, helpers d'affichage)
- Faire un dernier passage de revue sur les actions secondaires restantes si on veut une cloture Phase 3 stricte
- Statuer ensuite sur la cloture complete de la Phase 3

---

## Session 17 - 2026-03-28

### Travail effectue

- Renforcement de `src/lib/formatters.ts` avec des helpers d'affichage transverses pour comptes unites, durees et credits IA
- Rebranchement de [src/components/layout/Header.tsx](C:/Users/pcpro/sunufarm/src/components/layout/Header.tsx), [app/(dashboard)/settings/page.tsx](C:/Users/pcpro/sunufarm/app/(dashboard)/settings/page.tsx) et [app/(dashboard)/batches/new/_components/CreateBatchForm.tsx](C:/Users/pcpro/sunufarm/app/(dashboard)/batches/new/_components/CreateBatchForm.tsx) sur ces primitives partagees
- Uniformisation de l'affichage des jours restants, des credits IA, des capacites et des compteurs metier
- Validation complete apres refactor

### Resultat

- La Phase 3 ne repose plus seulement sur des services/view models, mais commence aussi a centraliser le langage d'affichage transverse du produit
- La duplication d'affichage baisse sur des surfaces visibles sans changer le rendu fonctionnel
- `npm run lint`, `npm test` et `npm run build` restent verts

### Prochaine session recommandee

- Statuer franchement sur la cloture complete de la Phase 3
- Si on veut une lecture stricte, faire un dernier passage sur quelques actions secondaires restantes avant fermeture
- Sinon basculer sur la Phase 4 pour etendre les tests et l'automatisation

---

## Session 18 - 2026-03-28

### Travail effectue

- Demarrage effectif de la Phase 4 avec un workflow GitHub Actions minimal dans `.github/workflows/ci.yml`
- La CI execute maintenant `npm ci`, `npx prisma generate`, `npm run lint`, `npm test` et `npm run build`
- Ajout de tests unitaires sur `src/lib/formatters.ts` dans `src/lib/formatters.test.ts`
- Mise a jour de `vitest.config.ts` pour executer aussi les tests co-localises dans `src/**/*.test.ts`

### Resultat

- La qualite ne depend plus uniquement d'une verification manuelle locale : un socle CI existe maintenant
- Les tests co-localises sont enfin pris en compte par Vitest
- Validation actuelle : `9` fichiers de test, `26` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Ajouter des tests sur les Server Actions critiques, en priorite `daily-records`, `batches` et `subscriptions`
- Introduire ensuite une petite matrice de non-regression avant merge
- Avancer vers des tests d'integration sur `organisation active` et `permissions`

---

## Session 19 - 2026-03-28

### Travail effectue

- Extraction des regles pures de saisie journaliere dans `src/lib/daily-record-rules.ts`
- Ajout de tests dedies dans `src/lib/daily-record-rules.test.ts`
- Couverture des regles de normalisation a minuit UTC et du verrouillage J+2
- Rebranchement de `src/actions/daily-records.ts` sur ce module de regles partage

### Resultat

- La Phase 4 avance maintenant sur une priorite metier explicite : la saisie journaliere
- Les regles critiques de verrouillage ne dependent plus seulement d'une revue de code
- Validation actuelle : `10` fichiers de test, `29` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer sur des tests cibles pour `batches` ou `subscriptions`
- Commencer les tests d'integration autour de `organisation active` et `permissions`
- Introduire ensuite une petite matrice de non-regression avant merge

---

## Session 20 - 2026-03-28

### Travail effectue

- Extraction des regles pures de lot dans `src/lib/batch-rules.ts`
- Ajout de tests dedies dans `src/lib/batch-rules.test.ts`
- Couverture du scope de fermes accessibles et de la generation du prochain numero de lot
- Rebranchement de `src/actions/batches.ts` sur ces regles partagees

### Resultat

- La Phase 4 avance maintenant aussi sur le domaine `batches`
- Les regles critiques autour du scope lecture et de la numerotation des lots ne dependent plus seulement d'une revue de code
- Validation actuelle : `11` fichiers de test, `32` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer sur des tests cibles pour `subscriptions`
- Commencer les tests d'integration autour de `organisation active` et `permissions`
- Introduire ensuite une petite matrice de non-regression avant merge

---

## Session 21 - 2026-03-28

### Travail effectue

- Extraction des regles pures d'abonnement dans `src/lib/subscription-rules.ts`
- Ajout de tests dedies dans `src/lib/subscription-rules.test.ts`
- Couverture de l'essai autorise ou refuse, de l'acces IA illimite et du calcul des credits restants
- Rebranchement de `src/actions/subscriptions.ts` sur ces regles partagees
- Nettoyage du commentaire orphelin dans `src/actions/batches.ts`

### Resultat

- La Phase 4 avance maintenant aussi sur le domaine `subscriptions`
- Les regles critiques autour des essais et des credits IA ne dependent plus seulement d'une revue de code
- Validation actuelle : `12` fichiers de test, `38` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Commencer les tests d'integration autour de `organisation active` et `permissions`
- Definir une petite matrice de non-regression avant merge
- Revenir ensuite sur les calculs de rentabilite si on veut continuer les priorites Phase 4

---

## Session 22 - 2026-03-28

### Travail effectue

- Ajout d'une suite dediee `src/lib/permissions.test.ts`
- Couverture de la hierarchie des roles, de la matrice d'actions, des modules effectifs et des acces par ferme
- Consolidation de la Phase 4 sur un module transverse critique reutilise dans de nombreuses Server Actions

### Resultat

- La base de permissions est maintenant verrouillee par des tests unitaires utiles
- On reduit le risque de regression silencieuse sur les autorisations lors des prochains refactors
- Validation actuelle : `13` fichiers de test, `46` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Commencer les tests d'integration autour de `organisation active`
- Definir une petite matrice de non-regression avant merge
- Revenir ensuite sur les calculs de rentabilite si on veut continuer les priorites Phase 4

---

## Session 23 - 2026-03-28

### Travail effectue

- Ajout d'un test d'integration leger dans `tests/organization-context.test.ts`
- Couverture de l'action `selectActiveOrganization` sur quatre scenarios: session absente, ID invalide, organisation refusee et selection valide
- Verification de l'ecriture du cookie `sunufarm_active_org` et de la revalidation du layout

### Resultat

- La priorite `organisation active` est maintenant couverte par un vrai test de flux serveur
- On reduit le risque de regression sur un point central du multi-tenant sans dependre d'une base de test complete
- Validation actuelle : `14` fichiers de test, `50` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer sur les tests d'integration autour de `permissions`
- Definir une petite matrice de non-regression avant merge
- Revenir ensuite sur les calculs de rentabilite si on veut continuer les priorites Phase 4

---

## Session 24 - 2026-03-28

### Travail effectue

- Ajout d'un test d'integration leger dans `tests/expenses-permissions.test.ts`
- Couverture de `createExpense` sur quatre scenarios: donnees invalides, module refuse, role refuse et creation autorisee
- Verification de la chaine `requireOrganizationModuleContext -> requireRole -> mutation -> audit`

### Resultat

- La priorite `permissions` est maintenant couverte par un vrai flux serveur sur une action metier sensible
- On reduit le risque de regression sur les autorisations transverses sans devoir monter une base de test complete
- Validation actuelle : `15` fichiers de test, `54` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Definir une petite matrice de non-regression avant merge
- Revenir ensuite sur les calculs de rentabilite si on veut continuer les priorites Phase 4
- Statuer ensuite sur la cloture partielle ou complete du bloc Phase 4

---

## Session 25 - 2026-03-28

### Travail effectue

- Creation de `docs/NON_REGRESSION_MATRIX.md`
- Formalisation d'un socle en trois niveaux: automatique avant merge, verification ciblee selon le diff, verification ciblee avant deploiement
- Ajout des pointeurs vers cette matrice dans `README.md`, `docs/OPERATIONS.md` et `docs/SCALABILITY_ROADMAP.md`

### Resultat

- La Phase 4 dispose maintenant d'une reference simple et actionnable avant merge
- Les validations manuelles sont mieux ciblees, avec moins de risque d'oublier un parcours critique
- Le projet a maintenant un chemin plus clair entre CI automatique et verification produit

### Prochaine session recommandee

- Revenir sur les calculs de rentabilite pour continuer les priorites Phase 4
- Statuer ensuite sur la cloture partielle ou complete du bloc Phase 4
- Si besoin, transformer la matrice en template PR plus tard

---

## Session 26 - 2026-03-28

### Travail effectue

- Extraction des calculs purs de rentabilite lot dans `src/lib/batch-profitability.ts`
- Ajout de tests dedies dans `src/lib/batch-profitability.test.ts`
- Couverture de la marge, du cout par sujet, de la mortalite et des cas limites a zero
- Rebranchement de `src/actions/profitability.ts` sur ce helper partage

### Resultat

- La priorite `calculs de rentabilite` est maintenant couverte par un vrai contrat unitaire
- On reduit le risque de divergence entre l'action analytique et les futures surfaces qui reutiliseront ces KPI
- Validation actuelle : `16` fichiers de test, `57` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer sur les tests des rapports mensuels pour finir les priorites Phase 4 les plus visibles
- Statuer ensuite sur la cloture partielle ou complete du bloc Phase 4
- Eventuellement ajouter un test sur les paiements admin si on veut pousser la phase un cran plus loin

---

## Session 27 - 2026-03-28

### Travail effectue

- Ajout de `src/lib/monthly-reports.test.ts`
- Couverture des sorties `CSV` et workbook Excel du module rapports mensuels
- Verification des onglets attendus, des KPI visibles et des lignes detaillees exportees

### Resultat

- La priorite `rapports mensuels` est maintenant couverte sur le view model et sur deux formats d'export concrets
- On reduit le risque de regression sur une zone visible du produit, sans introduire de test d'integration lourd
- Validation actuelle : `17` fichiers de test, `59` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Statuer sur la cloture partielle ou complete du bloc Phase 4
- Eventuellement ajouter un test sur les paiements admin / abonnement pour pousser encore la couverture
- Sinon preparer la transition vers la Phase 5

---

## Session 28 - 2026-03-28

### Travail effectue

- Ajout de `tests/subscriptions-admin-payments.test.ts`
- Couverture de `adminRejectPaymentTransaction` sur quatre scenarios: session absente, refus hors super admin, transaction introuvable et rejet complet reussi
- Verification de la chaine `session -> role super admin -> transaction DB -> audit -> revalidation`

### Resultat

- La priorite `paiements admin / abonnement` est maintenant couverte par un vrai flux serveur sensible
- La Phase 4 dispose maintenant d'une couverture plus complete sur les chemins critiques les plus risqués du produit
- Validation actuelle : `18` fichiers de test, `63` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Statuer sur la cloture partielle ou complete du bloc Phase 4
- Si on veut aller plus loin, commencer la Phase 5 sur l'observabilite
- Sinon preparer un push propre du travail de la session

---

## Session 29 - 2026-03-28

### Travail effectue

- Relecture de coherence de la Phase 4 par rapport a ses criteres de sortie
- Cloture de la Phase 4 dans `docs/SCALABILITY_ROADMAP.md`
- Maintien de la Phase 3 comme prochain bloc actif, la qualite et l'automatisation ayant atteint un niveau defendable

### Resultat

- La Phase 4 est maintenant consideree terminee
- Le projet dispose d'une CI minimale, d'une matrice de non-regression et d'une couverture utile sur les chemins critiques les plus sensibles
- Les points non traites volontairement, comme des fixtures plus riches ou une couverture encore plus large, sont assumes comme des approfondissements futurs et non comme des bloqueurs de phase

### Prochaine session recommandee

- Revenir sur la Phase 3 pour finir l'uniformisation architecturale restante
- Cibler en priorite les actions secondaires encore heterogenes et les primitives de presentation restantes
- Statuer ensuite sur la cloture de la Phase 3 avant d'ouvrir vraiment la Phase 5

---

## Session 30 - 2026-03-28

### Travail effectue

- Alignement de `src/actions/eggs.ts` sur le pattern commun `validation -> auth -> autorisation -> mutation`
- Remplacement de `requireSession + requireMembership` par `requireOrganizationModuleContext()` sur les flux du module oeufs
- Ajout de gardes de role explicites via `requireRole()` sur les mutations

### Resultat

- Le module `eggs` n'est plus un ilot d'ancien pattern dans les actions secondaires
- La Phase 3 avance encore sur l'uniformisation architecturale sans changer le comportement metier du module
- Validation actuelle : `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer sur `stock`, `health` ou `notifications`, qui restent les gros modules secondaires les plus heterogenes
- Revenir ensuite sur les primitives de presentation restantes
- Statuer ensuite sur la cloture de la Phase 3

---

## Session 31 - 2026-03-28

### Travail effectue

- Alignement de `src/actions/stock.ts` sur le pattern commun `validation -> auth -> autorisation -> mutation`
- Remplacement de `requireSession + requireMembership + requireModuleAccess` par `requireOrganizationModuleContext()` sur les flux principaux du module
- Ajout de gardes de role explicites via `requireRole()` sur les mutations, sans toucher aux gardes par ferme ni aux regles de mouvement

### Resultat

- Le module `stock` n'est plus une grosse exception architecturale dans les actions secondaires
- La Phase 3 avance nettement sur un des modules les plus lourds encore heterogenes
- Validation actuelle : `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer sur `health` ou `notifications`, qui restent les plus gros blocs secondaires encore non homogenises
- Revenir ensuite sur les primitives de presentation restantes
- Statuer ensuite sur la cloture de la Phase 3

---

## Session 32 - 2026-03-28

### Travail effectue

- Alignement de `src/actions/health.ts` sur le pattern commun `validation -> auth -> autorisation -> mutation`
- Remplacement de `requireSession + requireMembership` par `requireOrganizationModuleContext()` sur les flux principaux du module sante
- Ajout de gardes de role explicites via `requireRole()` sur les mutations, sans toucher aux gardes par ferme, statuts de lot ni regles sanitaires

### Resultat

- Le module `health` n'est plus une grosse exception architecturale dans les actions secondaires
- La Phase 3 progresse fortement sur un autre bloc lourd et sensible du produit
- Validation actuelle : `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer sur `notifications`, qui reste le plus gros module secondaire encore non homogenise
- Revenir ensuite sur les primitives de presentation restantes
- Statuer ensuite sur la cloture de la Phase 3

---

## Session 33 - 2026-03-28

### Travail effectue

- Alignement de `src/actions/notifications.ts` sur le pattern commun `validation -> auth -> autorisation -> mutation`
- Remplacement de `requireSession + requireMembership` par `requireOrganizationModuleContext()` sur les flux utilisateur du module
- Conservation du comportement metier existant sur la generation automatique et la lecture par utilisateur

### Resultat

- Le module `notifications` n'est plus une exception architecturale parmi les actions secondaires
- Le gros du chantier d'uniformisation Phase 3 cote actions serveur est maintenant derriere nous
- Validation actuelle : `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Statuer sur la cloture de la Phase 3, avec un dernier passage seulement si on veut etre tres strict
- Sinon revenir sur les primitives de presentation restantes pour finir proprement la phase
- Puis ouvrir la transition vers la Phase 5

---

## Session 34 - 2026-03-28

### Travail effectue

- Relecture de coherence de la Phase 3 par rapport a ses objectifs et a son etat reel dans le code
- Cloture de la Phase 3 dans `docs/SCALABILITY_ROADMAP.md`
- Positionnement explicite des derniers elements restants comme du polissage et non comme des bloqueurs architecturaux

### Resultat

- La Phase 3 est maintenant consideree terminee
- L'architecture applicative est suffisamment modulaire et lisible pour supporter la suite du projet et l'arrivee de nouveaux changements sans dispersion majeure
- Les calculs partages, view models, helpers d'autorisation et primitives transversales couvrent maintenant l'essentiel des zones structurantes

### Prochaine session recommandee

- Ouvrir proprement la Phase 5 sur l'observabilite et la securite
- Prioriser la standardisation des logs critiques et la correlation des flux sensibles
- Garder les petits raffinements UI ou actions secondaires pour des opportunites ponctuelles, sans reouvrir la Phase 3

---

## Session 35 - 2026-03-28

### Travail effectue

- Demarrage de la Phase 5 par un socle de correlation de requete dans `src/lib/request-security.ts`
- Introduction d'un `requestId` resolu depuis les headers ou genere cote serveur
- Ajout de logs structures avec `requestId` sur `api/cron/notifications`, `api/payments/transactions/[transactionId]/checkout`, `api/ai/analyze` et `api/reports/monthly`

### Resultat

- Les flux sensibles ont maintenant une premiere base de correlation exploitable en incident
- Les refus d'acces, rate limits, echecs de checkout, erreurs AI et executions de cron sont plus faciles a relier et diagnostiquer
- Validation actuelle : `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer la Phase 5 sur la standardisation des logs applicatifs critiques
- Ajouter ensuite une correlation plus explicite sur quelques flux serveur sensibles
- Puis revenir sur le rate limiting ou les endpoints admin si on veut renforcer la securite

---

## Session 36 - 2026-03-28

### Travail effectue

- Extension des logs structures avec `requestId` sur les webhooks de paiement
- Extension des logs structures sur les routes admin de confirmation/rejet de transaction et de mise a jour d'abonnement
- Ajout du meme niveau de traces sur l'export PDF lot dans `app/api/reports/batch/[id]/route.ts`

### Resultat

- Les flux paiements, webhooks, admin et exports PDF disposent maintenant d'un niveau de trace plus coherent
- Les incidents de paiement ou d'export deviennent plus faciles a reconstruire a partir des logs serveur
- Validation actuelle : `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer la Phase 5 sur le rate limiting et les endpoints admin sensibles
- Ou bien formaliser un tableau de bord minimal de sante applicative a partir des evenements deja traces
- Garder la correlation `requestId` comme socle pour les prochains ajouts d'observabilite

---

## Session 37 - 2026-03-28

### Travail effectue

- Ajout d'un rate limiting explicite sur `api/subscriptions/payments`
- Ajout d'un rate limiting explicite sur `api/subscriptions/payments/[paymentId]/confirm` et `api/subscriptions/payments/[paymentId]/reject`
- Ajout d'un rate limiting explicite sur `api/payments/webhooks/[provider]`
- Ajout des logs structures correspondants sur ces routes, avec `requestId`

### Resultat

- Les flux d'abonnement et les webhooks de paiement ont maintenant une premiere protection explicite contre les rafales et repetitions involontaires
- Les headers de rate limit sont renvoyes de facon coherente sur ces endpoints sensibles
- Validation actuelle : `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer la Phase 5 sur un tableau de bord minimal de sante applicative
- Ou bien renforcer encore les endpoints admin et webhooks si on veut pousser le durcissement securite
- Garder `requestId` et les logs structures comme base commune pour la suite

---

## Session 38 - 2026-03-28

### Travail effectue

- Ajout d'un helper de sante applicative dans `src/lib/app-health.ts`
- Ajout des tests dedies dans `src/lib/app-health.test.ts`
- Branchement d'un tableau de bord minimal de sante applicative dans `app/admin/page.tsx`
- La vue admin expose maintenant l'etat global, les checks critiques de configuration, le backlog paiements, les transactions techniques stale, les erreurs webhook sur 24h et le volume d'audit recent
- Mise a jour de `docs/SCALABILITY_ROADMAP.md` pour refleter l'avancement Phase 5

### Resultat

- La Phase 5 dispose maintenant d'une premiere surface de supervision exploitable sans outil externe
- Les super admins peuvent voir rapidement si les garde-fous critiques sont en place et si un backlog technique demande une intervention
- Validation actuelle : `19` fichiers de test, `66` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer la Phase 5 sur l'instrumentation plus systematique des erreurs serveur et erreurs d'export
- Revoir les secrets et variables par environnement pour distinguer les configurations critiques des integrations optionnelles
- Formaliser ensuite la procedure de backup / restore et la reponse a incident minimale

---

## Session 39 - 2026-03-28

### Travail effectue

- Durcissement des routes `app/api/reports/monthly/route.ts`, `app/api/subscriptions/payments/route.ts`, `app/api/subscriptions/payments/[paymentId]/confirm/route.ts`, `app/api/subscriptions/payments/[paymentId]/reject/route.ts` et `app/api/admin/subscriptions/[organizationId]/route.ts`
- Les corps JSON invalides sont maintenant detectes explicitement et renvoyes en `400 INVALID_JSON`
- Les erreurs techniques inattendues de ces routes sont maintenant journalisees proprement avec `requestId`
- Les routes `app/api/admin/payments/transactions/[transactionId]/confirm/route.ts` et `app/api/admin/payments/transactions/[transactionId]/reject/route.ts` tracent maintenant elles aussi les echecs techniques inattendus

### Resultat

- Les erreurs serveur et erreurs d'entree sont mieux distinguees sur les flux abonnement, admin et export
- Les incidents deviennent plus faciles a diagnostiquer sans confondre JSON invalide, refus metier et vraies erreurs internes
- Validation actuelle : `19` fichiers de test, `66` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Revoir les secrets et variables d'environnement par environnement pour identifier les dependances critiques et optionnelles
- Formaliser ensuite la procedure de backup / restore de base de donnees
- Documenter enfin une reponse a incident minimale pour fermer plus proprement la Phase 5

---

## Session 40 - 2026-03-28

### Travail effectue

- Ajout d'un diagnostic centralise des variables d'environnement dans `src/lib/environment-readiness.ts`
- Ajout des tests dedies dans `src/lib/environment-readiness.test.ts`
- Rebranchement de `app/admin/page.tsx` sur ce diagnostic pour eviter les checks env eparpilles
- Alignement de `app/api/payments/webhooks/[provider]/route.ts` sur `getServerEnv()` au lieu d'un acces direct a `process.env`
- Mise a jour de `.env.local.example`, `README.md` et `docs/OPERATIONS.md` pour distinguer minimum de boot et integrations optionnelles

### Resultat

- L'etat des secrets et variables critiques est maintenant plus lisible, plus centralise et plus fidele au code reel
- Les super admins voient mieux quelles integrations sont absentes, partielles ou correctement configurees
- Validation actuelle : `20` fichiers de test, `69` tests, `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Formaliser la procedure de backup / restore de base de donnees
- Documenter ensuite une reponse a incident minimale
- Revenir enfin sur la cloture de la Phase 5 quand ces deux blocs seront en place

---

## Session 41 - 2026-03-28

### Travail effectue

- Ajout d'un runbook de sauvegarde et restauration dans `docs/BACKUP_RESTORE.md`
- Documentation d'une strategie de backup logique PostgreSQL avec exemples `pg_dump`, `pg_restore` et `psql`
- Ajout d'une verification post-restore avec `npx prisma migrate status`, `npm run test` et `npm run build`
- Mise a jour de `docs/OPERATIONS.md`, `README.md`, `docs/SCALABILITY_ROADMAP.md`

### Resultat

- Le projet dispose maintenant d'une procedure explicite de backup / restore adaptee au socle PostgreSQL + Prisma reel
- La Phase 5 se rapproche d'une cloture defendable sur l'exploitation et la recuperation incident
- Validation non relancee: changements documentaires uniquement

### Prochaine session recommandee

- Documenter une reponse a incident minimale
- Statuer ensuite sur la cloture de la Phase 5
- Puis ouvrir la Phase 6

---

## Session 42 - 2026-03-28

### Travail effectue

- Ajout d'un runbook de reponse a incident dans `docs/INCIDENT_RESPONSE.md`
- Documentation d'une boucle minimale: detection, diagnostic, mitigation, restauration et retour au service
- Alignement de `docs/OPERATIONS.md`, `README.md` et `docs/SCALABILITY_ROADMAP.md`

### Resultat

- Le projet dispose maintenant d'une procedure d'incident simple et coherente avec les logs structures, la page admin et le runbook backup/restore
- La Phase 5 couvre maintenant observation, securite de base, reprise et reponse a incident
- Validation non relancee: changements documentaires uniquement

### Prochaine session recommandee

- Statuer sur la cloture de la Phase 5
- Puis ouvrir la Phase 6

---

## Session 43 - 2026-03-28

### Travail effectue

- Relecture finale de la Phase 5 par rapport a ses criteres de sortie
- Cloture de la Phase 5 dans `docs/SCALABILITY_ROADMAP.md`
- Bascule de la priorite active vers la Phase 6 dans `PROGRESS.md`

### Resultat

- La Phase 5 est maintenant consideree terminee
- Le projet dispose d'un socle coherent pour observer, proteger et exploiter les flux critiques, avec supervision admin minimale et procedures de reprise
- La suite logique devient la Phase 6, orientee scalabilite produit et equipe

### Prochaine session recommandee

- Ouvrir la Phase 6
- Prioriser les chantiers d'organisation du travail, ownership et seed/demo stable

---

## Session 44 - 2026-03-28

### Travail effectue

- Demarrage effectif de la Phase 6
- Ajout d'un cadre de travail equipe dans `docs/TEAM_WORKFLOW.md`
- Ajout d'un onboarding dev court dans `docs/ONBOARDING.md`
- Mise a jour de `README.md` et `docs/SCALABILITY_ROADMAP.md`

### Resultat

- Le projet devient plus facile a reprendre et a faire avancer a plusieurs
- La Phase 6 est maintenant engagee sur un premier bloc concret: workflow equipe + onboarding
- Validation non relancee: changements documentaires uniquement

### Prochaine session recommandee

- Continuer la Phase 6 sur l'ownership plus explicite des domaines
- Ou bien preparer une version seed/demo stable pour accelerer l'onboarding produit

---

## Session 45 - 2026-03-28

### Travail effectue

- Stabilisation de la seed demo dans `prisma/seed.ts` avec suppression des aleas
- Ajout de `docs/DEMO_DATA.md` pour documenter les comptes, roles, lots utiles et parcours de demo
- Mise a jour de `docs/ONBOARDING.md`, `README.md` et `docs/SCALABILITY_ROADMAP.md`

### Resultat

- Le projet dispose maintenant d'un jeu de donnees de demo stable, plus fiable pour l'onboarding, la demo produit et les validations manuelles
- La Phase 6 avance sur un second bloc concret: seed/demo stable

### Prochaine session recommandee

- Continuer la Phase 6 sur l'ownership plus explicite des domaines
- Ou bien prioriser les modules par impact business reel

---

## Session 46 - 2026-03-28

### Travail effectue

- Ajout d'un decoupage explicite des domaines dans `docs/DOMAIN_OWNERSHIP.md`
- Mise a jour de `docs/TEAM_WORKFLOW.md`, `README.md` et `docs/SCALABILITY_ROADMAP.md`

### Resultat

- Le projet dispose maintenant d'un ownership plus clair par domaine, avec points d'entree et vigilance de review
- La Phase 6 avance sur un troisieme bloc concret: ownership fonctionnel explicite
- Validation non relancee: changements documentaires uniquement

### Prochaine session recommandee

- Prioriser les modules par impact business reel
- Ou bien definir une roadmap trimestrielle produit/tech separee

---

## Session 47 - 2026-03-28

### Travail effectue

- Ajout d'une grille de priorisation des modules dans `docs/MODULE_PRIORITIES.md`
- Distinction explicite entre coeur de fonctionnement, impact business direct, differenciation produit et acceleration equipe
- Mise a jour de `README.md`, `docs/TEAM_WORKFLOW.md` et `docs/SCALABILITY_ROADMAP.md`
- Correction de l'etat du README pour refleter que la Phase 5 est terminee et que la Phase 6 est en cours

### Resultat

- La Phase 6 relie maintenant plus clairement les arbitrages techniques aux enjeux produit reels
- L'equipe a une base simple pour choisir quoi fiabiliser et reviewer en priorite
- Validation non relancee: changements documentaires uniquement

### Prochaine session recommandee

- Definir une roadmap trimestrielle produit/tech separee de la roadmap historique
- Puis identifier les besoins futurs de jobs asynchrones et de cache applicatif

---

## Session 48 - 2026-03-28

### Travail effectue

- Ajout d'une roadmap trimestrielle produit/tech dans `docs/QUARTERLY_ROADMAP.md`
- Decoupage en horizon court, trimestre suivant et trimestre d'apres
- Alignement de cette trajectoire sur `docs/MODULE_PRIORITIES.md`
- Mise a jour de `README.md` et `docs/SCALABILITY_ROADMAP.md`

### Resultat

- La Phase 6 dispose maintenant d'une vraie lecture temporelle, separee de l'ancienne logique de roadmap MVP
- L'equipe peut mieux arbitrer entre stabilite du coeur, valeur produit et chantiers de plateforme
- Validation non relancee: changements documentaires uniquement

### Prochaine session recommandee

- Identifier les futurs besoins de file de jobs pour exports, emails et traitements lourds
- Puis etudier les besoins de cache et d'async processing

---

## Session 49 - 2026-03-28

### Travail effectue

- Ajout d'une trajectoire des jobs asynchrones dans `docs/ASYNC_JOBS.md`
- Distinction entre traitements a garder synchrones, bons candidats a une queue et signaux de bascule
- Proposition d'une premiere decoupe ciblee autour de `report_exports` puis `notification_emails`
- Mise a jour de `README.md`, `docs/SCALABILITY_ROADMAP.md` et `docs/QUARTERLY_ROADMAP.md`

### Resultat

- La Phase 6 couvre maintenant aussi la trajectoire des traitements lourds sans introduire prematurement une complexite d'infrastructure
- L'equipe sait quels flux surveiller et a partir de quels signes une queue deviendra justifiee
- Validation non relancee: changements documentaires uniquement

### Prochaine session recommandee

- Etudier les futurs besoins de cache et d'async processing
- Puis statuer sur la cloture de la Phase 6

---

## Session 50 - 2026-03-28

### Travail effectue

- Ajout d'une strategie cible de cache et d'async processing dans `docs/CACHE_STRATEGY.md`
- Distinction entre bons candidats, mauvais candidats et garde-fous multi-tenant pour un futur cache applicatif
- Alignement de `README.md`, `docs/SCALABILITY_ROADMAP.md` et `docs/QUARTERLY_ROADMAP.md`
- Mise a jour de la recommandation de session suivante pour statuer sur la cloture de la Phase 6

### Resultat

- La Phase 6 couvre maintenant aussi la trajectoire des lectures optimisees et de l'async processing sans introduire prematurement de complexite
- Le projet a un cadre plus complet pour arbitrer entre simplicite, coherence des donnees et performance future
- Validation non relancee: changements documentaires uniquement

### Prochaine session recommandee

- Statuer sur la cloture de la Phase 6
- Puis revenir sur les priorites produit/tech du trimestre en cours

---

## Session 51 - 2026-03-28

### Travail effectue

- Cloture formelle de la Phase 6 dans `docs/SCALABILITY_ROADMAP.md`
- Alignement du `README.md` pour refleter que la Phase 6 est terminee
- Mise a jour de `PROGRESS.md` pour basculer d'une logique de phase a une logique d'execution du trimestre courant

### Resultat

- Les six phases de la roadmap de scalabilite sont maintenant closes
- Le projet peut repartir sur une logique plus simple de priorites produit/tech guidees par `docs/QUARTERLY_ROADMAP.md` et `docs/MODULE_PRIORITIES.md`
- Validation non relancee: changements documentaires uniquement

### Prochaine session recommandee

- Revenir sur les priorites produit/tech du trimestre en cours
- Ouvrir seulement les chantiers qui servent les priorites 1 et 2

---

## Session 52 - 2026-03-28

### Travail effectue

- Alignement de `src/actions/sales.ts` sur le pattern commun `requireOrganizationModuleContext() + requireRole()`
- Remplacement de la sequence repetitive `requireSession + requireMembership + canPerformAction` sur les flux `getSales`, `getSale`, `createSale`, `updateSale` et `deleteSale`
- Alignement de `src/actions/profitability.ts` sur le meme socle d'acces, avec conservation du controle d'acces par ferme et du gate abonnement `PROFITABILITY`

### Resultat

- Les flux ventes et rentabilite utilisent maintenant le meme socle d'autorisation que les autres modules critiques
- Le coeur financier gagne en coherence et en lisibilite, sans changement des regles metier existantes
- Validation complete : `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer sur les flux critiques restants encore heterogenes, en priorite `form-drafts` ou certains parcours auth/support
- Ou bien attaquer une amelioration produit concrete sur `reports` ou `subscriptions / payments`

---

## Session 53 - 2026-03-28

### Travail effectue

- Durcissement de `src/actions/form-drafts.ts` pour verifier l'appartenance a `organizationId` quand un brouillon est rattache a une organisation
- Ajout d'un helper interne de validation d'organisation optionnelle pour les brouillons serveur
- Ajout de `tests/form-drafts.test.ts` pour couvrir l'auth, le refus d'organisation non accessible, le chargement et la suppression d'un brouillon

### Resultat

- Les brouillons serveur lies aux parcours critiques `create-batch` et `daily` ne peuvent plus etre associes a une organisation non accessible par l'utilisateur
- Le flux de drafts gagne un vrai garde-fou multi-tenant, avec non-regression automatisee
- Validation complete : `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Continuer sur les derniers flux atypiques d'auth/support
- Ou bien revenir sur une amelioration produit visible dans `reports` ou `subscriptions / payments`

---

## Session 54 - 2026-03-30

### Travail effectue

- Diagnostic et correction du flux email de confirmation via Resend : verification du domaine expéditeur, clarification de `MAIL_FROM` et documentation de la contrainte `@resend.dev`
- Clarification produit entre `Achats fournisseur` et `Depenses`, avec alignement des libelles UI
- Extension du dashboard pour integrer toutes les sorties d'argent :
  - `Charges globales = achats + autres depenses`
  - `Argent sorti`
  - `Reste a payer`
- Ajout du flux achats fournisseur :
  - enregistrement des paiements fournisseur
  - calcul du solde restant
  - envoi des lignes d'achat vers le stock
- Ajout de la creation d'articles de stock aliment et medicament depuis le module `Stock`
- Correctif sur la conversion `SAC -> kg` pour les achats d'aliment envoyes au stock
- Branchement automatique du stock sur les operations terrain :
  - la saisie journaliere diminue maintenant le stock aliment selectionne
  - vaccinations et traitements peuvent maintenant diminuer un stock medicament avec quantite explicite
  - les corrections de saisie resynchronisent aussi les mouvements de stock
- Ajout de la suppression securisee d'un stock vide et jamais utilise
- Nettoyage manuel d'une entree de stock orpheline en base suite a un achat supprime
- Ajout d'un outil admin V1 d'integrite du stock dans `/admin` :
  - detection des mouvements d'entree orphelins issus d'achats supprimes
  - correction automatique des cas surs
  - audit log des reparations admin
- Mise a jour du `README.md` pour couvrir les points de configuration email et les nouveaux parcours stock / achats

### Resultat

- Les inscriptions peuvent maintenant envoyer des emails de confirmation a de vrais destinataires quand le domaine Resend est correctement verifie
- Le dashboard financier raconte une histoire plus juste en integrant achats et depenses dans les KPI globaux
- Les achats fournisseur sont mieux relies au terrain :
  - paiement
  - entree en stock
  - dette fournisseur
- Le stock commence a vivre avec les operations reelles du lot au lieu de rester separe :
  - entree via achat
  - sortie via consommation d'aliment
  - sortie via vaccination / traitement
- Le projet dispose maintenant d'un premier filet de securite admin pour corriger les orphelins de stock sans passer par la base a la main
- Validation technique relancee a plusieurs reprises : `eslint` cible et `npm run build` passent sur les lots de changements livres

### Prochaine session recommandee

- Bloquer explicitement la suppression d'un achat s'il a deja alimente un stock, pour eviter de nouveaux orphelins a la source
- Etendre l'outil admin d'integrite stock avec une V2 :
  - recalcul de stock a partir des mouvements
  - correction manuelle assistee des cas non surs
- Revenir sur les flux produits restants encore ambigus entre terrain, stock et finance pour reduire la charge cognitive utilisateur

---

## Session 55 - 2026-03-30

### Travail effectue

- Audit complet de l'integration Firebase FCM :
  - Architecture validee (Admin SDK serveur, Web SDK client, service worker custom)
  - Identification de 2 blocages critiques production : variables Firebase Admin absentes et CRON_SECRET manquant
  - Identification de 4 problemes importants : schedule cron incorrect, NEXT_PUBLIC_VERCEL_ENV mort, sur-desactivation tokens, re-enregistrement a chaque mount
- Ajout des 3 variables Firebase Admin dans `.env.local` a partir du fichier de cle de service
- Application de la migration `20260330173000_add_user_push_devices` en base (`npx prisma migrate deploy`)
- Configuration des variables Firebase Admin sur Vercel (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
- Correction du mismatch d'hydration React sur `ConnectionBanner` : `useState(navigator.onLine)` remplace par `useState(null)` + lecture dans `useEffect`
- Correction du mismatch d'hydration React sur `InstallPrompt` : detection iOS deplacee de l'initialiseur `useState` vers `useEffect`
- Correction du mismatch d'hydration React sur `PushNotificationsPrompt` : `useState(Notification.permission)` remplace par `useState(null)` + guard `permission === null`

### Resultat

- Le token FCM est genere cote client, enregistre en base (`UserPushDevice`) et visible dans Prisma Studio
- Les 3 composants PWA sont desormais SSR-safe : aucun mismatch d'hydration sur `/dashboard`
- L'integration Firebase est prete pour la production : variables Admin configurees sur Vercel, cron autorise via CRON_SECRET
- `npm run lint`, `npm test` et `npm run build` passent

### Prochaine session recommandee

- Bloquer explicitement la suppression d'un achat s'il a deja alimente un stock
- Etendre l'outil admin d'integrite stock V2
- Corriger `NEXT_PUBLIC_VERCEL_ENV` (toujours undefined) dans `ServiceWorkerRegistration.tsx` si on veut fiabiliser la detection preview deployment
- Corriger le re-enregistrement du token FCM a chaque mount (bruit dans les audit logs)

---

## Schema Prisma - Modeles generes

| Domaine | Modeles |
|---|---|
| Referentiels globaux | Species, Breed, FeedType, MortalityReason |
| Auth (NextAuth v5) | Account, Session, VerificationToken |
| Utilisateurs | User, UserOrganization |
| Organisation | Organization |
| Infrastructure | Farm, Building |
| Lots | Batch |
| Saisie journaliere | DailyRecord, MortalityRecord |
| Production oeufs | EggProductionRecord |
| Pesees | WeightRecord |
| Sante | VaccinationPlan, VaccinationPlanItem, VaccinationRecord, TreatmentRecord |
| Stock aliments | FeedStock, FeedMovement |
| Stock medic. | MedicineStock, MedicineMovement |
| Commerce | Customer, Supplier, Sale, SaleItem, Purchase, PurchaseItem |
| Finances | Expense, ExpenseCategory, Invoice, Payment |
| RH | Employee |
| Systeme | Notification, AuditLog |
