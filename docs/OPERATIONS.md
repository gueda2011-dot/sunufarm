# Operations SunuFarm

## Principe

- La configuration serveur est centralisee dans `src/lib/env.ts`
- Les alias legacy `NEXTAUTH_SECRET` et `NEXTAUTH_URL` restent supportes
- Les routes critiques utilisent un format d'erreur JSON homogene via `src/lib/api-response.ts`

## Avant un deploiement

1. Verifier les variables d'environnement obligatoires.
2. Executer `npx prisma migrate deploy`.
3. Executer `npx prisma generate` si necessaire.
4. Lancer `npm run test`.
5. Lancer `npm run build`.
6. Verifier les endpoints sensibles derriere authentification.

## Variables critiques

- `SUNUFARM_DATABASE_URL`
- `SUNUFARM_DIRECT_URL` si utilisee
- `AUTH_SECRET`
- `AUTH_URL`
- `NEXTAUTH_SECRET` et `NEXTAUTH_URL` si un environnement ancien ne migre pas encore vers `AUTH_*`
- `RESEND_API_KEY` si emails actifs
- `MAIL_FROM` si emails actifs
- `CRON_SECRET` pour securiser les crons applicatifs
- variables de paiement si le provider est active
- variables IA si l'analyse est activee

## Variables minimales pour booter

- `SUNUFARM_DATABASE_URL`
- `AUTH_SECRET` ou `NEXTAUTH_SECRET`
- `AUTH_URL` ou `NEXTAUTH_URL`

## Sequence de deploiement recommandee

1. Recuperer les variables d'environnement du bon environnement
2. Executer `npm ci`
3. Executer `npx prisma migrate deploy`
4. Executer `npm run test`
5. Executer `npm run build`
6. Deployer
7. Verifier la checklist post-deploiement

## Check prod apres deploiement

1. Connexion / deconnexion
2. Onboarding et creation d'organisation
3. Creation d'une ferme et d'un batiment
4. Creation d'un lot
5. Saisie journaliere
6. Abonnement / paiements admin
7. Rapports et exports CSV / Excel / PDF
8. Verification du manifeste PWA sur mobile
9. Verification d'un changement d'organisation active
10. Verification d'une erreur metier standard sur une route API critique
11. Verification du cron `notifications` si l'environnement doit envoyer les alertes automatiquement

## Observabilite

- Les erreurs serveur critiques doivent etre journalisees via `src/lib/logger.ts`.
- Les actions metier importantes doivent conserver un audit log.
- Toute erreur Prisma recurrente doit etre investiguee cote schema et migrations.
- Les endpoints limites doivent conserver leurs headers de rate limit.
- Cibles Phase 2 a verifier sur environnement realiste:
  - `dashboard`: reponse serveur sous `400 ms` hors cold start
  - `reports/monthly`: generation sous `2 s` avec details bornes
  - `api/cron/notifications`: passage par organisation sous `1 s` hors latence email externe

## Incident courant

### La prod renvoie une erreur pendant l'onboarding

- verifier que la base cible a bien recu les migrations recentes
- verifier les tables `Subscription`, `SubscriptionPayment`, `PaymentTransaction`
- verifier les nouvelles tables de support comme `FormDraft`

### Un utilisateur arrive dans la mauvaise organisation

- verifier le cookie `sunufarm_active_org`
- verifier que l'utilisateur a encore un membership valide
- supprimer le cookie si l'organisation active a disparu
- verifier que les routes API critiques utilisent bien le contexte d'organisation active et pas un fallback implicite

### Une route API renvoie une erreur inattendue

- verifier le `code` et le `status` renvoyes dans le JSON
- verifier l'origine de requete sur les endpoints de mutation
- verifier la permission de module cote serveur
- verifier la configuration chargee par `src/lib/env.ts`

### Les notifications automatiques ne partent pas

- verifier que `CRON_SECRET` est defini dans l'environnement
- verifier que `vercel.json` contient bien le cron `/api/cron/notifications` (toutes les 6 heures)
- verifier que `RESEND_API_KEY` et `MAIL_FROM` sont definis si l'envoi email est attendu
- verifier que les membres concernes ont bien l'option email active dans l'equipe
- tester manuellement `GET /api/cron/notifications` avec `Authorization: Bearer <CRON_SECRET>`
- verifier les logs `notifications.cron_completed` et `notifications.cron_failed_for_organization`
