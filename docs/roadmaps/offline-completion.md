# Offline Completion Roadmap

## 1. Objective

Definir le perimetre offline officiel et la feuille de route pour rendre l'usage offline fiable, comprehensible et maintenable.

Objectif produit reel :

- ne pas "rendre tout le produit offline"
- permettre a un elevage de continuer ses operations quotidiennes sans reseau
- resynchroniser proprement des que le reseau revient
- distinguer clairement ce qui est deja disponible, ce qui est partiel et ce qui reste volontairement online-only

Objectif technique reel :

- industrialiser le socle offline deja present
- clarifier les contrats de lecture locale, creation offline, replay et conflits
- etendre ensuite le perimetre par vagues controlees sans casser l'existant

---

## 2. Product Positioning

### Level 1 — Critical field offline

Perimetre promis offline pour le terrain :

- saisie journaliere
- soins et vaccination
- depenses terrain
- ventes terrain
- mouvements de stock
- production d'oeufs
- achats
- lecture locale recente des lots, fermes, clients, fournisseurs et transactions utiles

Definition :

- l'utilisateur peut continuer a travailler sans reseau
- les mutations sont stockees localement
- la reprise reseau relance la synchronisation
- l'UX doit afficher clairement l'etat offline et la file d'attente locale

### Level 2 — Local offline consultation

Perimetre consultation utile mais non critique :

- listes recentes deja chargees sur l'appareil
- detail local simplifie d'un lot
- references necessaires aux formulaires
- consultation recente des ventes et achats

Definition :

- lecture locale basee sur le cache et/ou les repositories IndexedDB
- precision potentiellement inferieure a l'online
- donnees susceptibles d'etre stale si le bootstrap ou le refresh n'ont pas ete faits

### Level 3 — Online only

Fonctions explicitement non promises offline a ce stade :

- exports PDF
- rapports avances
- analytics globaux
- business avance
- paiement et pricing transactionnel
- administration
- team management complet
- settings avances

Definition :

- ces surfaces peuvent afficher un shell ou une page cachee
- mais elles ne doivent pas etre revendiquees comme "offline-ready"

---

## 3. Current Foundation

Socle offline effectivement present dans le code :

- cache local IndexedDB et ressources TTL dans [offline-cache.ts](/C:/Users/pcpro/sunufarm/src/lib/offline-cache.ts)
- session offline locale dans [offline-session.ts](/C:/Users/pcpro/sunufarm/src/lib/offline-session.ts)
- outbox multi-modules dans [offline-mutation-outbox.ts](/C:/Users/pcpro/sunufarm/src/lib/offline-mutation-outbox.ts)
- moteur de replay/sync dans [engine.ts](/C:/Users/pcpro/sunufarm/src/lib/offline/sync/engine.ts)
- bootstrap appareil offline dans [bootstrap.ts](/C:/Users/pcpro/sunufarm/src/lib/offline/bootstrap.ts)
- service worker applicatif dans [sw.js](/C:/Users/pcpro/sunufarm/public/sw.js)
- hub de supervision offline dans [offline/page.tsx](/C:/Users/pcpro/sunufarm/app/offline/page.tsx)
- bootstrap automatique de session/appareil dans [OfflineSessionBootstrap.tsx](/C:/Users/pcpro/sunufarm/src/components/pwa/OfflineSessionBootstrap.tsx)
- banniere globale de sync dans [GlobalSyncBanner.tsx](/C:/Users/pcpro/sunufarm/src/components/layout/GlobalSyncBanner.tsx)

Constats structurants :

- le socle est deja multi-module
- l'outbox existe deja en production de code, ce n'est pas un prototype
- plusieurs modules metier utilisent deja `createClientMutationId` et `enqueueOffline...`
- le moteur de sync sait deja marquer `pending`, `failed`, `conflict`, `synced`
- la notion `syncing` n'existe pas encore dans le type de statut persiste, seulement comme etat UI temporaire

