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
- mortalite, alimentation, eau, temperature (auto via Open-Meteo), humidite et observations (vocales via Cloudinary)
- historique structure pour mieux comprendre ce qui se passe dans l'elevage
- mode hors ligne V1 avec mise en file locale et resynchronisation automatique au retour du reseau

### Production

- suivi de la production d'oeufs
- consolidation des donnees de performance
- indicateurs utiles pour mieux lire le rendement

### Vue Business

- vue transverse de pilotage global reservee au plan `Business`
- synthese de situation en haut de page avec niveau de gravite, score exploitation et priorite d'action
- KPI consolides exploitation : chiffre d'affaires, couts, marge, mortalite globale, lots a risque, stocks critiques
- priorisation des signaux existants pour aider a decider plus vite
- comparaison des lots actifs avec statut global de pilotage et lecture plus dirigeant
- recommandations deterministes construites a partir des risques deja calcules, hierarchisees comme un plan d'action
- export Business consolide `Excel / CSV`

### Stock et ventes

- suivi du stock d'aliments et de medicaments
- creation d'articles de stock aliment et medicament directement dans le module stock
- alimentation du stock depuis les achats fournisseur quand la marchandise est recue
- prediction de rupture stock sur 14 jours pour les plans `Pro` et `Business`
- tendance predictive `S'ameliore / Stable / Se degrade` sur les stocks les plus sensibles
- enregistrement des ventes
- meilleure visibilite sur les mouvements et les sorties
- creation de ventes disponible hors ligne en V1 avec synchro differee

### Finances

- suivi des achats fournisseur, depenses et revenus
- enregistrement des paiements fournisseur et du reste a payer
- separation claire entre `Achats fournisseur` et `Depenses` pour eviter les doublons
- lecture plus simple des couts par lot
- analyse de la rentabilite pour savoir ce qui marche vraiment
- affichage d'un `Prix minimum de vente` pour aider a savoir a partir de quel niveau vendre un poulet sans perdre d'argent
- projection predictive de la marge finale des lots actifs pour les plans `Pro` et `Business`
- creation de depenses disponible hors ligne en V1 avec synchro differée

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
- prediction du risque mortalite sur 7 jours pour les plans `Pro` et `Business`
- vaccinations et traitements disponibles hors ligne en V1 avec synchro differée

### Intelligence Collective (Phase A)

- a chaque cloture d'un lot, un snapshot anonymise est genere automatiquement et verse dans un pool collectif
- aucune donnee identifiable : pas d'organizationId, pas de ferme, pas d'eleveur — uniquement les metriques agregees du lot
- benchmark collectif progressif : l'analyse IA compare automatiquement le lot aux lots reels similaires du reseau (race + region + saison)
- strategie de fallback : si la donnee precise manque, le systeme elargit la comparaison (race seule, puis type de lot global)
- le benchmark collectif est injecte dans chaque analyse GPT/Claude a la place des seuils codes en dur
- un cron nocturne alimente le pool avec les lots historiques et logue les statistiques du pool
- boucle de feedback prevue : `RecommendationFeedback` permet de valider si un conseil a ete suivi et d'ajuster la confiance des patterns appris

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

### Gratuit - 0 FCFA

Pour decouvrir SunuFarm sans engagement. Inclut 1 ferme, 1 lot actif, la saisie journaliere complete et une lecture simplifiee du lot avec apercus partiels.

### Starter - 3 500 FCFA / mois

Pour organiser l'exploitation au quotidien. Inclut les lots illimites, les ventes, depenses, stock basique, historique complet et export PDF avec watermark.

### Pro - 8 000 FCFA / mois

Notre offre recommandee pour les elevages qui veulent proteger leur marge. Inclut en plus :

- rentabilite reelle par lot et prix minimum de vente
- alertes actionnables sur mortalite, aliment et stock
- prediction de rupture stock sur 14 jours
- prediction risque mortalite sur 7 jours
- projection marge finale
- export PDF sans watermark

### Business - 20 000 FCFA / mois

Pour les structures multi-sites ou les equipes de production qui ont besoin d'un pilotage global. Inclut tout le plan Pro, plus :

- fermes et batiments en nombre illimite
- dashboard global cross-fermes avec synthese dirigeant
- signaux prioritaires et recommandations de pilotage
- gestion d'equipe, roles et permissions par module
- export Business consolide Excel / CSV

## Instrumentation produit et funnel de conversion

SunuFarm dispose d'une couche d'instrumentation interne pour mesurer le comportement des utilisateurs face aux fonctionnalites premium et optimiser la conversion.

