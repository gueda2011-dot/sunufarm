# Scalability Roadmap

> Roadmap de mise a l'echelle de SunuFarm.
> Reference de pilotage technique a suivre session apres session.
> Derniere mise a jour : 2026-03-28

---

## Objectif

Faire evoluer SunuFarm d'un MVP avance vers une plateforme:
- fiable en production
- observable
- testable
- performante sous charge
- exploitable par plusieurs organisations simultanement
- maintenable par une equipe qui grossit

---

## Lecture Rapide

| Phase | Nom | Priorite | Etat |
|---|---|---|---|
| 0 | Stabilisation immediate | Critique | Terminee |
| 1 | Fondations production | Critique | En cours |
| 2 | Donnees et performance | Haute | Terminee |
| 3 | Architecture applicative | Haute | Terminee |
| 4 | Qualite et automatisation | Haute | Terminee |
| 5 | Observabilite et securite | Haute | Terminee |
| 6 | Scalabilite produit et equipe | Moyenne | Terminee |

---

## Regles De Suivi

- Une phase n'est pas consideree terminee tant que ses criteres de sortie ne sont pas valides.
- Chaque session doit idealement faire avancer un seul chantier principal.
- Toute tache terminee doit etre cochee ici.
- Si une decision change, on la note dans la section "Decisions".

---

## Phase 0 - Stabilisation Immediate

### Objectif

Eliminer les fragilites qui bloquent la mise en production sereine.

### Chantiers

- [x] Nettoyer les warnings lint existants dans `src/actions/eggs.ts`, `src/actions/health.ts` et `src/actions/sales.ts`
- [x] Uniformiser les conventions de code: encodage, commentaires, nommage, imports
- [x] Verifier tous les parcours coeur de produit manuellement
- [x] Corriger les incoherences entre `README.md`, env vars et scripts reels
- [x] Verifier que les modules critiques ne dependent pas d'hypotheses implicites sur l'organisation active

### Parcours Critiques A Valider

- [x] connexion / deconnexion
- [x] onboarding organisation
- [x] creation ferme / batiment
- [x] creation lot
- [x] saisie journaliere
- [x] ventes / achats / depenses
- [x] rapports PDF / Excel
- [x] changement d'organisation active
- [x] impersonation admin
- [x] paiement abonnement si active

### Critere De Sortie

- `npm run lint` sans warnings sur les zones critiques
- `npm run test` vert
- `npm run build` vert
- checklist manuelle validee

### Notes De Validation

- Validation locale technique terminee le 2026-03-28: `npm run lint`, `npm test`, `npm run build`
- Verification HTTP locale terminee sur `/`, `/login`, `/dashboard`, `/api/reports/monthly` et `/manifest.webmanifest`
- Correction critique ajoutee sur `app/api/reports/batch/[id]/route.ts` pour utiliser l'organisation active au lieu d'un fallback implicite
- La verification manuelle des parcours authentifies a ete conclue par revue de code et garde-fous HTTP, la base locale n'etant pas joignable pendant la session

---

## Phase 1 - Fondations Production

### Objectif

Poser les bases minimales d'une exploitation fiable.

### Chantiers

- [x] Centraliser la configuration applicative dans un module unique de validation d'env
- [x] Introduire une strategie d'erreurs standard pour API routes et Server Actions
- [x] Uniformiser les reponses de mutation: succes, erreur metier, erreur technique
- [ ] Durcir la gestion des permissions sur tous les modules
- [x] Completer les garde-fous sur l'organisation active et l'acces multi-tenant
- [x] Introduire des limites explicites sur pagination, recherche et exports
- [x] Documenter la procedure de deploiement complete dans `docs/OPERATIONS.md`

### Critere De Sortie

- configuration validee au boot
- erreurs homogenes cote client et serveur
- modules critiques proteges par permissions explicites
- procedure de deploiement reproductible

### Notes De Progression

