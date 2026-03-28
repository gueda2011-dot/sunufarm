# Matrice De Non-Regresssion

## Objectif

Donner un socle simple avant merge et avant deploiement, sans retomber dans une verification manuelle trop lourde.

## Niveau 1 - Obligatoire Avant Merge

Executer systematiquement :

```bash
npm run lint
npm test
npm run build
```

Resultat attendu :

- les trois commandes passent
- la CI GitHub passe
- aucune migration locale non prise en compte n'est oubliee dans le diff

## Niveau 2 - Verification Ciblee Avant Merge

A rejouer seulement si le diff touche la zone concernee.

| Zone modifiee | Verification minimale |
|---|---|
| `src/lib/auth.ts`, `src/actions/organization-context.ts`, header, onboarding | connexion, redirection vers la bonne organisation, changement d'organisation active |
| `src/actions/batches.ts`, `app/(dashboard)/batches/**`, `src/lib/batch-*` | creation lot, affichage detail lot, numerotation lot |
| `src/actions/daily-records.ts`, `app/(dashboard)/daily/**`, `src/lib/daily-record-*` | creation saisie journaliere, verrouillage J+2, mise a jour autorisee ou refusee |
| `src/actions/subscriptions.ts`, `src/lib/subscription-*`, `src/lib/payments.ts` | demande de paiement, credits IA, activation d'essai ou abonnement |
| `src/actions/expenses.ts`, `src/actions/purchases.ts`, `src/actions/sales.ts`, `src/lib/permissions.ts` | refus de permission attendu, creation d'une ecriture financiere, audit log metier |
| `src/lib/monthly-report-*`, `app/api/reports/**`, `src/components/pdf/**` | export CSV, Excel et PDF, presence des KPI et du logo |
| `src/actions/notifications.ts`, `app/api/cron/notifications/route.ts`, `src/lib/notification-*` | generation de notifications in-app, digest email si configure, protection par `CRON_SECRET` |
| branding, `public/branding/**`, layouts | logo visible, favicon charge, rendu correct en mode clair et sombre |

## Niveau 3 - Verification Ciblee Avant Deploiement

A rejouer sur l'environnement cible :

1. Connexion et deconnexion
2. Onboarding et creation d'organisation
3. Creation ferme puis batiment
4. Creation lot
5. Saisie journaliere
6. Changement d'organisation active
7. Rapports CSV, Excel et PDF
8. Paiement ou administration abonnement si la fonctionnalite est active
9. Cron notifications si l'environnement doit envoyer des alertes automatiques

## Signaux De Blocage

Ne pas merger ou deployer si :

- une commande du Niveau 1 echoue
- une migration Prisma necessaire manque dans le diff
- une action sensible contourne `requireSession`, `requireOrganizationModuleContext` ou `requireRole`
- un export important ne peut plus etre genere
- un changement d'organisation active ne met plus a jour le cookie applicatif

## Etat Actuel Du Socle Automatique

Au moment de cette mise a jour, le socle automatique couvre deja :

- organisation active
- permissions pures et permissions en flux serveur
- creation lot
- saisie journaliere
- abonnements et credits IA
- formatters, dashboard view, monthly report view, batch metrics

Le prochain axe rentable, si on veut aller plus loin dans la Phase 4, est le calcul de rentabilite.
