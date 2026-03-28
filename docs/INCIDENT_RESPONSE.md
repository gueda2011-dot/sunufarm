# Incident Response

## Objectif

Fournir une reponse minimale, rapide et repetable quand SunuFarm a un incident en production.

Ce document ne remplace pas un outil d'astreinte complet.
Il donne la marche a suivre la plus simple avec les garde-fous deja presents dans le projet.

## Definition rapide

Traiter comme incident tout probleme qui touche au moins un de ces points :

- connexion impossible
- dashboard ou ecrans coeur indisponibles
- erreurs API repetees
- exports PDF / Excel / CSV cassés
- paiements ou webhooks bloqués
- notifications automatiques non executees
- suspicion de mauvaise organisation active ou fuite de droits

## Priorites

### P1

- service largement indisponible
- perte ou corruption de donnees suspectee
- faille de securite suspectee
- paiements bloques a grande echelle

### P2

- une fonctionnalite coeur est cassée mais le reste du produit fonctionne
- erreurs repetees sur exports, paiements ou notifications

### P3

- anomalie limitee, contournable, sans impact large

## Premiere reponse

1. Confirmer l'incident avec un symptome concret.
2. Noter l'heure de debut supposee.
3. Identifier si l'impact est global ou limite a une organisation.
4. Geler toute action risquee tant que la cause est inconnue :
   - pas de migration improvisee
   - pas de restauration directe sans verification
   - pas de modification de secrets sans trace

## Sources de verite a verifier

### Admin SunuFarm

- page `/admin`
- section sante applicative
- backlog paiements
- transactions techniques stale
- erreurs webhook recentes

### Logs serveur

Chercher les evenements structures par `requestId`, en priorite :

- `reports.monthly.failed`
- `reports.batch.failed`
- `payments.webhook.processing_failed`
- `subscriptions.payments.failed`
- `subscriptions.payments.confirm.failed`
- `subscriptions.payments.reject.failed`
- `admin.payments.confirm.failed`
- `admin.payments.reject.failed`
- `admin.subscriptions.failed`
- `notifications.cron_failed_for_organization`

### Base de donnees

- verifier la connectivite
- verifier que les migrations attendues sont presentes
- verifier les tables critiques si corruption ou absence de donnees suspectee

## Diagnostic initial

### Si l'erreur est liee a une route API

1. Recuperer le `code` et le `status` JSON.
2. Recuperer le `requestId` si disponible dans les logs.
3. Distinguer :
   - erreur d'entree (`INVALID_JSON`, `INVALID_INPUT`)
   - refus metier (`FORBIDDEN`, `MODULE_ACCESS_DENIED`, `PLAN_UPGRADE_REQUIRED`)
   - erreur technique (`*_FAILED`, `TECHNICAL_ERROR`)

### Si l'erreur est liee aux paiements

1. Verifier la configuration env :
   - `WAVE_API_KEY`
   - `WAVE_WEBHOOK_SECRET`
   - `PAYMENT_WEBHOOK_SECRET`
2. Verifier les logs webhook.
3. Verifier dans `/admin` :
   - paiements en attente
   - transactions techniques stale

### Si l'erreur est liee aux notifications

1. Verifier `CRON_SECRET`
2. Verifier `vercel.json`
3. Tester manuellement le cron si necessaire
4. Verifier si l'email est completement configure :
   - `RESEND_API_KEY`
   - `MAIL_FROM`

### Si l'erreur est liee a l'organisation active ou aux permissions

1. Verifier le cookie `sunufarm_active_org`
2. Verifier le membership de l'utilisateur
3. Verifier les permissions module et, si besoin, les droits par ferme

## Mitigation rapide

### Si une integration optionnelle est en panne

- preferer un fallback manuel quand il existe
- exemples :
  - paiements admin via `/admin`
  - digest email desactive mais notifications in-app maintenues

### Si une route critique casse pour tous

- limiter le trafic si possible sur la surface fautive
- eviter les operations admin lourdes tant que la cause n'est pas comprise
- rollback de code seulement si la regression est clairement identifiee

### Si la base est suspectee

- arreter les operations destructives
- verifier `npx prisma migrate status`
- preparer un plan de restauration via `docs/BACKUP_RESTORE.md`

## Restauration

Si une restauration est necessaire :

1. Suivre `docs/BACKUP_RESTORE.md`
2. Restaurer d'abord sur une cible de verification si possible
3. Verifier :
   - `npx prisma migrate status`
   - `npm run test`
   - `npm run build`
4. Rejouer la checklist produit minimale avant reouverture

## Retour au service

Avant de considerer l'incident clos :

1. Verifier le parcours touche
2. Verifier qu'aucune erreur critique recente ne continue dans les logs
3. Verifier la page admin et la sante applicative
4. Verifier les endpoints sensibles concernes

## Post-incident minimal

Noter au minimum :

- date et heure
- symptome
- impact reel
- cause racine connue ou supposee
- action corrective
- suivi necessaire dans la roadmap ou les tests

## Liens utiles

- `docs/OPERATIONS.md`
- `docs/BACKUP_RESTORE.md`
- `docs/NON_REGRESSION_MATRIX.md`
- `docs/SCALABILITY_ROADMAP.md`
