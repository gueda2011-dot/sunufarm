# Demo Data

## Objectif

Documenter la seed de demonstration pour que l'onboarding, la demo produit et la validation manuelle reposent sur les memes donnees.

## Commande

```bash
npx prisma db seed
```

Le seed est maintenant deterministe.
Une reexecution sur une base vide redonne le meme jeu de donnees fonctionnelles.

## Mot de passe

Tous les comptes de demo utilisent :

```text
Sunufarm2025!
```

## Comptes disponibles

### Plateforme

- `admin@sunufarm.sn`
  role: `SUPER_ADMIN`
  usage: verifier `/admin`, les paiements, la sante applicative et l'impersonation

### Organisation 1 - Ferme Diallo et Fils

- `ousmane.diallo@sunufarm.sn`
  role: `OWNER`
- `mamadou.fall@sunufarm.sn`
  role: `MANAGER`
- `fatou.sow@sunufarm.sn`
  role: `TECHNICIAN`
- `ibrahima.ba@sunufarm.sn`
  role: `DATA_ENTRY`
- `aminata.diop@sunufarm.sn`
  role: `ACCOUNTANT`

Usage principal :
- dashboard et parcours metier complets
- lots, daily, stock, sante, ventes, finances, rapports

### Organisation 2 - Avicole Thies SARL

- `cheikh.ndiaye@sunufarm.sn`
  role: `OWNER`

Usage principal :
- verifier l'isolation multi-tenant
- verifier l'essai gratuit et les credits IA limites

## Donnees cle par organisation

### Ferme Diallo et Fils

- 1 ferme principale a Diamniadio
- 3 batiments
- 3 lots
- 2 ventes, dont une partiellement encaissee
- stock aliment
- stock medicaments avec cas d'alerte
- donnees daily et ponte
- abonnement `PRO` actif

Lots utiles :

- `SF-2026-001`
  poulet de chair actif
  utile pour dashboard, daily, sante et analyses en cours
- `SF-2025-018`
  lot vendu
  utile pour rentabilite et rapports
- `SF-2026-002`
  pondeuses actives
  utile pour oeufs et suivi de production

### Avicole Thies SARL

- 1 ferme
- 1 batiment
- 1 lot pondeuse actif
- abonnement `BASIC` en `TRIAL`
- credits IA limites

Point de verification utile :

- le numero de lot `SF-2026-001` existe aussi ici pour valider que l'unicite et l'acces sont bien par organisation, pas globaux

## Parcours de demo recommandes

### Demo produit rapide

1. connexion avec `ousmane.diallo@sunufarm.sn`
2. ouverture du dashboard
3. detail du lot `SF-2025-018`
4. export rapports mensuels
5. verification ventes et reste a encaisser

### Demo multi-tenant

1. connexion avec `ousmane.diallo@sunufarm.sn`
2. noter un lot ou une vente visible
3. connexion avec `cheikh.ndiaye@sunufarm.sn`
4. verifier que les donnees de Diallo ne sont pas visibles

### Demo admin

1. connexion avec `admin@sunufarm.sn`
2. ouverture de `/admin`
3. verification de la sante applicative
4. verification des organisations et abonnements

## Notes

- la seed efface les donnees existantes avant recreation
- elle est adaptee a un environnement de developpement ou de demo, pas a une base reelle a conserver