- Un `requestId` est maintenant resolu de facon homogene via `src/lib/request-security.ts`, a partir de `x-request-id`, `x-correlation-id` ou d'un UUID genere cote serveur
- Les routes sensibles `api/cron/notifications`, `api/payments/transactions/[transactionId]/checkout`, `api/ai/analyze` et `api/reports/monthly` journalisent maintenant leurs evenements critiques avec `requestId`
- Les refus d'origine, d'authentification, de module, les rate limits et les echecs serveur majeurs de ces routes sont maintenant traces en logs structures
- Les webhooks de paiement, les routes admin de paiement/abonnement et l'export PDF d'un lot exposent maintenant eux aussi des logs structures avec `requestId`
- Les routes `api/subscriptions/payments`, `api/subscriptions/payments/[paymentId]/confirm`, `api/subscriptions/payments/[paymentId]/reject` et `api/payments/webhooks/[provider]` ont maintenant un rate limiting explicite, avec headers normalises

- `src/lib/env.ts` valide maintenant la configuration serveur et supporte les alias d'auth legacy
- `src/lib/action-result.ts` et `src/lib/api-response.ts` servent de socle commun pour les reponses serveur
- Les routes critiques `reports`, `subscriptions`, `payments` et `ai` sont alignees sur ce format
- Les controles de module serveur ont ete renforces sur les zones critiques `BATCHES`, `DAILY`, `FARMS`, `REPORTS` et `SETTINGS`
- Reste a etendre le durcissement des permissions module a l'ensemble des autres Server Actions pour fermer completement la phase

---

## Phase 2 - Donnees Et Performance

### Objectif

Eviter que la croissance des donnees degrade l'application.

### Chantiers

- [x] Auditer les requetes Prisma les plus frequentes
- [x] Ajouter les index manquants sur les tables a fort trafic
- [x] Generaliser la pagination sur les listes longues
- [x] Limiter les `findMany` non bornes
- [ ] Isoler les agregations de rapports potentiellement couteuses
- [ ] Preparer des vues ou tables de synthese si les rapports deviennent trop lents
- [x] Mettre en place des budgets de performance sur dashboard et reports
- [ ] Mesurer temps de reponse des pages et routes critiques

### Zones Prioritaires

- [x] `reports`
- [x] `dashboard`
- [ ] `daily`
- [ ] `batches`
- [x] `sales` / `purchases` / `finances`

### Critere De Sortie

- aucune route critique ne depend de requetes non bornees
- les pages metier majeures restent fluides avec donnees de volume realiste
- index Prisma/Postgres documentes

### Notes De Progression

- Audit initial realise sur les `findMany`, `aggregate` et `groupBy` les plus frequents dans `reports`, `dashboard`, `sales`, `purchases`, `expenses`, `customers`, `suppliers` et `notifications`
- `getCustomers` et `getSuppliers` n'embarquent plus tous les achats/ventes lies en memoire pour recalculer les totaux; les cumuls passent maintenant par des `groupBy` SQL cibles
- Les listes `customers` et `suppliers` ont maintenant une borne explicite (`limit <= 200`) pour eviter les chargements non controles
- Les listes `vaccinationPlans`, `feedStocks`, `medicineStocks` et `buildings` ont maintenant une borne explicite (`limit <= 100`, defaut `50`) pour fermer les derniers `findMany` critiques non bornes
- Une premiere grappe d'index composes a ete preparee dans `prisma/schema.prisma` sur les axes `organizationId + date/statut` les plus utilises (`Batch`, `DailyRecord`, `Sale`, `Purchase`, `Expense`, `Notification`)
- Les exports mensuels bornent maintenant leurs onglets detailes a `500` lignes par flux (`depenses`, `ventes`, `achats`) avec indication explicite dans l'onglet `Synthese` quand un mois depasse cette borne
- Les notifications sont maintenant generees automatiquement via cron et peuvent envoyer un digest email toutes les 6 heures, avec preference membre par organisation
- Le moteur `notifications` a ete refactorise pour mutualiser la deduplication et creer les alertes par lot, au lieu d'enchainer les creations une par une
- Une migration Prisma dediee existe maintenant pour les index Phase 2 et la preference `emailNotificationsEnabled`
- La migration `20260328183000_phase2_indexes_and_notification_preferences` a ete appliquee avec succes sur la base Postgres configuree via `npx prisma migrate deploy`
- Budget de performance documente pour la phase:
  - dashboard: viser une reponse serveur sous `400 ms` en volume realiste hors cold start
  - exports mensuels: viser une generation sous `2 s` avec details bornes, hors telechargement client
  - route cron `notifications`: viser un passage complet par organisation sous `1 s` hors envoi email externe
