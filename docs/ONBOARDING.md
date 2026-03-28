# Onboarding Dev

## Objectif

Permettre a un nouveau dev de comprendre rapidement comment lancer, lire et modifier SunuFarm.

## 1. Prerequis

- Node.js compatible avec le projet
- npm
- PostgreSQL accessible via `SUNUFARM_DATABASE_URL`

## 2. Premiere installation

```bash
npm install
```

Creer ensuite un `.env.local` a partir de `.env.local.example`.

Minimum pour booter :

- `SUNUFARM_DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`

## 3. Prisma

Generer Prisma :

```bash
npx prisma generate
```

Premier demarrage local :

```bash
npx prisma db push
```

Si l'environnement a deja des migrations :

```bash
npx prisma migrate deploy
```

## 4. Lancer l'application

```bash
npm run dev
```

## 5. Verifications minimales

Avant une premiere contribution :

```bash
npm run lint
npm test
npm run build
```

## 6. Comment lire le projet

- `app/`: routes, pages, layouts et API routes
- `src/actions/`: Server Actions metier
- `src/lib/`: logique partagee, permissions, auth, subscriptions, reporting, observabilite
- `src/components/`: UI, layout, branding, PDF
- `prisma/`: schema, migrations, seed
- `docs/`: architecture, operations, non-regression, roadmap

## 7. Fichiers a lire en premier

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `docs/NON_REGRESSION_MATRIX.md`
- `docs/SCALABILITY_ROADMAP.md`

## 8. Regles importantes

- le multi-tenant passe par l'organisation active
- les permissions doivent etre verifiees cote serveur
- les logs critiques passent par `src/lib/logger.ts`
- les changements de structure doivent rester alignes avec `docs/ARCHITECTURE.md`

## 9. Pour une premiere modification

Choisir de preference une zone limitee :

- documentation
- un helper pur dans `src/lib/`
- une Server Action ciblee
- une petite surface admin ou reporting

## 10. Avant de pousser

- relire `docs/TEAM_WORKFLOW.md`
- verifier la definition of done
- mettre a jour `PROGRESS.md` et la roadmap si la session fait avancer une phase

## 11. Donnees de demo

Pour travailler avec un jeu de donnees stable :

```bash
npx prisma db seed
```

Les comptes, roles et parcours recommandes sont documentes dans `docs/DEMO_DATA.md`.
