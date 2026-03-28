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
