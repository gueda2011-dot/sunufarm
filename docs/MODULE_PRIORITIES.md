# Module Priorities

## Objectif

Donner un ordre de lecture, de stabilisation et d'investissement qui suit l'impact reel du produit.

Cette priorisation sert a :

- choisir quoi fiabiliser en premier
- guider les revues et arbitrages
- relier la roadmap technique aux objectifs produit

## Priorite 1 - Coeur de fonctionnement

Ces modules ne doivent pas casser. Ce sont eux qui conditionnent l'usage quotidien de SunuFarm.

- `auth / organisation active / permissions`
- `batches`
- `daily-records`
- `reports`
- `subscriptions / payments`

Points d'attention :

- multi-tenant strict
- droits par role et par ferme
- performance stable sur les parcours quotidiens
- regression faible sur les exports et paiements

## Priorite 2 - Impact business direct

Ces modules influencent directement la valeur percue, la retention ou le revenu.

- `sales / purchases / expenses / finances`
- `reports` et exports mensuels
- `subscriptions / payments`
- `admin` pour le support et le pilotage

Points d'attention :

- lisibilite des donnees
- fiabilite des totaux et agregats
- rapidite des actions admin et de resolution incident

## Priorite 3 - Differenciation produit

Ces modules renforcent l'adoption, la perception de qualite et la valeur du produit a moyen terme.

- `notifications` automatiques
- `ai`
- `health`
- `stock`
- `eggs`

Points d'attention :

- utilite concrete sur le terrain
- bruit faible dans les alertes
- evolution progressive sans alourdir le coeur du produit

## Priorite 4 - Acceleration equipe

Ces sujets n'apportent pas directement une fonctionnalite metier, mais ils font gagner du temps a chaque session.

- `docs`
- `demo data`
- `onboarding`
- `ci`
- `observabilite`
- `ownership des domaines`

Points d'attention :

- reprise rapide du projet
- validation plus fiable avant merge
- support plus simple en cas d'incident

## Regles d'arbitrage

Quand plusieurs chantiers sont possibles, preferer dans cet ordre :

1. un correctif sur le coeur de fonctionnement
2. une amelioration qui protege le revenu ou les donnees critiques
3. une amelioration de differenciation produit
4. un chantier de confort interne

Si un chantier de niveau inferieur augmente fortement le risque sur un module de niveau superieur, il doit etre reporte ou decoupe.

## Usage pratique

- une PR qui touche la priorite 1 ou 2 doit avoir une validation plus stricte
- une revue de code doit verifier d'abord le niveau de priorite du module touche
- la roadmap trimestrielle devra rester coherente avec cette grille