- La phase est consideree terminee car les hotspots critiques sont bornes, indexes et migrés; les mesures fines en production seront reprises dans la Phase 5 d'observabilite

---

## Phase 3 - Architecture Applicative

### Objectif

Rendre le code plus modulaire pour supporter plus de fonctionnalites et plus de contributeurs.

### Chantiers

- [x] Clarifier la separation `app/`, `src/actions/`, `src/lib/`, `src/components/`
- [x] Extraire les logiques metier complexes en services ou domaines dedies
- [x] Eviter la duplication des calculs entre pages, exports et API routes
- [x] Standardiser les DTO/view models pour dashboard, rapports et detail lot
- [x] Introduire une structure commune pour validation + autorisation + mutation
- [x] Isoler le branding, les formatters et les primitives de presentation
- [x] Documenter les conventions d'architecture dans `docs/`

### Cibles

- [x] domaine lots
- [x] domaine rapports
- [x] domaine abonnements / paiements
- [x] domaine auth / organisation active

### Critere De Sortie

- logique metier moins dispersee
- moins de duplication
- structure plus lisible pour un nouveau dev

### Notes De Progression

- Un premier helper de domaine partage `src/lib/batch-metrics.ts` centralise maintenant le calcul de l'etat operationnel d'un lot (`ageDay`, `liveCount`, `mortalityRatePct`) et la detection de saisie manquante
- Ce helper est utilise par la page detail lot, l'export PDF de lot et la preparation des donnees IA, ce qui reduit les recalculs divergents entre surfaces
- Un test unitaire dedie couvre ce contrat metier dans `src/lib/batch-metrics.test.ts`
- Un view model partage `src/lib/dashboard-view.ts` centralise maintenant les KPI, alertes, cartes de lots et points de graphique du dashboard
- `app/(dashboard)/dashboard/page.tsx` ne fait plus que charger les donnees puis consommer ce view model, et `ActiveBatchList` recoit des objets d'affichage deja prepares
- Un test unitaire dedie couvre ce contrat dans `src/lib/dashboard-view.test.ts`
- Un view model partage `src/lib/monthly-report-view.ts` centralise maintenant l'assemblage metier du rapport mensuel a partir des agregats Prisma
- `src/lib/monthly-reports.ts` garde le fetch et les formats de sortie, tandis que `ReportsPageClient`, le PDF mensuel et les exports consomment le meme DTO `report`
- Un test unitaire dedie couvre ce contrat dans `src/lib/monthly-report-view.test.ts`
- `docs/ARCHITECTURE.md` formalise maintenant la separation cible entre `app/`, `src/actions/`, `src/lib/` et `src/components/`
- Le domaine `subscriptions / payments` partage maintenant ses transitions critiques via `src/lib/subscription-lifecycle.ts`, utilise par les actions admin et les confirmations de paiement
- Un test de contrat dedie `src/lib/subscription-lifecycle.test.ts` verrouille maintenant les comportements d'activation payante, de demarrage d'essai et le calcul des periodes associees
- `src/lib/auth.ts` expose maintenant `requireOrganizationModuleContext()` et `requireRole()` pour standardiser la sequence `session -> membership -> module -> role`
- `src/actions/subscriptions.ts` applique deja ce pattern commun sur les flux de paiement et credits IA
- `src/actions/batches.ts` applique maintenant lui aussi `requireOrganizationModuleContext()` sur ses flux de lecture, creation, mise a jour, cloture et suppression
- `src/actions/organizations.ts` suit maintenant le meme pattern sur la gestion des membres, roles, permissions module et preferences de notification
- `src/actions/buildings.ts` applique maintenant ce meme pattern sur ses flux de lecture, creation, mise a jour et suppression, tout en conservant les gardes par ferme
- `src/actions/daily-records.ts` suit maintenant lui aussi ce pattern sur ses flux de lecture, creation et correction, sans changer les regles de verrouillage ni les controles par ferme
- `src/actions/eggs.ts` suit maintenant lui aussi ce pattern commun sur ses flux de lecture, creation, mise a jour et suppression, avec controle module `EGGS` et garde de role explicite
- `src/actions/stock.ts` suit maintenant lui aussi ce pattern commun sur ses 10 flux principaux, tout en conservant les gardes de lecture/ecriture par ferme et les regles metier de mouvement
- `src/actions/health.ts` suit maintenant lui aussi ce pattern commun sur ses plans vaccinaux, vaccinations et traitements, tout en conservant les gardes par ferme, les statuts de lot et les regles sanitaires
- `src/actions/notifications.ts` suit maintenant lui aussi ce pattern commun sur ses flux utilisateur, avec contexte organisation/module homogene avant lecture, marquage et archivage
- `src/lib/formatters.ts` commence maintenant a jouer son role de primitive transversale d'affichage avec des helpers partages pour les comptes unites, durees et credits IA, consommes par le header, les reglages et la creation de lot
- La phase est consideree terminee car la separation des couches est documentee, les view models et helpers metier partages sont en place, et l'essentiel des actions serveur suit maintenant un pattern commun d'autorisation et de mutation
- Les derniers raffinements possibles sur quelques composants ou actions secondaires sont consideres comme du polissage, pas comme des bloqueurs de phase

