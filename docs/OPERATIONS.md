# Operations SunuFarm

## Avant un deploiement

1. Verifier les variables d'environnement obligatoires.
2. Executer `npx prisma migrate deploy`.
3. Executer `npx prisma generate` si necessaire.
4. Lancer `npm run test`.
5. Lancer `npm run build`.

## Variables critiques

- `DATABASE_URL`
- `AUTH_SECRET` ou `NEXTAUTH_SECRET`
- `RESEND_API_KEY` si emails actifs
- variables de paiement si le provider est active
- variables IA si l'analyse est activee

## Check prod apres deploiement

1. Connexion / deconnexion
2. Onboarding et creation d'organisation
3. Creation d'une ferme et d'un batiment
4. Creation d'un lot
5. Saisie journaliere
6. Abonnement / paiements admin
7. Rapports et export CSV
8. Verification du manifeste PWA sur mobile

## Observabilite

- Les erreurs serveur critiques doivent etre journalisees via `src/lib/logger.ts`.
- Les actions metier importantes doivent conserver un audit log.
- Toute erreur Prisma recurrente doit etre investiguee cote schema et migrations.

## Incident courant

### La prod renvoie une erreur pendant l'onboarding

- verifier que la base cible a bien recu les migrations recentes
- verifier les tables `Subscription`, `SubscriptionPayment`, `PaymentTransaction`
- verifier les nouvelles tables de support comme `FormDraft`

### Un utilisateur arrive dans la mauvaise organisation

- verifier le cookie `sunufarm_active_org`
- verifier que l'utilisateur a encore un membership valide
- supprimer le cookie si l'organisation active a disparu
