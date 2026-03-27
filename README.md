# SunuFarm

SunuFarm est une application Next.js pour le pilotage d'exploitations avicoles en Afrique francophone.

Le produit couvre deja :
- authentification et onboarding
- fermes et batiments
- lots d'elevage
- saisie journaliere
- production d'oeufs
- stock
- ventes, achats, clients
- finances
- sante animale
- abonnements, paiements admin et impersonation
- rapports mensuels

## Stack

- Next.js 16.2
- React 19
- Prisma 7 + PostgreSQL
- NextAuth v5 beta
- Tailwind CSS 4
- Zod + React Hook Form
- Vitest pour les tests rapides

## Demarrage local

1. Installer les dependances

```bash
npm install
```

2. Configurer les variables d'environnement a partir de `.env.example`

Variables importantes :
- `DATABASE_URL`
- `AUTH_SECRET` ou `NEXTAUTH_SECRET`
- variables Resend si l'envoi d'email est active
- variables paiements si les transactions sont activees

3. Generer Prisma et appliquer les migrations

```bash
npx prisma migrate deploy
npx prisma generate
```

4. Lancer l'application

```bash
npm run dev
```

## Scripts utiles

```bash
npm run dev
npm run build
npm run lint
npm run test
```

## Architecture rapide

- `app/`
  Routes App Router, layouts, pages dashboard, auth, admin et API routes.
- `src/actions/`
  Server Actions metier.
- `src/lib/`
  Helpers transverses : auth, permissions, subscriptions, logger, contexte organisation.
- `src/components/`
  Composants UI et layout.
- `prisma/`
  Schema, seed et migrations.
- `docs/`
  Documentation d'exploitation.

## Flux importants

### Auth et organisation

- non connecte -> `/login`
- connecte sans organisation -> `/start`
- connecte avec organisation -> dashboard
- super admin -> `/admin`

L'organisation active est maintenant resolue via un cookie applicatif et peut etre changee depuis le header.

### Brouillons

Les formulaires critiques conservent un brouillon :
- en local sur l'appareil
- cote serveur sur le compte utilisateur

Cela couvre actuellement :
- creation de lot
- saisie journaliere

## Qualite et exploitation

- journalisation structuree dans `src/lib/logger.ts`
- audit log metier dans `src/lib/audit.ts`
- checklist de deploiement dans [docs/OPERATIONS.md](./docs/OPERATIONS.md)
- exports CSV mensuels disponibles dans les rapports
- base PWA avec `manifest`, `icon` et `apple-icon`

## Tests

Le socle de tests couvre pour l'instant des helpers critiques :
- selection de l'organisation active
- permissions
- sanitation/limites des brouillons serveur

Le prochain niveau logique est d'ajouter des tests sur les Server Actions critiques.

## Production

Checklist courte avant mise en ligne :

```bash
npx prisma migrate deploy
npm run test
npm run build
```

Puis verifier manuellement :
- connexion / deconnexion
- onboarding
- creation ferme / batiment
- creation lot
- saisie journaliere
- rapports
- paiement / admin si actif

## Notes

- Le projet contient encore des zones MVP ou V2, mais la base multi-tenant et metier est deja serieuse.
- Les modules les plus sensibles a fiabiliser en continu sont auth, onboarding, lots, saisie et abonnements.
