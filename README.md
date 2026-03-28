# SunuFarm

SunuFarm est une application Next.js pour le pilotage d'exploitations avicoles en Afrique francophone.

Le projet a depasse le stade du simple MVP. Il dispose deja d'un socle produit-tech solide pour une application multi-tenant, avec plusieurs modules metier, exports, paiements, audit et automatisations.

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

## Etat actuel

- Phase 2 `donnees et performance` : terminee
- Phase 3 `architecture applicative` : terminee
- Phase 4 `qualite et automatisation` : terminee
- Phase 5 `observabilite et securite` : terminee
- Phase 6 `scalabilite produit et equipe` : terminee

L'execution courante est maintenant pilotee par :

- [docs/QUARTERLY_ROADMAP.md](./docs/QUARTERLY_ROADMAP.md)
- [docs/MODULE_PRIORITIES.md](./docs/MODULE_PRIORITIES.md)

En pratique, cela veut dire aujourd'hui :

- multi-tenant solide avec organisation active, permissions module et droits par ferme
- pagination et bornes explicites sur les listes critiques et les exports
- index Prisma ajoutes sur les hotspots principaux, avec migration appliquee
- budget de performance documente pour `dashboard`, `reports` et le cron `notifications`
- notifications automatiques via cron, avec digest email si l'environnement est configure
- logique metier partagee entre pages, exports, PDF et actions serveur
- CI minimale en place avec `lint`, `test` et `build`
- logs structures avec `requestId` sur les routes sensibles
- tableau de sante applicative dans `/admin`
- runbooks `backup / restore` et `incident response`

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

2. Configurer les variables d'environnement a partir de `.env.local.example`

