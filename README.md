# SunuFarm

## Pilotez votre ferme avicole comme une entreprise

SunuFarm est un logiciel SaaS qui aide les elevages avicoles a mieux suivre leurs lots, leurs couts, leurs ventes et leur rentabilite, avec une approche simple, moderne et adaptee au terrain.

## Vision produit

SunuFarm existe pour aider les eleveurs a sortir d'une gestion manuelle, dispersee et difficile a piloter.

Dans beaucoup d'exploitations, les informations sont encore notees sur papier, dans WhatsApp, dans Excel ou simplement gardees en tete. Le resultat est souvent le meme :

- peu de visibilite sur les pertes
- difficulte a savoir si un lot est rentable
- decisions prises trop tard
- pilotage financier imprecis

Notre ambition est simple : donner aux eleveurs un outil clair pour gerer leur activite avec plus de rigueur, plus de visibilite et plus de serenite.

## Valeur pour l'eleveur

Avec SunuFarm, l'eleveur peut :

- suivre la rentabilite reelle de ses lots
- voir rapidement ou se trouvent les pertes
- mieux anticiper ses besoins en stock
- centraliser ses donnees de production, ventes et depenses
- prendre de meilleures decisions au bon moment

Concretement, SunuFarm aide a transformer une exploitation avicole en activite mieux pilotee, plus lisible et plus rentable.

## Fonctionnalites principales

### Lots

- creation et suivi des lots d'elevage
- suivi de l'effectif, de l'age et de l'evolution du cycle
- vision claire par lot pour mieux comparer les performances

### Saisie journaliere

- enregistrement quotidien des donnees terrain
- mortalite, alimentation, eau, temperature, humidite et observations
- historique structure pour mieux comprendre ce qui se passe dans l'elevage

### Production

- suivi de la production d'oeufs
- consolidation des donnees de performance
- indicateurs utiles pour mieux lire le rendement

### Stock et ventes

- suivi du stock d'aliments et de medicaments
- creation d'articles de stock aliment et medicament directement dans le module stock
- alimentation du stock depuis les achats fournisseur quand la marchandise est recue
- enregistrement des ventes
- meilleure visibilite sur les mouvements et les sorties

### Finances

- suivi des achats fournisseur, depenses et revenus
- enregistrement des paiements fournisseur et du reste a payer
- separation claire entre `Achats fournisseur` et `Depenses` pour eviter les doublons
- lecture plus simple des couts par lot
- analyse de la rentabilite pour savoir ce qui marche vraiment

### Parcours achats et stock

- `Achats fournisseur` sert a enregistrer une commande fournisseur structuree
- un achat peut etre paye partiellement ou totalement, avec mise a jour du solde restant
- `Depenses` sert aux autres sorties d'argent qui ne passent pas par un achat fournisseur
- `Stock` sert a creer les articles de stock qui recevront ensuite les achats
- l'envoi au stock se fait ligne par ligne depuis un achat fournisseur pour garder une trace propre des mouvements

### Sante animale

- suivi des traitements et vaccinations
- meilleure tracabilite sanitaire
- alertes et historique plus faciles a exploiter

## Cas d'usage concret

Un eleveur demarre un nouveau lot de poulets de chair.

1. Il cree le lot dans SunuFarm avec la date d'entree, l'effectif et le cout d'achat.
2. Chaque jour, son equipe saisit la mortalite, l'aliment consomme, l'eau et les observations.
3. Il suit l'evolution du lot et repere rapidement une hausse anormale des pertes ou un besoin en stock.
4. Il enregistre ses depenses, ses achats et ses ventes au fur et a mesure.
5. A la fin du cycle, il consulte ses rapports et voit clairement :
   - combien le lot a coute
   - combien il a rapporte
   - s'il a ete rentable ou non
   - ou se situent les principaux ecarts

Au lieu d'attendre la fin pour "sentir" si le lot a bien marche, il peut piloter pendant le cycle.

## Cible

SunuFarm s'adresse en priorite :

- aux petits elevages avicoles
- aux moyens elevages avicoles
- aux exploitations en croissance
- au marche de l'Afrique francophone

Le produit est pense pour des usages concrets, avec une interface simple et une logique adaptee aux realites du terrain.

## Pricing

### Basic - 5 000 FCFA / mois

Pour les petits elevages qui veulent digitaliser leur suivi de base.

### Pro - 10 000 FCFA / mois

Notre offre principale, concue pour les elevages qui veulent mieux piloter leur rentabilite et leur croissance.

### Business - 25 000 FCFA / mois

Pour les structures plus avancees qui ont besoin d'un pilotage plus complet et d'un meilleur niveau d'organisation.

## Pourquoi SunuFarm est different

- adapte a l'Afrique francophone
- pense pour les realites de l'elevage, pas pour un modele generique
- simple a prendre en main
- moderne dans l'experience utilisateur
- concu comme un vrai produit SaaS, avec vision long terme

SunuFarm ne cherche pas a etre un logiciel complexe de plus.
Il cherche a devenir l'outil de pilotage quotidien de l'eleveur.

## Stack technique

Le produit repose sur un socle moderne et robuste :

- Next.js
- React
- Prisma
- PostgreSQL
- NextAuth
- Tailwind CSS
- Vitest

## Installation et developpement

### Prerequis

- Node.js
- PostgreSQL

### Demarrage rapide

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Variables d'environnement principales :

- `SUNUFARM_DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `RESEND_API_KEY` et `MAIL_FROM` pour les emails transactionnels
- variables Firebase Cloud Messaging pour les push web/mobile si vous activez les alertes push

Configuration email Resend :

- verifier un domaine dans Resend avant d'envoyer a de vrais utilisateurs
- utiliser `MAIL_FROM` avec une adresse de ce domaine verifie
- ne pas utiliser `@resend.dev` en production, ce domaine est limite aux emails de test vers votre propre adresse

Configuration Firebase Cloud Messaging :

- garder Prisma et PostgreSQL comme source de verite, Firebase sert uniquement de canal push
- renseigner cote serveur :
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
- renseigner cote client web :
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
  - `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
- autoriser les notifications dans le navigateur pour enregistrer le device
- l'envoi push se branche sur le cron `/api/cron/notifications` et sur les notifications metier deja generees

Scripts utiles :

```bash
npm run dev
npm run lint
npm test
npm run build
```

## Call to action

### Demander une demo

Si vous souhaitez voir comment SunuFarm peut aider votre elevage a mieux piloter sa production et sa rentabilite, contactez-nous pour une demonstration.

### Tester le produit

SunuFarm est en construction active avec une vraie ambition produit : devenir l'outil de reference pour la gestion avicole en Afrique francophone.

---

SunuFarm aide les eleveurs a mieux voir, mieux decider et mieux gerer.
