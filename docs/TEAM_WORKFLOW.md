# Team Workflow

## Objectif

Donner un cadre simple pour faire avancer SunuFarm a plusieurs sans casser le rythme ni la qualite.

## Branches

- utiliser des branches de travail prefixees par sujet clair
- exemple: `feat/reports-pdf`, `fix/payment-webhook`, `chore/docs-phase6`
- garder `main` comme branche stable

## Pull Requests

Une PR doit rester ciblee.

### Taille recommandee

- preferer une PR courte a moyenne
- eviter de melanger refactor, feature et doc sans lien direct

### Contenu minimum

Chaque PR doit expliquer :

- le probleme traite
- le changement principal
- le risque potentiel
- la verification faite

## Checklist avant review

- `npm run lint`
- `npm test`
- `npm run build`
- relecture rapide du diff
- verification de la matrice `docs/NON_REGRESSION_MATRIX.md` si une zone sensible est touchee

## Definition of Done

Une tache est consideree terminee quand :

1. le besoin est implemente ou la doc est a jour
2. les permissions et l'organisation active sont respectees si la zone est metier
3. les tests ou validations pertinentes ont ete executes
4. la roadmap / progression sont mises a jour si le chantier touche une phase active
5. les risques residuels sont explicites

## Review

La review doit prioriser :

- regressions comportementales
- trous de permissions ou de multi-tenant
- performance sur listes, exports ou dashboard
- couverture de validation manquante
- clarté de l'architecture quand une nouvelle logique est introduite

## Ownership fonctionnel

Repartition simple recommande pour lire le code plus vite :

- `auth / organisation active / permissions`
- `batches / daily / eggs / health / stock`
- `sales / purchases / finances / reports`
- `subscriptions / payments / admin`
- `plateforme`: env, observabilite, docs, CI, Prisma

Cette repartition n'est pas une barriere stricte.
Elle sert surtout a savoir qui relit en premier et ou chercher quand un incident arrive.

Le detail par domaine, fichiers d'entree et points de vigilance est documente dans `docs/DOMAIN_OWNERSHIP.md`.
La priorisation des modules par impact business reel est documentee dans `docs/MODULE_PRIORITIES.md`.

## Cadence recommandee

- petites PR frequentes
- roadmap mise a jour a chaque bloc significatif
- une seule priorite technique principale par session quand c'est possible