Etat des TTL effectivement definis dans [offline-ttl.ts](/C:/Users/pcpro/sunufarm/src/lib/offline-ttl.ts) :

- `references` : 24 h
- `records` : 30 min
- `session` : 12 h
- `dashboard` : 10 min

Etat des cles de cache explicitement definies dans [offline-keys.ts](/C:/Users/pcpro/sunufarm/src/lib/offline-keys.ts) :

- `daily:*`
- `health:*`
- `stock:*`
- `sales:new:*`
- `eggs:*`
- `purchases:*`

Conclusion :

- la fondation est solide pour un MVP offline terrain
- le perimetre n'est pas encore formalise comme promesse produit officielle
- la couverture est heterogene selon les modules

---

## 4. Current Offline Coverage Audit

### Daily

Ce qui existe :

- lecture locale des lots, stocks aliments et saisies recentes via `useOfflineData`
- creation offline avec `enqueueOfflineDailyRecord`
- replay dedie via route [daily-sync/route.ts](/C:/Users/pcpro/sunufarm/app/api/offline/daily-sync/route.ts)
- `clientMutationId` present cote UI et cote backend
- `OfflineSyncCard` et `useOfflineSyncStatus({ scope: "daily" })`

Ce qui manque :

- update/delete offline explicites
- detail de conflit metier lisible pour l'utilisateur final
- contrat UX standardise sur stale vs fresh

Limites :

- fort couplage avec les mouvements d'aliment
- risque eleve de divergence entre saisie locale et stock reel si le mapping feedStockId devient stale

Risque :

- module sensible car il alimente a la fois la lecture lot et la logique stock

### Health

Ce qui existe :

- lecture locale des vaccinations, traitements, lots, stocks medicaments, plans vaccinaux
- creation offline vaccination et traitement
- `clientMutationId` present
- `OfflineSyncCard` et `useOfflineSyncStatus({ scope: "health" })`

Ce qui manque :

- update/delete offline
- resolution de conflit metier guidee
- validation locale plus explicite des dependances de stock medicament

Limites :

- la lecture locale existe sur les ecrans sante, mais pas encore comme contrat produit global "detail lot offline complet"

### Stock

Ce qui existe :

- lecture locale des fermes, lots, stocks et mouvements
- creation offline de mouvements aliment et medicament
- `clientMutationId` present
- `OfflineSyncCard` et `useOfflineSyncStatus({ scope: "stock" })`
- deep-link par onglet possible sur la page stock

Ce qui manque :

- create/update/delete offline des stocks de reference eux-memes
- reconciliation metier explicite en cas de conflit
- garde-fous UX plus clairs sur la fiabilite du stock local

Limites :

- les mouvements sont offline-ready, mais le stock est une entite fortement sensible aux conflits

Risque :

- c'est le module le plus risque pour la confiance utilisateur si des divergences apparaissent

### Eggs

Ce qui existe :

- lecture locale des batches pondeuse, enregistrements et metriques
- creation offline d'enregistrement oeufs
- `clientMutationId` present
- `OfflineSyncCard` et `useOfflineSyncStatus({ scope: "eggs" })`

Ce qui manque :

- update/delete offline
- gestion de conflit metier specifique aux enregistrements deja saisis sur la meme date

### Expenses

Ce qui existe :

- creation offline de depense via `enqueueOfflineExpense`
- `clientMutationId` present cote UI et backend
- `OfflineSyncCard` dans le formulaire

Ce qui manque :

- pas de liste offline de depenses explicitement instrumentee comme module autonome
- pas de cache/reference dedie offline pour la surface finances
- pas de lecture offline claire des depenses recentes

Limites :

- module aujourd'hui plutot "write offline only"

### Sales

Ce qui existe :

- `sales/new` dispose de lecture locale des clients et lots
- creation offline d'une vente via `enqueueOfflineSale`
- `clientMutationId` present
- `OfflineSyncCard` et `useOfflineSyncStatus({ scope: "sales" })`