Variables importantes :
- `SUNUFARM_DATABASE_URL`
- `SUNUFARM_DIRECT_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `NEXTAUTH_SECRET` et `NEXTAUTH_URL` restent acceptes comme alias de compatibilite
- variables Resend si l'envoi d'email est active
- `MAIL_FROM` si l'envoi d'email est active
- `CRON_SECRET` pour securiser les notifications automatiques
- variables paiements si les transactions sont activees

Variables minimales pour booter :
- `SUNUFARM_DATABASE_URL`
- `AUTH_SECRET` ou `NEXTAUTH_SECRET`
- `AUTH_URL` ou `NEXTAUTH_URL`

Variables recommandees selon l'usage :
- `NEXT_PUBLIC_APP_URL` pour les liens emails, callbacks et PWA
- `CRON_SECRET` si le cron `notifications` est active
- `RESEND_API_KEY` + `MAIL_FROM` pour les emails transactionnels et digest
- `WAVE_API_KEY` pour le checkout mobile money Wave
- `WAVE_WEBHOOK_SECRET` ou `PAYMENT_WEBHOOK_SECRET` pour securiser les webhooks
- `OPENAI_API_KEY` si l'analyse IA est activee

3. Generer Prisma et appliquer les migrations

```bash
npx prisma generate
```

Pour un premier demarrage en local :

```bash
npx prisma db push
```

Pour un environnement deja migre ou un deploiement :

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
  Routes App Router, pages, layouts et API routes. Cette couche orchestre la route et delegue le metier.
- `src/actions/`
  Server Actions metier avec le pattern `validation -> auth -> autorisation -> mutation -> audit -> revalidation`.
- `src/lib/`
  Logique partagee : auth, permissions, subscriptions, notifications, view models, metrics et services serveur.
- `src/components/`
  Composants UI, layout, branding et documents PDF.
- `prisma/`
  Schema, client genere et migrations.
- `docs/`
  Documentation d'exploitation, architecture et roadmap.

Exemples de logique deja mutualisee :

- `src/lib/batch-metrics.ts`
- `src/lib/dashboard-view.ts`
- `src/lib/monthly-report-view.ts`
- `src/lib/subscription-lifecycle.ts`
- `src/lib/formatters.ts`

## Flux importants

### Auth et organisation

- non connecte -> `/login`
- connecte sans organisation -> `/start`
- connecte avec organisation -> dashboard
- super admin -> `/admin`

L'organisation active est maintenant resolue via un cookie applicatif et peut etre changee depuis le header.

Les permissions critiques sont verifiees cote serveur via le membership de l'organisation active, les modules actives et, selon les cas, les droits par ferme.

### Brouillons

Les formulaires critiques conservent un brouillon :
- en local sur l'appareil
- cote serveur sur le compte utilisateur

Les brouillons serveur rattaches a une organisation verifient maintenant aussi l'appartenance de l'utilisateur a cette organisation.

Cela couvre actuellement :
- creation de lot
- saisie journaliere

### Rapports et notifications

- exports `CSV`, `Excel` et `PDF`
- rapport mensuel base sur un modele partage entre page, export et PDF
- cron automatique quotidien pour generer les notifications sur Vercel Hobby
- digest email possible si `RESEND_API_KEY` et `MAIL_FROM` sont configures

## Qualite et exploitation

- journalisation structuree dans `src/lib/logger.ts`
- audit log metier dans `src/lib/audit.ts`
- CI GitHub dans `.github/workflows/ci.yml` avec `npm ci`, `npx prisma generate`, `npm run lint`, `npm test` et `npm run build`
- tableau de sante applicative super admin dans `/admin`
- checklist de deploiement dans [docs/OPERATIONS.md](./docs/OPERATIONS.md)
- procedure backup / restore dans [docs/BACKUP_RESTORE.md](./docs/BACKUP_RESTORE.md)
- reponse a incident dans [docs/INCIDENT_RESPONSE.md](./docs/INCIDENT_RESPONSE.md)
- matrice de non-regression dans [docs/NON_REGRESSION_MATRIX.md](./docs/NON_REGRESSION_MATRIX.md)
- workflow equipe dans [docs/TEAM_WORKFLOW.md](./docs/TEAM_WORKFLOW.md)
- ownership des domaines dans [docs/DOMAIN_OWNERSHIP.md](./docs/DOMAIN_OWNERSHIP.md)
- priorisation des modules dans [docs/MODULE_PRIORITIES.md](./docs/MODULE_PRIORITIES.md)
- roadmap trimestrielle dans [docs/QUARTERLY_ROADMAP.md](./docs/QUARTERLY_ROADMAP.md)
- trajectoire jobs asynchrones dans [docs/ASYNC_JOBS.md](./docs/ASYNC_JOBS.md)
- strategie cache et async processing dans [docs/CACHE_STRATEGY.md](./docs/CACHE_STRATEGY.md)
- onboarding dev dans [docs/ONBOARDING.md](./docs/ONBOARDING.md)
- donnees de demo dans [docs/DEMO_DATA.md](./docs/DEMO_DATA.md)
- roadmap de scalabilite dans [docs/SCALABILITY_ROADMAP.md](./docs/SCALABILITY_ROADMAP.md)
- exports CSV, Excel et PDF disponibles dans les rapports
- cron automatique quotidien pour generer les notifications et envoyer un digest email si Resend est configure
- base PWA avec `manifest`, `icon` et `apple-icon`

Note de deploiement :

- le cron `notifications` est volontairement regle a `1 fois par jour` pour rester compatible avec le plan Vercel Hobby
- au moment du lancement commercial ou du passage sur un plan payant, remettre la frequence cible a `toutes les 6 heures`

Budget de performance actuellement documente :

- `dashboard` : reponse serveur visee sous `400 ms` hors cold start
- `reports/monthly` : generation visee sous `2 s` avec details bornes
- `api/cron/notifications` : passage par organisation vise sous `1 s` hors latence email externe

## Tests

Le socle de tests couvre deja :

- organisation active
- permissions pures et permissions en flux serveur
- creation lot
- saisie journaliere
- abonnements et credits IA
- sanitation des brouillons serveur
- garde-fous multi-tenant sur les brouillons lies a une organisation
- view models et helpers critiques (`batch-metrics`, `dashboard-view`, `monthly-report-view`, `formatters`)

La validation automatique locale et CI repose sur :

```bash
npm run lint
npm test
npm run build
```

Le socle actuel compte `21` fichiers de test et `73` tests.

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

- La Phase 2 est consideree terminee: les hotspots critiques sont bornes, indexes et migres.
- La Phase 3 est terminee: la logique partagee, les view models et le pattern commun des actions serveur sont en place.
- La Phase 4 est terminee: CI, matrice de non-regression et couverture utile des chemins critiques sont en place.
- La Phase 5 est terminee: observabilite, rate limiting, sante applicative, backup / restore et reponse a incident minimale sont en place.
- La Phase 6 est terminee: workflow equipe, onboarding, ownership, priorisation, roadmap trimestrielle et trajectoire async/cache sont maintenant poses.
- L'execution courante suit maintenant la roadmap trimestrielle et la priorisation des modules, plutot qu'une phase de structuration ouverte.
- Les modules les plus sensibles a fiabiliser en continu restent auth, organisation active, lots, saisie, rapports et abonnements.
