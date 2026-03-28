# Backup And Restore

## Principe

SunuFarm utilise PostgreSQL via Prisma.
La sauvegarde minimale defendable aujourd'hui est une sauvegarde logique de la base avec `pg_dump`, puis une restauration avec `pg_restore` ou `psql` selon le format choisi.

Le schema Prisma de reference est dans `prisma/schema.prisma` et les migrations versionnees sont dans `prisma/migrations/`.

## Variables utiles

- `SUNUFARM_DATABASE_URL`
- `SUNUFARM_DIRECT_URL` si l'environnement utilise une URL dediee pour les operations admin ou migrations

Quand les deux existent :
- utiliser `SUNUFARM_DIRECT_URL` pour les operations de backup/restore
- sinon utiliser `SUNUFARM_DATABASE_URL`

## Strategie recommandee

### Production

- sauvegarde logique reguliere de la base complete
- conservation hors machine applicative
- verification periodique par restauration sur une base de test

### Local / preprod

- sauvegarde avant migration sensible
- sauvegarde avant restauration de donnees de production anonymisees

## Sauvegarde logique

### Option recommandee: format custom

Ce format est le plus pratique pour `pg_restore`.

```powershell
$env:PGPASSWORD="[PASSWORD]"
pg_dump `
  --format=custom `
  --no-owner `
  --no-privileges `
  --file "backup-sunufarm-2026-03-28.dump" `
  "postgresql://postgres@[HOST]:5432/[DATABASE]"
```

### Option SQL plain text

Utile pour lecture ou restauration simple via `psql`.

```powershell
$env:PGPASSWORD="[PASSWORD]"
pg_dump `
  --format=plain `
  --no-owner `
  --no-privileges `
  --file "backup-sunufarm-2026-03-28.sql" `
  "postgresql://postgres@[HOST]:5432/[DATABASE]"
```

## Restauration

### Pre-requis

1. Identifier clairement la base cible.
2. Verifier que personne n'ecrit encore dessus.
3. Sauvegarder la base cible avant toute restauration destructive.
4. Verifier que les variables d'environnement pointent bien vers la bonne base.

### Restauration depuis un dump custom

```powershell
$env:PGPASSWORD="[PASSWORD]"
pg_restore `
  --clean `
  --if-exists `
  --no-owner `
  --no-privileges `
  --dbname "postgresql://postgres@[HOST]:5432/[DATABASE]" `
  "backup-sunufarm-2026-03-28.dump"
```

### Restauration depuis un dump SQL

```powershell
$env:PGPASSWORD="[PASSWORD]"
psql `
  "postgresql://postgres@[HOST]:5432/[DATABASE]" `
  -f "backup-sunufarm-2026-03-28.sql"
```

## Verification post-restore

1. Executer `npx prisma migrate status`
2. Executer `npx prisma generate`
3. Verifier que la base est au niveau attendu dans `prisma/migrations/`
4. Verifier au minimum les tables critiques :
   - `Organization`
   - `User`
   - `UserOrganization`
   - `Batch`
   - `DailyRecord`
   - `Subscription`
   - `SubscriptionPayment`
   - `PaymentTransaction`
   - `Notification`
   - `AuditLog`
5. Lancer :

```powershell
npm run test
npm run build
```

6. Verifier manuellement :
   - connexion
   - changement d'organisation active
   - dashboard
   - creation lot
   - saisie journaliere
   - rapports
   - paiements admin si actifs

## Cas courant

### Restaurer en local une copie de production

1. Restaurer dans une base locale dediee.
2. Verifier les variables d'environnement locales.
3. Ne jamais pointer l'app locale vers la base de production.
4. Regenerer Prisma si besoin.

### Restaurer apres migration problematique

1. Arreter les ecritures applicatives si possible.
2. Restaurer le dump le plus recent valide.
3. Executer `npx prisma migrate status`.
4. Verifier le diff entre la base restauree et la migration fautive avant de redeployer.

## Notes

- `npx prisma migrate deploy` applique les migrations versionnees, mais ne remplace pas une vraie sauvegarde.
- `npx prisma db push` ne doit pas servir de strategie de restauration.
- En environnement gere, les snapshots du fournisseur peuvent completer cette procedure, mais pas la remplacer sans verification de restauration.