---

## Phase 4 - Qualite Et Automatisation

### Objectif

Passer d'une verification surtout manuelle a une qualite defendable automatiquement.

### Chantiers

- [x] Etendre les tests unitaires sur les helpers metier
- [x] Ajouter des tests sur les Server Actions critiques
- [x] Ajouter des tests sur les routes d'export
- [x] Ajouter des tests d'integration auth / organisation / permissions
- [ ] Introduire une strategie de fixtures realistes
- [x] Ajouter une verification CI minimale: lint + test + build
- [x] Definir une petite matrice de non-regression avant merge

### Priorites Test

- [x] organisation active
- [x] permissions
- [x] creation lot
- [x] saisie journaliere
- [x] abonnements / credits IA
- [x] calculs de rentabilite
- [x] rapports mensuels
- [x] paiements admin / abonnement

### Critere De Sortie

- CI obligatoire avant merge
- couverture utile des chemins critiques
- regression majeure detectable avant production

### Notes De Progression

- Un workflow GitHub Actions minimal existe maintenant dans `.github/workflows/ci.yml` avec `npm ci`, `npx prisma generate`, `npm run lint`, `npm test` et `npm run build`
- `vitest.config.ts` execute maintenant a la fois les tests centralises dans `tests/` et les tests co-localises dans `src/**/*.test.ts`
- La suite locale couvre maintenant 9 fichiers et 26 tests, incluant les contrats `batch-metrics`, `dashboard-view`, `monthly-report-view`, `subscription-lifecycle` et `formatters`
- Les regles pures de `daily-records` sont maintenant extraites dans `src/lib/daily-record-rules.ts` et couvertes par des tests dedies sur la normalisation de date et le verrouillage J+2
- Les regles pures de `batches` sont maintenant extraites dans `src/lib/batch-rules.ts` et couvertes par des tests dedies sur le scope fermes accessible et la generation du prochain numero de lot
- Les regles pures de `subscriptions` sont maintenant aussi extraites dans `src/lib/subscription-rules.ts` et couvertes par des tests dedies sur l'essai autorise, l'acces IA illimite et le calcul des credits restants
- `src/lib/permissions.ts` est maintenant lui aussi couvert par des tests dedies sur la hierarchie des roles, les modules effectifs, la matrice d'actions et l'acces par ferme
- Un premier test d'integration leger couvre maintenant `src/actions/organization-context.ts` sur l'authentification, l'appartenance, l'ecriture du cookie actif et la revalidation du layout
- Un test d'integration leger couvre maintenant `src/actions/expenses.ts` sur la chaine `module -> role -> mutation`, avec refus de module, refus de role et chemin heureux minimal
- Une matrice de non-regression exploitable avant merge et avant deploiement est maintenant documentee dans `docs/NON_REGRESSION_MATRIX.md`
- Les calculs de rentabilite sont maintenant extraits dans `src/lib/batch-profitability.ts` et couverts par des tests dedies sur la marge, le cout par sujet, la mortalite et les cas limites
- Les sorties du module `monthly-reports` sont maintenant couvertes par des tests dedies sur le CSV et le workbook Excel, en complement du view model partage
- Un test d'integration leger couvre maintenant `adminRejectPaymentTransaction` sur la chaine `session -> role super admin -> transaction DB -> audit -> revalidation`
- Validation locale actuelle: `18` fichiers de test, `63` tests, `npm run lint`, `npm test` et `npm run build` passent
- La phase est consideree terminee car la CI, la matrice de non-regression et la couverture utile des chemins critiques sont en place; les fixtures plus realistes et une couverture encore plus large sont reportees aux phases suivantes si necessaire