Ce qui manque :

- liste des ventes non instrumentee offline
- detail de vente non instrumente offline
- UX de consultation recente des ventes encore absente du contrat produit

Limites :

- couverture tres bonne pour la creation, faible pour la consultation

### Purchases

Ce qui existe :

- lecture locale de la liste des achats
- lecture locale des fournisseurs et stocks de reference utiles au formulaire
- creation offline d'un achat
- `clientMutationId` present
- `OfflineSyncCard` et `useOfflineSyncStatus({ scope: "purchases" })`

Ce qui manque :

- detail achat offline
- update/delete offline
- gestion de conflit metier guidee si l'achat a deja ete rejoue

### Batches

Ce qui existe :

- references `batches` deja bootstrappees et repositories remplis
- lecture locale indirecte dans `daily`, `stock`, `sales/new`, `eggs`, `health`

Ce qui manque :

- pas de liste lots offline officiellement exposee
- pas de page `batches` instrumentee par `useOfflineData`
- pas de detail lot offline comme contrat produit

Limites :

- la data existe localement, mais pas l'experience produit correspondante

### Farms

Ce qui existe :

- references `farms` deja bootstrappees
- lecture locale indirecte dans le module stock

Ce qui manque :

- page fermes non instrumentee offline
- pas de lecture locale formelle sur `/farms`

### Customers

Ce qui existe :

- bootstrap clients effectue
- lecture locale sur `sales/new`

Ce qui manque :

- page clients non instrumentee offline
- pas de contrat de consultation locale autonome

### Suppliers

Ce qui existe :

- bootstrap fournisseurs effectue
- lecture locale sur `purchases`

Ce qui manque :

- page fournisseurs non instrumentee offline

### Reports

Ce qui existe :

- service worker peut servir un shell de page si deja charge

Ce qui manque :

- aucun contrat de lecture offline metier
- aucun cache de rapports structure
- aucune promesse export offline

Conclusion :

- doit rester `online only` a ce stade

### Business

Ce qui existe :

- shell applicatif en cache potentiel

Ce qui manque :

- aucune instrumentation offline metier
- aucune agregations locales definies

Conclusion :

- non prioritaire, `online only`

### Team

Ce qui existe :

- rien de specifique offline

Ce qui manque :

- lecture locale de membres
- mutations offline
- UX de conflit

Conclusion :

- non prioritaire, `online only`

### Settings

Ce qui existe :

- rien de specifique offline

Ce qui manque :

- contrat UX pour actions indisponibles hors ligne

Conclusion :

- majoritairement `online only`

### Audit Summary

Deja presents :

- outbox multi-modules
- replay/sync
- bootstrap references
- lecture offline partielle sur les modules terrain
- create offline sur les operations critiques principales
- `clientMutationId` deja bien generalise sur les mutations terrain

Partiels :

- `expenses` surtout creation offline, pas vraie consultation offline
- `sales` fort sur creation, faible sur consultation
- `batches`, `farms`, `customers`, `suppliers` : donnees locales presentes, UX offline absente ou implicite

Non prioritaires actuellement :

- `reports`
- `business`
- `team`
- `settings` avances

Gaps majeurs :

- contrat UX offline heterogene selon les modules
- conflits encore surtout techniques
- divergence possible entre cache de lecture et outbox de mutation
- `expenses`, `batches`, `customers`, `suppliers`, `sales list` : donnees locales presentes mais non formalisees comme contrat produit

---

## 5. Capability Matrix