### Evenements traces

| Evenement | Declencheur |
|---|---|
| `paywall_viewed` | Affichage d'un paywall (7 surfaces : profitabilite, mortalite, marge, historique, limite lot, rapports, business, equipe, fermes) |
| `pricing_page_visited` | Visite de `/pricing` avec contexte d'origine (`from=`) |
| `pricing_cta_clicked` | Clic sur un bouton "Choisir plan" via la route de tracking |
| `subscription_payment_requested` | Soumission d'une demande de paiement par l'owner |
| `subscription_activated` | Activation du plan (user confirm / admin direct / admin Wave) |
| `export_launched` | Telechargement d'un rapport (PDF batch, mensuel, Business Excel/CSV) |
| `alert_action_clicked` | Clic sur une action depuis la cloche de notifications |

### Funnel mesurable

```
paywall_viewed → pricing_page_visited → pricing_cta_clicked → subscription_payment_requested → subscription_activated
```

Chaque etape conserve le contexte d'origine (`from`, `surface`, `entitlement`) pour identifier les paywalls qui convertissent le mieux et les points de friction reels.

### Architecture

- Table `analytics_events` (PostgreSQL, append-only)
- `src/lib/analytics.ts` — `track()` fire-and-forget, erreurs avalees, accessible uniquement cote serveur
- `src/actions/analytics.ts` — Server Action pour les evenements client (alertes NotificationDropdown)
- `app/api/track/pricing-cta/route.ts` — route redirect qui trace le clic CTA puis redirige vers WhatsApp, sans JavaScript client
- `docs/analytics/funnel-queries.sql` — 7 requetes SQL pret a l'emploi pour analyser le funnel, les taux de conversion par surface, le drop-off par etape et la coherence des donnees

## Pourquoi SunuFarm est different

- adapte a l'Afrique francophone
- pense pour les realites de l'elevage, pas pour un modele generique
- simple a prendre en main
- moderne dans l'experience utilisateur
- concu comme un vrai produit SaaS, avec vision long terme
- **apprend du terrain** : les donnees reelles des exploitations enricissent progressivement les benchmarks et les seuils d'alerte — le systeme devient plus pertinent a chaque lot ferme
- **intelligence collective et non individuelle** : les conseils se basent sur ce que font vraiment les meilleurs elevages, pas sur des regles theoriques

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
- Cloudinary (Memoire Medias)
- Open-Meteo (Climatologie)

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

- Firebase sert uniquement de canal push — Prisma/PostgreSQL restent la source de verite
- la table `UserPushDevice` stocke les tokens FCM (migration `20260330173000`)
- renseigner cote serveur (requis pour l'envoi FCM depuis le cron) :
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY` — valeur complete issue du fichier de cle de service JSON, avec les headers PEM : `-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n` sur une seule ligne avec des `\n` litteraux sur Vercel
- renseigner cote client web (requis pour generer le token FCM dans le navigateur) :
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
  - `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
- si les 3 variables serveur sont absentes, l'envoi push est silencieusement desactive (pas d'erreur)
- le cron `/api/cron/notifications` requiert `CRON_SECRET` en production, sinon toutes les requetes retournent 401
- le cron `/api/cron/collective-intelligence` tourne a 3h du matin (vercel.json) et assure le backfill du pool de snapshots anonymises + logue les stats du pool
- autoriser les notifications dans le navigateur pour enregistrer le device — le bouton disparait une fois le device enregistre avec succes
- les notifications push ciblent les membres SUPER_ADMIN, OWNER et MANAGER de chaque organisation
- les evenements admin de paiement et abonnement creent aussi des notifications in-app/push pour les SUPER_ADMIN
- le bouton "Declencher les notifications" dans `/admin` permet de tester le cycle complet sans attendre le cron
- la cloche dans le header affiche les notifications en temps reel avec lecture et archivage
- les notifications intelligentes prioritaires (S57) :
  - Rappels de vaccination : alerte J-1 (preparation) et Jour J (execution si non fait)
  - Suivi des creances : alerte automatique le jour de l'echeance des factures de vente impayees
  - Alerte mortalite critique : push instantane aux Owners/Managers des que la mortalite depasse 2% (creation ou correction)
- recuperation meteo terrain : correction du conflit de parametres Open-Meteo et arrondi des coordonnees (V1.1)

Mode hors ligne V1 :

