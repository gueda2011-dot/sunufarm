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

## Variables recommandees par usage

### Recommandees sur tous les environnements applicatifs

- `NEXT_PUBLIC_APP_URL` pour les liens absolus, emails et la PWA
- `SUNUFARM_DIRECT_URL` seulement si l'environnement l'utilise pour migrations ou outillage admin

### Notifications et cron

- `CRON_SECRET` pour proteger `GET /api/cron/notifications`
- `RESEND_API_KEY` + `MAIL_FROM` pour activer les emails transactionnels et le digest de notifications
- sur Vercel Hobby, le cron est volontairement limite a `1 fois par jour`
- au moment du lancement commercial ou du passage sur un plan payant, remettre la frequence cible a `toutes les 6 heures`

### Paiements

- `WAVE_API_KEY` pour initier les checkouts Wave
- `WAVE_WEBHOOK_SECRET` pour verifier les webhooks Wave
- `PAYMENT_WEBHOOK_SECRET` pour les autres providers webhook HMAC

### IA

- `OPENAI_API_KEY` pour activer l'analyse IA des lots

## Variables optionnelles par environnement

- `VERCEL_ENV`, `VERCEL_URL` et `VERCEL_PROJECT_PRODUCTION_URL` sont exploitees quand l'app tourne sur Vercel, notamment pour les URLs de confiance et l'observabilite
- Les aliases `NEXTAUTH_SECRET`, `NEXTAUTH_URL` et `EMAIL_FROM` restent toleres pour compatibilite, mais `AUTH_SECRET`, `AUTH_URL` et `MAIL_FROM` sont les noms cibles

## Sequence de deploiement recommandee

1. Recuperer les variables d'environnement du bon environnement
2. Executer `npm ci`
3. Executer `npx prisma migrate deploy`
4. Executer `npm run test`
5. Executer `npm run build`
6. Deployer
7. Verifier la checklist post-deploiement
8. Relire la matrice de non-regression dans `docs/NON_REGRESSION_MATRIX.md` si le diff touche une zone sensible

## Backup et restore

- La procedure de reference est documentee dans `docs/BACKUP_RESTORE.md`
- En pratique :
  - utiliser `SUNUFARM_DIRECT_URL` pour les operations admin si elle existe
  - sinon utiliser `SUNUFARM_DATABASE_URL`
  - faire un backup avant migration sensible ou restauration
  - verifier la restauration via `npx prisma migrate status`, `npm run test` et `npm run build`

## Reponse a incident

- La procedure minimale est documentee dans `docs/INCIDENT_RESPONSE.md`
- En pratique :
  - commencer par confirmer l'impact reel
  - recuperer les logs structures et le `requestId`
  - verifier la page `/admin` et sa sante applicative
  - utiliser `docs/BACKUP_RESTORE.md` si une restauration devient necessaire

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
- verifier les logs structures lies au `requestId`

### Restaurer une base apres incident

- suivre `docs/BACKUP_RESTORE.md`
- restaurer d'abord sur une cible de verification si le temps le permet
- verifier `npx prisma migrate status`
- rejouer la checklist minimale produit avant reouverture du trafic

### Les notifications automatiques ne partent pas

- verifier que `CRON_SECRET` est defini dans l'environnement
- verifier que `vercel.json` contient bien le cron `/api/cron/notifications`
- en plan Hobby, la frequence attendue est `1 fois par jour`
- au lancement commercial, remettre la frequence cible a `toutes les 6 heures`
- verifier que `RESEND_API_KEY` et `MAIL_FROM` sont definis si l'envoi email est attendu
- verifier que les membres concernes ont bien l'option email active dans l'equipe
- tester manuellement `GET /api/cron/notifications` avec `Authorization: Bearer <CRON_SECRET>`
- verifier les logs `notifications.cron_completed` et `notifications.cron_failed_for_organization`