| Module | Ecran | readOffline | createOffline | updateOffline | deleteOffline | requiresBootstrap | localDataSource | syncEndpoint | conflictStrategy | offlineUxNotes | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| daily | `/daily` | Yes | Yes | No | No | Yes | `useOfflineData` + `dailyRepository` + resource cache | `/api/offline/daily-sync` | Sensitive append-only with stock dependency | OfflineSyncCard, sync status, fallback local present | Partial |
| health | `/health` | Yes | No | No | No | Yes | resource cache + health repositories | Server Actions replay | Upsert simple with medicine dependency | Read fallback visible, no write UI on this page | Partial |
| health | `batch detail -> HealthSection` | Partial | Yes | No | No | Yes | local queue + health repositories | Server Actions replay | Sensitive due to medicine stock dependency | Good offline write UX, conflicts still technical | Partial |
| stock | `/stock` | Yes | No | No | No | Yes | `useOfflineData` + stock repositories + cache | Server Actions replay for movements only | High-risk stock reconciliation | Good fallback and sync UI, stock reference edits not offline | Partial |
| stock | `stock movement panel` | Partial | Yes | No | No | Yes | outbox + stockMovementRepository | Server Actions replay | High-risk stock reconciliation | Good write UX, conflict resolution not productized | Partial |
| sales | `/sales/new` | Yes | Yes | No | No | Yes | `useOfflineData` for customers + batches, outbox for create | Server Actions replay | Append-only with duplicate risk | Good create UX, no post-sync review screen | Partial |
| sales | `/sales` list | No | No | No | No | No | None | None | None defined | No offline contract today | To complete (P2) |
| eggs | `/eggs` | Yes | Yes | No | No | Yes | `useOfflineData` + egg repository + cache | Server Actions replay | Append-only by date, duplicate/conflict possible | Good field UX, conflicts still technical | Partial |
| expenses | `finances -> expense form` | No | Yes | No | No | No | outbox only | Server Actions replay | Append-only simple | Write-only offline today | Partial |
| purchases | `/purchases` list | Yes | No | No | No | Yes | `useOfflineData` + purchases repository | None for list | None defined | List read exists locally, Phase 2 target to formalize UX | Partial |
| purchases | `purchases form` | Partial | Yes | No | No | Yes | outbox + references (suppliers, stocks) | Server Actions replay | Append-only with supplier/stock dependency | Good create UX, detail and conflict UX missing | Partial |
| batches | `/batches` list | No | No | No | No | Yes | data bootstrappee mais non exposee en UX | None | None defined | Data local exists, no offline screen contract | To complete (P2) |
| batches | `/batches/[id]` detail | No | No | No | No | Yes | references exist indirectly; no dedicated offline view | None | None defined | Phase 3 cible — detail lot utile mais apres liste formalisee | To complete (P3) |
| farms | `/farms` | No | No | No | No | Yes | farms bootstrappees mais non exposees offline | None | None defined | No offline contract today | To complete (P2) |
| customers | `/customers` | No | No | No | No | Yes | customers bootstrappes but only reused in sales/new | None | None defined | No local consultation UX | To complete (P2) |
| suppliers | `/suppliers` | No | No | No | No | Yes | suppliers bootstrappes but only reused in purchases | None | None defined | No local consultation UX | To complete (P2) |
| reports | `/reports` | No | No | No | No | No | None | None | None defined | Shell possible via SW, not a real offline feature | Non-priority |
| business | `/business` | No | No | No | No | No | None | None | None defined | Not part of MVP offline terrain | Non-priority |
| team | `/team` | No | No | No | No | No | None | None | None defined | Should stay online-only for now | Non-priority |
| settings | `/settings` | No | No | No | No | No | None | None | None defined | Needs explicit online-only messaging later | Non-priority |

Legend :

- `Yes` = capacite existe deja de maniere explicite
- `Partial` = existe de facon reelle mais incomplete ou eclatee
- `No` = non trouve dans le code
- `To complete (P2)` = cible Phase 2 — lecture locale a exposer (data deja bootstrappee)
- `To complete (P3)` = cible Phase 3 — necessite travail supplementaire sur les dependances ou l'UX
- `Non-priority` = hors MVP offline terrain

---

## 6. Reference Cache Strategy

References a traiter comme socle offline officiel :

