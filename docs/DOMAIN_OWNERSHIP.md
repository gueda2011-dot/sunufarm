# Domain Ownership

## Objectif

Rendre plus clair qui regarde quoi en premier quand une feature, une review ou un incident touche un domaine SunuFarm.

Ce document ne cree pas de silos stricts.
Il donne un point d'entree pratique pour relire plus vite et intervenir plus proprement.

## Regle simple

Pour chaque changement :

1. identifier le domaine principal touche
2. verifier les fichiers d'entree de ce domaine
3. demander en priorite une review sur ce domaine
4. verifier les impacts transverses: auth, multi-tenant, perf, observabilite

## Domaines

### Auth / organisation active / permissions

Responsabilite :
- authentification
- selection d'organisation active
- roles, modules et droits par ferme

Points d'entree :
- `src/auth.ts`
- `src/lib/auth.ts`
- `src/lib/active-organization.ts`
- `src/lib/permissions.ts`
- `src/actions/organization-context.ts`
- `src/actions/organizations.ts`

Surveiller en review :
- fuite multi-tenant
- oubli de `requireOrganizationModuleContext()`
- oubli de `requireRole()`
- mauvais fallback d'organisation active

### Elevage coeur: batches / daily / eggs / health / stock

Responsabilite :
- cycle d'elevage
- saisie journaliere
- production oeufs
- sante
- stocks aliment et medicaments

Points d'entree :
- `src/actions/batches.ts`
- `src/actions/daily-records.ts`
- `src/actions/eggs.ts`
- `src/actions/health.ts`
- `src/actions/stock.ts`
- `src/lib/batch-metrics.ts`
- `src/lib/batch-rules.ts`
- `src/lib/daily-record-rules.ts`

Surveiller en review :
- impact sur dashboard
- calculs de mortalite, effectif et saisie manquante
- bornes de requetes sur listes et historiques

### Commerce / finances / rapports

Responsabilite :
- clients, fournisseurs
- ventes, achats, depenses
- rentabilite
- rapports mensuels et exports

Points d'entree :
- `src/actions/customers.ts`
- `src/actions/suppliers.ts`
- `src/actions/sales.ts`
- `src/actions/purchases.ts`
- `src/actions/expenses.ts`
- `src/actions/profitability.ts`
- `src/lib/monthly-report-view.ts`
- `src/lib/monthly-reports.ts`
- `src/lib/batch-profitability.ts`

Surveiller en review :
- agregations couteuses
- exactitude des montants
- coherence entre page, PDF et export

### Subscriptions / payments / admin

Responsabilite :
- abonnement
- credits IA
- paiements manuels et checkout
- webhooks et surfaces admin

Points d'entree :
- `src/actions/subscriptions.ts`
- `src/lib/subscription-lifecycle.ts`
- `src/lib/subscription-rules.ts`
- `src/lib/payments.ts`
- `app/admin/`
- `app/api/payments/`
- `app/api/subscriptions/payments/`
- `app/api/admin/`

Surveiller en review :
- idempotence
- transitions d'etat abonnement
- rate limiting
- erreurs webhook
- traces `requestId`

### Plateforme / exploitation

Responsabilite :
- environnement
- Prisma et migrations
- observabilite
- docs d'exploitation
- CI et runbooks

Points d'entree :
- `src/lib/env.ts`
- `src/lib/logger.ts`
- `src/lib/request-security.ts`
- `src/lib/rate-limit.ts`
- `prisma/schema.prisma`
- `prisma/migrations/`
- `.github/workflows/ci.yml`
- `docs/`

Surveiller en review :
- compatibilite env
- migrations destructives
- couverture documentaire
- securite des endpoints sensibles

## Zones transverses

Certaines modifications demandent automatiquement une double lecture :

- changement `prisma/schema.prisma`
  relire domaine + plateforme
- changement `src/lib/permissions.ts` ou `src/lib/auth.ts`
  relire auth + domaine touche
- changement `src/lib/monthly-reports.ts` ou export PDF
  relire commerce/rapports + plateforme si impact perf
- changement route paiement ou webhook
  relire subscriptions/payments + plateforme

## Revue recommandee par type de ticket

- bug multi-tenant
  auth / organisation active / permissions
- bug dashboard lot
  elevage coeur
- bug rapport ou chiffre
  commerce / finances / rapports
- bug paiement, checkout, webhook
  subscriptions / payments / admin
- bug deploy, env, cron, logs
  plateforme / exploitation

## Decision pratique

Si un ticket n'a pas de domaine clair :

- choisir le domaine du symptome visible
- puis verifier les dependances transverses avant merge
