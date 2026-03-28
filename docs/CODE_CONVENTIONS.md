# Conventions de code SunuFarm

Ce document fixe les conventions minimales a respecter avant toute Phase 1+.

## Fichiers

- Encodage UTF-8 et fin de ligne LF via `.editorconfig`
- Indentation de 2 espaces sur TypeScript, JavaScript, JSON, YAML et Markdown
- Un saut de ligne final sur tous les fichiers texte

## TypeScript / Next.js

- Preferer les imports absolus via `@/`
- Garder les composants et helpers centres sur une responsabilite claire
- Eviter les `findMany` non bornes sur les zones critiques
- Toute route ou action multi-tenant doit utiliser le contexte d'organisation active
- Les exports (CSV, Excel, PDF) doivent reposer sur un modele partage quand c'est possible

## Qualite

- `npm run lint`, `npm test` et `npm run build` doivent rester verts avant push
- Ne pas introduire de warning ESLint nouveau sur les zones critiques
- Ajouter un commentaire uniquement quand l'intention n'est pas evidente a la lecture

## Documentation

- Toute variable d'environnement utilisee en production doit etre documentee
- Toute decision structurelle doit etre reportee dans `docs/SCALABILITY_ROADMAP.md` ou `PROGRESS.md`
