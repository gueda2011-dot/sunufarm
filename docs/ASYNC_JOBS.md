# Async Jobs

## Objectif

Identifier les traitements qui peuvent rester synchrones pour l'instant, et ceux qui devront probablement passer par une file de jobs quand l'usage augmentera.

Le but n'est pas d'introduire une queue maintenant.
Le but est de savoir quand elle deviendra justifiee.

## Etat Actuel

SunuFarm fonctionne encore majoritairement en traitement synchrone, avec un cron deja en place pour les notifications.

Ce qui existe deja :

- cron `api/cron/notifications`
- exports `CSV`, `Excel` et `PDF` lances a la demande
- digest email envoye depuis le cron notifications si l'environnement email est configure
- webhooks paiements traites a la reception

## Garder Synchrone Tant Que

On peut garder le traitement synchrone tant que :

- les exports mensuels restent dans le budget documente
- les PDF de lot restent rapides a generer
- les emails de digest restent peu volumineux
- les webhooks sont traites sans timeout ni repetition excessive
- le cron notifications reste stable par organisation

## Bons Candidats A Une File De Jobs

### Priorite 1

- exports `Excel` et `PDF` lourds
- envois d'emails hors parcours critique
- recalculs ou syntheses couteuses si les rapports grossissent

Pourquoi :

- ce sont des traitements potentiellement lents
- ils ne doivent pas bloquer l'experience utilisateur
- ils sont faciles a relancer ou suivre separement

### Priorite 2

- digest et campagnes de notifications plus riches
- traitements IA si l'analyse devient plus lourde ou plus frequente
- reprises automatiques sur certains echecs techniques non critiques

Pourquoi :

- ces traitements peuvent monter en volume sans etre au coeur de chaque action utilisateur
- ils gagnent a etre retries, traces et limites separement

## Garder Hors Queue Pour L'Instant

Ces flux doivent rester simples tant que les signaux de saturation n'existent pas :

- changement d'organisation active
- permissions et server actions metier courantes
- creation lot
- saisie journaliere
- operations CRUD courtes de stock, sante, ventes et achats
- verification immediate des paiements et webhooks critiques

## Signaux De Bascule

Une queue devient justifiee si plusieurs de ces signaux apparaissent :

- export utilisateur qui depasse regulierement le temps cible
- timeouts ou erreurs repetes sur generation PDF ou Excel
- backlog croissant d'emails ou retries manuels frequents
- cron notifications qui depasse son budget par organisation
- besoin de relancer un traitement sans rejouer toute l'action utilisateur
- besoin de suivre un statut `en attente / en cours / termine / echec`

## Premiere Decoupe Recommandee

Si une queue est introduite plus tard, commencer petit :

1. `report_exports`
2. `notification_emails`
3. `heavy_ai_tasks` si le besoin apparait

Chaque job devrait garder un minimum commun :

- `requestId` ou correlation id
- `organizationId`
- type de traitement
- date de creation
- statut
- nombre de retries
- dernier message d'erreur

## Impacts Produit A Prevoir

Passer a une queue implique ensuite :

- une UI de statut pour certains exports
- une notion de traitement differe
- des messages plus clairs cote utilisateur
- une supervision minimale des jobs en erreur

## Decision Actuelle

- ne pas introduire de queue maintenant
- garder le cron notifications comme mecanisme asynchrone principal
- preparer d'abord la trajectoire documentaire et les seuils de bascule
