# Cache Strategy

## Objectif

Identifier ou un cache pourrait aider plus tard, sans casser la coherence fonctionnelle ni le multi-tenant.

Le but n'est pas d'ajouter du cache maintenant.
Le but est de savoir :

- quels flux peuvent en beneficier
- quels flux doivent rester sans cache
- quels garde-fous respecter si on en introduit

## Decision Actuelle

- pas de cache applicatif global pour l'instant
- priorite a la simplicite et a la coherence des donnees
- optimisation d'abord par requetes bornees, index, view models et budgets de performance

## Bons Candidats Plus Tard

### Priorite 1

- vue dashboard relue frequemment
- syntheses admin de sante applicative
- donnees d'exports mensuels si les memes periodes sont souvent rejouees

Pourquoi :

- ces surfaces sont surtout en lecture
- elles agrègent plusieurs donnees
- elles peuvent beneficier d'une petite reduction de charge sans changer le metier

### Priorite 2

- referentiels peu mouvants
- listes de support ou meta-donnees de configuration
- certains resultats derives non critiques pour l'immediat

Pourquoi :

- faible risque de divergence metier
- invalidation plus simple

## Mauvais Candidats

Ces flux doivent rester sans cache applicatif tant qu'aucune architecture plus forte n'est en place :

- organisation active
- permissions et droits par ferme
- paiements et webhooks
- saisie journaliere
- mutations CRUD metier immediates
- notifications utilisateur lues / non lues

Pourquoi :

- risque de donnees stale trop couteux
- risque multi-tenant plus eleve
- besoin de verite immediate plus important que le gain de perf

## Regles Si Un Cache Arrive

Si un cache est introduit plus tard, il devra respecter :

- scoping par `organizationId` au minimum
- jamais de partage aveugle entre organisations
- invalidation explicite apres mutation
- TTL court sur les vues agregees
- aucun cache sur les controles d'autorisation

## Async Processing Lie Au Cache

Le besoin de cache et le besoin d'async processing sont lies sur certains flux :

- si un rapport devient trop lent, commencer par mesurer
- si la mesure confirme un vrai point chaud, choisir entre :
  - pre-calcul asynchrone
  - cache court sur lecture
  - ou combinaison des deux

Regle simple :

- lecture tres frequente + faible exigence temps reel -> cache possible
- calcul lourd + besoin de relance/suivi -> job asynchrone preferable

## Signaux De Bascule

Un travail cache/async devient justifie si plusieurs de ces signaux apparaissent :

- dashboard ou admin relus souvent avec memes donnees
- meme export relance regulierement sur les memes filtres
- agregations visibles qui deviennent plus lentes malgre index et bornes
- besoin de reduire la charge de lecture sans toucher a la verite transactionnelle

## Premiere Strategie Recommandee

Si un cache est introduit plus tard, commencer petit :

1. dashboard par organisation avec TTL court
2. syntheses admin non critiques
3. resultats d'exports mensuels rejoues frequemment

Toujours mesurer avant et apres.
