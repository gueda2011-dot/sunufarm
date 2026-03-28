# Architecture SunuFarm

> Reference de structure applicative pour la Phase 3.
> Derniere mise a jour : 2026-03-28

---

## Objectif

Donner une regle simple a suivre quand on ajoute ou refactorise une fonctionnalite:
- ou charger les donnees
- ou mettre la logique metier
- ou valider et autoriser
- ou presenter l'information

---

## Repartition Des Couches

### `app/`

Responsabilite:
- routing Next.js
- layouts et pages
- orchestration serveur proche de la route
- API routes HTTP

Ne doit pas contenir:
- calculs metier reutilisables
- mapping complexe partage entre plusieurs surfaces
- logique Prisma dupliquee entre routes

Regle pratique:
- une page peut charger, verifier l'acces, puis appeler un helper de domaine ou un view model
- une API route peut parser la requete, verifier l'auth, puis deleguer a `src/actions/` ou `src/lib/`

### `src/actions/`

Responsabilite:
- mutations et lectures metier exposees comme Server Actions
- sequence standard `validation -> auth -> autorisation -> mutation -> audit -> revalidation`
- facade d'entree pour l'UI serveur

Ne doit pas contenir:
- logique de presentation
- DTO d'affichage complexes pour plusieurs surfaces
- logique metier pure reutilisee partout si elle peut vivre en `src/lib/`

Regle pratique:
- si une action contient beaucoup de calcul metier pur, extraire ce calcul dans `src/lib/`
- si plusieurs actions partagent une transition d'etat, extraire un helper de domaine

### `src/lib/`

Responsabilite:
- logique metier partagee
- services serveur
- helpers de domaine
- view models et DTO partages
- integrateurs externes

Sous-familles recommandees:
- `*-view.ts` : assemblage de DTO pour pages, exports, PDF
- `*-metrics.ts` : calculs purs et reutilisables
- `*-server.ts` : lecture serveur qui ne doit jamais descendre cote client
- `payments.ts`, `subscription-lifecycle.ts` : services et transitions de domaine

Regle pratique:
- `src/lib/` ne doit pas importer depuis `app/`
- un helper de domaine doit exposer un contrat stable teste

### `src/components/`

Responsabilite:
- presentation partagee
- composants UI transverses
- branding
- documents PDF

Ne doit pas contenir:
- fetch Prisma
- autorisation
- logique metier critique

Regle pratique:
- un composant doit recevoir des props deja preparees autant que possible

---

## Patterns A Privilegier

### Pattern page serveur

1. verifier session et organisation active
2. verifier le module
3. charger les donnees brutes
4. appeler un helper de domaine ou un view model
5. rendre des composants de presentation

### Pattern Server Action

1. parser les entrees
2. verifier session et membership
3. verifier permissions/module
4. appeler la transition de domaine
5. auditer
6. revalider
7. retourner un `ActionResult`

### Pattern API route

1. verifier origine si mutation
2. verifier auth
3. parser les params
4. deleguer a une action ou un service
5. convertir en reponse HTTP via `api-response`

---

## Exemples De Refactor Deja En Place

- `src/lib/batch-metrics.ts`
  logique operationnelle partagee entre detail lot, PDF lot et IA

- `src/lib/dashboard-view.ts`
  view model partage du dashboard

- `src/lib/monthly-report-view.ts`
  DTO metier partage des rapports mensuels pour page, PDF et exports

- `src/lib/subscription-lifecycle.ts`
  transitions partagees d'abonnement entre actions admin et paiements

---

## Regles De Decision

Quand une logique doit etre deplacee hors d'un fichier:
- si elle est reutilisee par 2 surfaces ou plus
- si elle calcule un etat metier qui doit rester coherent partout
- si elle melange chargement, calcul et presentation dans le meme fichier
- si elle devient assez importante pour meriter un test unitaire dedie

Quand garder local:
- si la logique est strictement liee a une seule route et sans valeur de reuse
- si l'extraction ajouterait une couche sans clarifier le domaine

---

## Prochaine Cible

- finir l'uniformisation `validation + autorisation + mutation` dans `src/actions/`
- poursuivre l'extraction du domaine `subscriptions / payments`
- garder `app/` comme couche d'orchestration legere, pas comme couche metier