- fermes
- lots
- clients
- fournisseurs
- plans vaccinaux
- stocks de reference

Etat actuel :

- les references sont deja bootstrappees dans [bootstrap.ts](/C:/Users/pcpro/sunufarm/src/lib/offline/bootstrap.ts)
- les cles de cache sont explicites dans [offline-keys.ts](/C:/Users/pcpro/sunufarm/src/lib/offline-keys.ts)
- les TTL sont definis dans [offline-ttl.ts](/C:/Users/pcpro/sunufarm/src/lib/offline-ttl.ts)

Regles cibles :

- toutes les references sont versionnees par organisation
- bootstrap initial obligatoire pour Level 1 et Level 2
- refresh manuel possible depuis le hub offline
- un module ne doit pas pretendre etre offline si ses references critiques ne sont pas preparees

Politique TTL recommandee :

- references : garder 24 h comme base actuelle
- records recents : garder 30 min pour consultation recente
- dashboard local : 10 min seulement si un fallback dashboard est un jour officialise
- session : 12 h a conserver pour limiter les usages offline trop longs sans revalidation

References minimales par ecran offline-compatible :

| Ecran | References requises au bootstrap |
| --- | --- |
| `/daily` | batches, feedStocks |
| `/health` | batches, medicineStocks, vaccinationPlans |
| `/stock` | farms, batches, feedStocks, medicineStocks |
| `/eggs` | batches |
| `/sales/new` | customers, batches |
| `purchases form` | suppliers, feedStocks, medicineStocks |
| `/purchases` list | suppliers |
| `/batches` list | batches |
| `/customers` | customers |
| `/suppliers` | suppliers |
| `/farms` | farms |

Gaps actuels :

- pas de message standardise si le bootstrap est incomplet pour un ecran au moment ou l'utilisateur y accede offline

---

## 7. Mutation Outbox Strategy

Etat actuel :

- une commande par intention metier existe deja dans [offline-mutation-outbox.ts](/C:/Users/pcpro/sunufarm/src/lib/offline-mutation-outbox.ts)
- replay pilote par [engine.ts](/C:/Users/pcpro/sunufarm/src/lib/offline/sync/engine.ts)
- plusieurs mutations utilisent deja `clientMutationId`

Mutations offline identifiees actuellement :

- `CREATE_DAILY_RECORD`
- `CREATE_EXPENSE`
- `CREATE_VACCINATION`
- `CREATE_TREATMENT`
- `CREATE_SALE`
- `CREATE_FEED_MOVEMENT`
- `CREATE_MEDICINE_MOVEMENT`
- `CREATE_EGG_RECORD`
- `CREATE_PURCHASE`

Exigences cibles :

- une commande = une intention metier atomique
- `clientMutationId` obligatoire pour toute creation offline
- chaque commande doit pouvoir etre :
  - enqueue
  - replay
  - retry
  - remove
  - diagnostiquer

Statuts normalises cibles :

- `pending`
- `syncing`
- `failed`
- `conflict`
- `synced`

Etat reel actuel :

- persistance explicite de `pending`, `failed`, `conflict`, `synced`
- `syncing` n'est pas encore un vrai statut persiste dans [types.ts](/C:/Users/pcpro/sunufarm/src/lib/offline/types.ts)
- `isSyncing` existe surtout comme etat UI dans [useOfflineSyncStatus.ts](/C:/Users/pcpro/sunufarm/src/hooks/useOfflineSyncStatus.ts)

Decision recommandee :

- ne pas changer tout de suite le moteur
- documenter `syncing` comme etat cible Phase 1
- garder le reste du contrat inchangé tant que la couche de replay est stable

---

## 8. Conflict Strategy

### Etat actuel

Le moteur sait deja :

- detecter des conflits par message backend ou doublon
- marquer `conflict`
- journaliser les erreurs et payloads dans [errors.ts](/C:/Users/pcpro/sunufarm/src/lib/offline/sync/errors.ts)
- exposer ces erreurs dans le hub offline