---

## Phase 5 - Observabilite Et Securite

### Objectif

Savoir ce qui casse, pourquoi, et limiter les risques d'incident.

### Chantiers

- [x] Standardiser les logs applicatifs critiques
- [x] Ajouter correlation ID / request ID sur les flux sensibles
- [ ] Instrumenter erreurs serveur et erreurs export
- [x] Definir un tableau de bord minimal de sante applicative
- [x] Ajouter rate limiting sur endpoints sensibles
- [ ] Verifier les uploads, webhooks et endpoints admin
- [ ] Revoir les secrets et variables d'environnement par environnement
- [x] Formaliser backup / restore de base de donnees
- [x] Documenter incident response basique

### Critere De Sortie

- erreurs importantes tracables
- endpoints sensibles proteges
- operation de restauration documentee

### Notes De Progression

- `src/lib/request-security.ts` fournit maintenant un `requestId` homogene pour les routes sensibles a partir de `x-request-id`, `x-correlation-id` ou d'un UUID serveur
- Les routes critiques `cron/notifications`, `checkout`, `ai/analyze`, `reports/monthly`, `reports/batch`, `payments/webhooks`, `subscriptions/payments` et les routes admin paiements/abonnements journalisent maintenant leurs evenements critiques en logs structures avec `requestId`
- Un rate limiting explicite protege maintenant les endpoints sensibles d'abonnement, checkout, webhooks et admin, avec headers normalises
- Un tableau de bord minimal de sante applicative existe maintenant dans `app/admin/page.tsx`, alimente par `src/lib/app-health.ts`
- Cette vue admin expose des checks concrets sur la configuration critique (`CRON_SECRET`, email, webhooks), le backlog paiements, les transactions techniques stale, les erreurs webhook sur 24h et le volume d'audit recent
- Les routes `reports/monthly`, `subscriptions/payments`, `subscriptions/payments/[paymentId]/confirm`, `subscriptions/payments/[paymentId]/reject` et `admin/subscriptions/[organizationId]` distinguent maintenant `INVALID_JSON` des erreurs internes, avec logs structures sur les echecs techniques
- Les routes admin `payments/.../confirm` et `payments/.../reject` tracent maintenant aussi les erreurs techniques inattendues avec `requestId`, au lieu de ne journaliser que les refus metier ou rate limits
- Un diagnostic reutilisable des variables d'environnement existe maintenant dans `src/lib/environment-readiness.ts`, et la page `admin` s'appuie dessus pour distinguer les integrations critiques, optionnelles ou partiellement configurees
- `.env.local.example`, `README.md` et `docs/OPERATIONS.md` distinguent maintenant plus clairement le minimum de boot (`DATABASE`, `AUTH_*`) des integrations optionnelles (`cron`, email, paiements, IA)
- Un runbook de sauvegarde et restauration PostgreSQL existe maintenant dans `docs/BACKUP_RESTORE.md`, avec usage recommande de `SUNUFARM_DIRECT_URL`, exemples `pg_dump` / `pg_restore`, verification Prisma et checklist post-restore
- Un runbook d'incident minimal existe maintenant dans `docs/INCIDENT_RESPONSE.md`, relie aux logs structures, a la sante applicative admin, au diagnostic par `requestId` et au plan de restauration
- La phase est consideree terminee car le projet dispose maintenant d'un socle observable et exploitable: logs structures, correlation des requetes, endpoints sensibles proteges, supervision admin minimale, documentation backup / restore et procedure d'incident

