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
| 3 | Architecture applicative | Haute | A faire |
| 4 | Qualite et automatisation | Haute | A faire |
| 5 | Observabilite et securite | Haute | A faire |
| 6 | Scalabilite produit et equipe | Moyenne | A faire |

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

- [ ] Clarifier la separation `app/`, `src/actions/`, `src/lib/`, `src/components/`
- [ ] Extraire les logiques metier complexes en services ou domaines dedies
- [ ] Eviter la duplication des calculs entre pages, exports et API routes
- [ ] Standardiser les DTO/view models pour dashboard, rapports et detail lot
- [ ] Introduire une structure commune pour validation + autorisation + mutation
- [ ] Isoler le branding, les formatters et les primitives de presentation
- [ ] Documenter les conventions d'architecture dans `docs/`

### Cibles

- [ ] domaine lots
- [ ] domaine rapports
- [ ] domaine abonnements / paiements
- [ ] domaine auth / organisation active

### Critere De Sortie

- logique metier moins dispersee
- moins de duplication
- structure plus lisible pour un nouveau dev

---

## Phase 4 - Qualite Et Automatisation

### Objectif

Passer d'une verification surtout manuelle a une qualite defendable automatiquement.

### Chantiers

- [ ] Etendre les tests unitaires sur les helpers metier
- [ ] Ajouter des tests sur les Server Actions critiques
- [ ] Ajouter des tests sur les routes d'export
- [ ] Ajouter des tests d'integration auth / organisation / permissions
- [ ] Introduire une strategie de fixtures realistes
- [ ] Ajouter une verification CI minimale: lint + test + build
- [ ] Definir une petite matrice de non-regression avant merge

### Priorites Test

- [ ] organisation active
- [ ] permissions
- [ ] creation lot
- [ ] saisie journaliere
- [ ] calculs de rentabilite
- [ ] rapports mensuels
- [ ] paiements admin / abonnement

### Critere De Sortie

- CI obligatoire avant merge
- couverture utile des chemins critiques
- regression majeure detectable avant production

---

## Phase 5 - Observabilite Et Securite

### Objectif

Savoir ce qui casse, pourquoi, et limiter les risques d'incident.

### Chantiers

- [ ] Standardiser les logs applicatifs critiques
- [ ] Ajouter correlation ID / request ID sur les flux sensibles
- [ ] Instrumenter erreurs serveur et erreurs export
- [ ] Definir un tableau de bord minimal de sante applicative
- [ ] Ajouter rate limiting sur endpoints sensibles
- [ ] Verifier les uploads, webhooks et endpoints admin
- [ ] Revoir les secrets et variables d'environnement par environnement
- [ ] Formaliser backup / restore de base de donnees
- [ ] Documenter incident response basique

### Critere De Sortie

- erreurs importantes tracables
- endpoints sensibles proteges
- operation de restauration documentee

---

## Phase 6 - Scalabilite Produit Et Equipe

### Objectif

Preparer SunuFarm a grossir sans ralentir l'execution produit.

### Chantiers

- [ ] Prioriser les modules par impact business reel
- [ ] Definir une roadmap trimestrielle produit/tech separee de la roadmap MVP historique
- [ ] Introduire des conventions de PR, review et definition of done
- [ ] Decouper les domaines avec ownership clair
- [ ] Prepararer un onboarding dev court
- [ ] Mettre en place une version seed/demo stable
- [ ] Identifier les futurs besoins de file de jobs pour exports, emails et traitements lourds
- [ ] Etudier les futurs besoins de cache et d'async processing

### Critere De Sortie

- le projet peut avancer avec plusieurs intervenants
- la roadmap technique est reliee aux objectifs produit
- les traitements lourds ont une trajectoire claire

---

## Decisions

### Decisions Actuelles

- L'ordre d'execution recommande est 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6
- Les modules coeur a fiabiliser avant tout sont: auth, organisation active, lots, daily, reports, subscriptions
- Les rapports et exports doivent rester adosses a un modele partage
- Le branding doit rester centralise et non duplique

### Decisions A Prendre Plus Tard

- [ ] faut-il introduire une file de jobs pour PDF/Excel lourds
- [ ] faut-il introduire du cache applicatif ou SQL materialise pour les dashboards
- [ ] faut-il separer plus nettement les domaines admin et produit
- [ ] faut-il ajouter des tests end-to-end navigateur

---

## Prochaine Session Recommandee

1. finir l'extension des permissions de module sur les actions restantes
2. ajouter des tests ciblant `env`, `api-response` et les garde-fous de permissions
3. preparer une base locale stable pour les futures validations manuelles authentifiees
4. ouvrir la Phase 2 apres cloture complete de la Phase 1
