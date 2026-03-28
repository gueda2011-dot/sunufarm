# PROGRESS.md - SunuFarm

> Mis a jour apres chaque session de travail.
> Derniere mise a jour : 2026-03-28

---

## Etat global

| Etape | Description | Statut |
|---|---|---|
| Etape 1 | Analyse fonctionnelle structuree | Validee |
| Etape 2 | Architecture globale validee | Validee |
| Etape 3 | Modelisation donnees validee | Validee |
| Etape 4 | Roadmap MVP/V2/V3 | Validee |
| Etape 5 | Arborescence complete du projet | Validee |
| Etape 6 | Schema Prisma complet | Genere |
| Etape 7 | Seeds realistes (donnees senegalaises) | A faire |
| Etape 8 | formatters.ts, kpi.ts, permissions.ts, audit.ts, validators/ | A faire |
| Etape 9 | Modules backend (Server Actions) | A faire |
| Etape 10 | Pages et vues frontend | A faire |
| Etape 11 | Dashboards et KPI | A faire |
| Etape 12 | Rapports PDF et exports | A faire |
| Etape 13 | Refactoring, securite, optimisation | A faire |

---

## Pilotage scalabilite

- Roadmap de reference enregistree dans `docs/SCALABILITY_ROADMAP.md`
- Priorite active : Phase 3 - Architecture applicative
- Phase 0 terminee le 2026-03-28
- Phase 1 en cours : socle env + erreurs API + permissions serveur critiques
- Phase 2 terminee : audit Prisma + bornes sur les listes metier + index composes appliques

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