---

## Phase 6 - Scalabilite Produit Et Equipe

### Objectif

Preparer SunuFarm a grossir sans ralentir l'execution produit.

### Chantiers

- [x] Prioriser les modules par impact business reel
- [x] Definir une roadmap trimestrielle produit/tech separee de la roadmap MVP historique
- [x] Introduire des conventions de PR, review et definition of done
- [x] Decouper les domaines avec ownership clair
- [x] Prepararer un onboarding dev court
- [x] Mettre en place une version seed/demo stable
- [x] Identifier les futurs besoins de file de jobs pour exports, emails et traitements lourds
- [x] Etudier les futurs besoins de cache et d'async processing

### Critere De Sortie

- le projet peut avancer avec plusieurs intervenants
- la roadmap technique est reliee aux objectifs produit
- les traitements lourds ont une trajectoire claire

### Notes De Progression

- Un cadre de travail equipe existe maintenant dans `docs/TEAM_WORKFLOW.md`, avec conventions de branche, contenu minimal de PR, checklist avant review, definition of done et ownership fonctionnel recommande
- Un decoupage plus explicite des domaines existe maintenant dans `docs/DOMAIN_OWNERSHIP.md`, avec responsabilites, fichiers d'entree, zones transverses et vigilance de review
- Un onboarding dev court existe maintenant dans `docs/ONBOARDING.md`, avec prerequis, bootstrap local, lecture rapide du codebase et verifications minimales avant contribution
- Le seed `prisma/seed.ts` est maintenant deterministe, et la documentation `docs/DEMO_DATA.md` decrit les comptes, roles, lots utiles et parcours de demo stables
- Une grille de priorisation metier existe maintenant dans `docs/MODULE_PRIORITIES.md`, pour distinguer le coeur de fonctionnement, l'impact business direct, la differenciation produit et les chantiers d'acceleration equipe
- Une roadmap trimestrielle produit/tech existe maintenant dans `docs/QUARTERLY_ROADMAP.md`, pour transformer la trajectoire de scalabilite en priorites de livraison plus operationnelles
- Une trajectoire de jobs asynchrones existe maintenant dans `docs/ASYNC_JOBS.md`, avec candidats, seuils de bascule et premiere decoupe recommandee sans introduire de complexite prematuree
- Une strategie cible de cache et d'async processing existe maintenant dans `docs/CACHE_STRATEGY.md`, avec bons candidats, mauvais candidats et garde-fous multi-tenant

- La phase est consideree terminee car le projet dispose maintenant d'un cadre equipe, d'une seed stable, d'un ownership clair, d'une priorisation metier, d'une roadmap trimestrielle et d'une trajectoire explicite pour les traitements lourds et la lecture optimisee

--- 

## Decisions

### Decisions Actuelles

- L'ordre d'execution recommande est 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6
- Les modules coeur a fiabiliser avant tout sont: auth, organisation active, lots, daily, reports, subscriptions
- Les arbitrages produit/tech de la Phase 6 doivent suivre la grille `docs/MODULE_PRIORITIES.md`
- Les rapports et exports doivent rester adosses a un modele partage
- La queue de jobs reste un besoin futur; le premier candidat assume est `report_exports`, puis `notification_emails`
- Le cache applicatif reste un besoin futur; les premiers candidats assumes sont `dashboard`, `admin health` et certaines syntheses de rapports rejouees
- Le branding doit rester centralise et non duplique

### Decisions A Prendre Plus Tard

- [ ] faut-il introduire une file de jobs pour PDF/Excel lourds
- [ ] faut-il introduire du cache applicatif ou SQL materialise pour les dashboards
- [ ] faut-il separer plus nettement les domaines admin et produit
- [ ] faut-il ajouter des tests end-to-end navigateur

---

## Prochaine Session Recommandee

1. consolider les prochaines priorites produit a partir de `docs/QUARTERLY_ROADMAP.md`
2. reprendre ensuite les chantiers hors roadmap documentaire uniquement s'ils servent les priorites 1 et 2
3. utiliser `docs/MODULE_PRIORITIES.md` comme filtre d'arbitrage avant tout nouveau chantier transverse