- l'application peut maintenant rouvrir des ecrans critiques hors ligne apres une premiere visite online, grace au service worker et a un cache local IndexedDB
- pages critiques couvertes en priorite :
  - `Saisie journaliere`
  - `Sante`
  - `Stock`
  - `Nouvelle vente`
  - `Oeufs`
  - `Achats fournisseur`
- references locales disponibles selon les modules : lots actifs, stocks aliment / medicaments, clients, fournisseurs, fermes et historiques recents
- les actions metier sont stockees localement dans le navigateur puis rejouees automatiquement au retour du reseau
- flux de creation couverts en V1 :
  - `Saisie journaliere`
  - `Vaccinations`
  - `Traitements`
  - `Depenses`
  - `Ventes`
  - `Mouvements de stock`
  - `Production d'oeufs`
  - `Achats fournisseur`
- un panneau de synchronisation unifie affiche les elements en attente, les erreurs, permet une resynchronisation globale ou par module et des actions `Retenter` / `Supprimer` par element
- une couche optimiste locale affiche immediatement certaines saisies hors ligne avec badge `En attente`
- la page `/offline` sert de hub terrain avec etat reseau, organisation active, compteurs de sync, raccourcis utiles et dernieres ressources locales connues
- les flux offline critiques utilisent maintenant une `clientMutationId` persistée cote serveur pour limiter les doublons lors d'un rejeu apres reconnexion
- le perimetre V1 couvre uniquement la creation hors ligne, pas encore l'edition hors ligne, l'upload audio/image hors ligne ni la resolution avancee de conflits

Prediction de rupture stock V1 :

- disponible sur le module `Stock` pour les plans `Pro` et `Business`
- calcule une estimation de rupture sur une fenetre glissante de 14 jours a partir des mouvements de sortie
- affiche un badge de risque par article avec date estimee de rupture
- persiste des snapshots quotidiens (`PredictiveSnapshot`) pour suivre l'evolution
- expose une tendance simple `S'ameliore / Stable / Se degrade`
- remonte les cas critiques dans l'admin et dans les notifications serveur

Prediction mortalite V1 :

- disponible sur la page detail d'un lot actif pour les plans `Pro` et `Business`
- calcule un score de risque sur 7 jours a partir de la mortalite recente, de son acceleration, des traitements actifs, des retards vaccinaux et des saisies manquantes
- affiche une carte predictive avec score, resume des signaux et tendance `S'ameliore / Stable / Se degrade`
- persiste aussi ses snapshots quotidiens dans `PredictiveSnapshot` pour suivre l'evolution du risque
- remonte uniquement les cas critiques dans les notifications serveur pour limiter le bruit

Projection marge finale V1 :

- disponible sur la page detail d'un lot actif pour les plans `Pro` et `Business`
- projette le chiffre d'affaires, le cout total, le profit et le taux de marge final a partir des ventes, depenses, donnees journalieres et d'un benchmark interne de lots comparables
- affiche une carte predictive avec statut `Favorable / Fragile / Negatif`, explications principales et tendance simple de marge
- persiste ses snapshots quotidiens dans `PredictiveSnapshot` pour suivre les derives de rentabilite
- remonte uniquement les cas critiques dans les notifications serveur pour signaler les lots qui se dirigent vers une marge negative

Prix minimum de vente V1 :

- disponible dans la carte `Rentabilite` sur la page detail d'un lot pour les plans `Pro` et `Business`
- calcule un prix moyen minimum par sujet vivant pour couvrir les couts engages sur le lot
- donne un repere simple et directement exploitable en fin de cycle pour negocier ou arbitrer une vente
- s'appuie sur les couts du lot et l'effectif vivant estime, avec l'hypothese MVP `effectif vivant = effectif d'entree - mortalite`

Vue Business V1 :

- disponible sur la page `/business` pour le plan `Business`
- consolide les signaux existants de stock, mortalite et marge au niveau de l'organisation active
- affiche une lecture dirigeant avec KPI exploitation, risques prioritaires, comparaison des lots actifs et recommandations metier deterministes
- reutilise les predictions et tendances deja calculees sans dupliquer la logique metier des modules existants

Business - polissage produit :

- la page `Business` met maintenant en avant une synthese globale de situation avec gravite, score exploitation et action prioritaire
- les KPI et sections critiques sont ecrits dans une logique de verdict et de decision, pas seulement de description
- les messages d'upgrade et la page `Abonnement` presentent plus clairement la valeur Business :
  - vue globale exploitation
  - signaux prioritaires
  - recommandations dirigeant
  - export Business consolide
  - multi-fermes, equipe et exports avances

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