### Limite actuelle

La gestion de conflit est encore principalement technique :

- message backend
- payload original / mappe / final
- statut conflict dans les repositories

Ce n'est pas encore une experience de resolution metier orientee utilisateur.

### Strategie cible par categorie

Append-only :

- ventes
- depenses
- oeufs
- achats

Strategie :

- deduplication par `clientMutationId`
- en cas de doublon : marquer `synced` ou `conflict` avec message clair

Upsert simple :

- references futures si on ouvre creation locale de client/fournisseur

Strategie :

- detecter le doublon par identite metier
- proposer fusion ou abandon

Stock :

- mouvements aliment
- mouvements medicaments

Strategie :

- ne jamais promettre "stock exact offline"
- considerer le stock comme une lecture derivee a verifier apres sync
- en cas de conflit : remediation explicite prioritaire

Daily :

- saisies journalieres avec dependance feed stock

Strategie :

- priorite maximale a l'idempotence
- valider les references avant replay
- remonter un conflit lisible si le lot, la date ou le stock ne sont plus coherents

Entites avec dependances :

- vaccination / traitement / achat avec liens vers medicament, fournisseur ou stock

Strategie :

- bloquer ou marquer `failed/conflict` tant que la dependance locale -> serveur n'est pas resolue

---

## 9. Offline UX Contract

Chaque ecran offline-compatible doit afficher clairement :

- etat reseau
- fallback local actif ou non
- dernier sync
- file locale en attente pour le scope
- message explicite si une action n'est pas disponible hors ligne

Contrat UX minimal par ecran compatible :

- badge ou message "hors ligne"
- indication si les donnees sont `cachees` ou `recentes`
- `OfflineSyncCard` ou equivalent de scope
- si action non supportee offline : message simple, pas une erreur brute

Contrat UX minimal pour les ecrans non compatibles :

- ne pas laisser croire qu'ils sont offline-ready
- afficher un shell de page si necessaire
- afficher un message "disponible en ligne uniquement" si l'utilisateur tente une action critique

Constat actuel :

- `OfflineSyncCard` est deja bien utilise sur plusieurs surfaces terrain
- `GlobalSyncBanner` et le hub offline donnent une bonne supervision transverse
- le contrat n'est pas encore homogene sur les ecrans de lecture locale simple

---

## 10. Implementation Phases

### Phase 0 — Scope and matrix

Objectif :

- figer le perimetre offline officiel
- transformer ce document en source de verite

Checklist :

- valider la matrice de capacite par ecran
- classifier chaque ecran en Level 1, 2 ou 3
- definir le MVP offline terrain officiel
- lister explicitement les online-only

### Phase 1 — Foundation hardening

Objectif :

- fiabiliser le socle sans rework massif

Checklist :

- documenter `syncing` comme etat cible et decider s'il devient persistant
- standardiser les erreurs backend exploitables par le moteur de sync
- verifier l'idempotence de toutes les mutations offline existantes
- standardiser les messages de fallback local et de stale data
- verifier les dependances critiques `daily` et `stock`

### Phase 2 — Offline read expansion

Objectif :

- etendre la lecture offline utile la ou les donnees existent deja localement

Priorite recommandee :

- `batches`
- `customers`
- `suppliers`
- `sales list`
- `purchases list`

Checklist :

- exposer les listes locales deja bootstrappees
- brancher `useOfflineData` sur les pages cibles
- afficher clairement le fallback local
- ajouter les notes UX de stale/fresh

### Phase 3 — Offline write completion

Objectif :

- completer les operations critiques restantes sans casser les flows existants

Checklist :

- stabiliser `daily`
- stabiliser `stock`
- stabiliser `health`
- completer la lecture offline des depenses (liste recente des depenses)
- completer les ecritures critiques manquantes si necessaire
- verifier les dependances et mappings locaux -> serveur

### Phase 4 — Conflict resolution UX

Objectif :

- transformer les conflits techniques en experience produit exploitable

Checklist :

- afficher les conflits par module
- proposer reprise / abandon / correction
- formuler les erreurs dans le langage metier
- ajouter une UX plus exploitable pour `stock` et `daily`

### Phase 5 — Extended product coverage

Objectif :

- n'etendre qu'apres retour terrain reel

Checklist :

- evaluer un mode lecture locale simplifie pour `reports`
- evaluer un fallback local limite pour `dashboard`
- ne pas prioriser `business`, `team`, `admin`, `pricing/paiement` sans besoin terrain prouve

Ordre d'execution recommande :

1. Phase 0
2. Phase 1
3. Phase 2 sur `batches + customers + suppliers + sales list + purchases list`
4. Phase 3 sur les operations critiques restantes
5. Phase 4 sur conflits et UX de reprise
6. Phase 5 seulement apres retour terrain reel

---

## 11. MVP Offline Terrain Scope

Le MVP offline realiste n'est pas "tout le produit offline".

Le MVP offline realiste est :

permettre a un elevage de continuer ses operations quotidiennes sans reseau, puis resynchroniser proprement.

Perimetre MVP offline terrain :

- saisie journaliere
- soins / vaccination
- depenses
- ventes
- mouvements de stock
- production d'oeufs
- achats
- lecture locale de lots
- lecture locale de fermes
- lecture locale de clients
- lecture locale de fournisseurs
- consultation recente des ventes / achats

Definition de succes MVP :

- un utilisateur terrain peut continuer a travailler une journee sans reseau
- les commandes restent rejouables
- les references necessaires sont localement disponibles
- les erreurs de sync ne bloquent pas silencieusement l'activite

---

## 12. Explicit Online-only Scope

Hors perimetre offline prioritaire :

- reports offline avances
- business offline complet
- exports offline
- pricing/paiement offline
- admin offline
- team offline complet
- settings avances offline

Regle produit :

- toute surface non couverte doit etre explicitement consideree `online only`
- ne pas laisser entendre qu'un shell SW = une fonctionnalite metier offline

---

## 13. Risks

Risques majeurs :

- divergence entre cache de lecture et outbox de mutation
- stock local percu comme verite definitive alors qu'il peut diverger
- saisie journaliere locale basee sur des references stale
- conflits stock et daily encore trop techniques pour des utilisateurs terrain
- ecrans affichant des donnees locales sans contrat UX clair sur la fraicheur
- bootstrap incomplet silencieux : un ecran Level 1 accessible offline sans ses references minimales

Risques specifiques a `daily` :

- doublon potentiel si l'idempotence n'est pas rigoureusement respectee
- incoherence avec mouvements d'aliment relies
- erreur silencieuse si une dependance locale n'est plus valide au sync

Risques specifiques a `stock` :

- c'est la zone la plus sensible pour la confiance utilisateur
- mouvement local reussi != stock global fiable tant que le replay n'est pas confirme

Risque produit global :

- promettre "full offline" serait trompeur aujourd'hui

---

## 14. Definition of Done

Un module peut etre considere `offline-ready` seulement si :

- la promesse produit offline du module est ecrite dans la matrice
- les references critiques sont bootstrappees
- la lecture offline est exploitable et clairement marquee
- les mutations offline critiques ont un `clientMutationId`
- la mutation est replayable de facon idempotente
- l'utilisateur voit la file locale, le dernier sync et l'etat reseau
- les erreurs `failed` et `conflict` sont visibles
- le module ne laisse pas croire qu'une action online-only est offline-compatible

Definition de done Level 1 :

- operations critiques faisables sans reseau
- replay robuste
- UX terrain claire

Definition de done Level 2 :

- lecture locale utile
- stale/fresh explicite
- aucune promesse abusive sur l'exactitude temps reel

Definition de done Level 3 :

- surface explicitement assumee online-only

