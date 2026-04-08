# CLAUDE.md — Contexte Projet : SunuFarm

> **"Sunu"** signifie **"Notre"** en Wolof. SunuFarm = Notre Ferme.
> Ce fichier est le contexte permanent du projet. Il est chargé automatiquement par Claude Code
> à chaque session. Ne pas supprimer. Mettre à jour au fur et à mesure de l'avancement.
> Version : 2.0

---

## ⚙️ INSTRUCTIONS D'EXÉCUTION POUR CLAUDE CODE

### Règles de travail impératives

- **Travaille module par module** — ne génère jamais tout en une seule réponse
- **Crée tous les fichiers dans le répertoire courant du projet**, avec leur chemin exact indiqué
- **Génère des fichiers complets**, jamais de pseudo-code ou de placeholder vague
- **Respecte TypeScript strict** (`strict: true` dans tsconfig)
- **Ne casse jamais l'architecture existante** — relis les fichiers existants avant d'écrire
- **Commente uniquement quand c'est utile** (logique complexe, règle métier non évidente)
- **Valide les choix techniques** brièvement avant de coder
- **À chaque session**, commence par lire ce fichier + l'état d'avancement dans `PROGRESS.md`
- **Pas de code expérimental** — chaque ligne doit être prête pour la production
- **Architecture d'abord** — si un choix architectural est ambigu, pose la question avant de coder

### Identité technique du projet

```
Nom produit         : SunuFarm
Nom repo            : sunufarm
Nom base de données : sunufarm_db (prod) / sunufarm_dev (dev) / sunufarm_test (test)
Préfixe variables   : SUNUFARM_
Namespace npm       : @sunufarm/
Package name        : sunufarm
```

> Tout nom interne doit utiliser "sunufarm" : repo, DB, env vars, packages, namespaces.
> "SunuFarm" (PascalCase) uniquement pour les affichages utilisateur.

### Stack technique — versions exactes à respecter

```
Next.js 16.2       — App Router UNIQUEMENT, jamais Pages Router, Server Actions
TypeScript 5       — strict: true, no any sauf exception justifiée et commentée
Tailwind CSS 4     — utility-first, pas de CSS custom sauf exception documentée
shadcn/ui          — composants de base, à étendre sans modifier les fichiers ui/
React Hook Form    — tous les formulaires sans exception
Zod 4              — validation côté client ET serveur, schémas partagés dans /lib/validators
TanStack Query v5  — fetching et cache côté client
Prisma 7.5         — ORM, migrations, seed (generator: "prisma-client", config: prisma.config.ts)
PostgreSQL 15+     — base de données principale
NextAuth v5        — authentification
next-intl          — internationalisation (fr par défaut, architecture i18n dès le départ)
Resend             — emails transactionnels
react-pdf          — génération PDF rapports
xlsx / exceljs     — export Excel
recharts           — graphiques dashboard
React Native       — application mobile (phase V2)
Expo SDK 51+       — toolchain mobile (phase V2)
```

### Ordre d'exécution des étapes (ne pas sauter d'étape)

```
Étape 1  → Analyse fonctionnelle structurée
Étape 2  → Architecture globale + justifications
Étape 3  → Modélisation de données détaillée
Étape 4  → Roadmap MVP / V2 / V3
Étape 5  → Arborescence complète du projet
Étape 6  → Schéma Prisma complet
Étape 7  → Seeds de démonstration réalistes (données sénégalaises)
Étape 8  → Utilitaires, helpers, validations Zod, formatters FCFA
Étape 9  → Modules backend (server actions par domaine)
Étape 10 → Pages et vues frontend (mobile-first)
Étape 11 → Dashboards et KPI
Étape 12 → Rapports PDF et exports
Étape 13 → Refactoring, sécurité, optimisation
```

**Session 1** : Étapes 1-3 uniquement — analyse et architecture, zéro code, validation d'abord
**Session 2** : Étapes 4-6 — roadmap + arborescence + schéma Prisma complet
**Sessions suivantes** : Un module fonctionnel complet à la fois

---

## 1. VISION PRODUIT

**Nom** : SunuFarm
**Tagline** : *Gérez votre ferme. Gagnez plus.*
**Positionnement** : L'ERP avicole de référence pour l'Afrique francophone

SunuFarm est une **marque forte et évolutive**, pensée pour devenir la solution de référence
de la gestion avicole en Afrique. Chaque décision de design, de UX et de code doit refléter
cette ambition : un produit professionnel, simple, et qui inspire confiance aux éleveurs africains.

### Plateformes

| Plateforme | Stack | Phase |
|---|---|---|
| Web dashboard + saisie terrain | Next.js 15 (PWA responsive) | MVP |
| Application mobile native | React Native + Expo | V2 |

### Focus géographique

| Phase | Marché |
|---|---|
| MVP | Sénégal — FCFA, français, contexte local |
| V2 | Afrique de l'Ouest francophone (Côte d'Ivoire, Mali, Burkina...) |
| V3 | Afrique anglophone + multi-devises complet |

---

## 2. OBJECTIF CENTRAL — PRINCIPE DIRECTEUR

> **"Chaque fonctionnalité doit aider l'éleveur à gagner plus d'argent ou à perdre moins."**

Ce principe gouverne toutes les décisions produit :

- Si une fonctionnalité n'aide pas à mesurer, optimiser ou augmenter la rentabilité → la simplifier ou la reporter
- Les KPI financiers sont **toujours visibles** sur le dashboard principal
- Chaque lot affiche sa **rentabilité en temps réel** (recettes - charges)
- Les alertes sont prioritairement orientées **risque financier** (mortalité, surconsommation, stock bas)
- L'interface évite toute complexité qui ne génère pas de valeur terrain

---

## 3. ARCHITECTURE MULTI-TENANT — RÈGLE ABSOLUE

SunuFarm est **multi-tenant dès le premier commit**. Aucun mode mono-tenant n'existe.

### Modèle de tenancy

```
Organization (tenant racine)
  └── plusieurs Farm
        └── plusieurs Building
              └── plusieurs Batch
                    └── toutes les données opérationnelles
```

### Règles d'isolation — non négociables

```typescript
// ❌ ABSOLUMENT INTERDIT — requête sans isolation tenant
const farms = await prisma.farm.findMany()

// ✅ OBLIGATOIRE — toujours filtrer par organizationId
const farms = await prisma.farm.findMany({
  where: { organizationId: session.user.organizationId }
})
```

**Les 5 règles d'or multi-tenant :**
1. Chaque modèle opérationnel a un champ `organizationId` (direct ou via relation)
2. Chaque Server Action commence par valider `organizationId` depuis la session
3. Chaque requête Prisma inclut `organizationId` dans le `where`
4. Un middleware vérifie l'appartenance à l'organisation sur toutes les routes protégées
5. Les seeds créent plusieurs organisations pour tester l'isolation en développement

### Structure utilisateurs / organisations

```
User ──── UserOrganization ──── Organization
               │
               ├── role: OWNER | MANAGER | TECHNICIAN | DATA_ENTRY | ACCOUNTANT | VET | VIEWER
               └── farmPermissions: [{farmId, canRead, canWrite, canDelete}]
```

Un utilisateur peut appartenir à plusieurs organisations avec des rôles différents.
Un utilisateur peut avoir des permissions différentes par ferme au sein d'une même organisation.

---

## 4. PRIORITÉ ABSOLUE : EXPÉRIENCE MOBILE TERRAIN

> **La saisie journalière doit être complétée en moins de 30 secondes.**

### Principes UX terrain non négociables

| Règle | Détail |
|---|---|
| **Mobile-first** | Concevoir d'abord pour 375px de largeur, adapter ensuite pour desktop |
| **30 secondes max** | Écran saisie : 3 champs visibles (mortalité + aliment + eau) + 1 bouton |
| **Gros boutons** | Hauteur minimale 52px sur mobile, 44px sur desktop |
| **Formulaires courts** | Maximum 5 champs visibles par écran sur mobile |
| **Pas de scroll infini** | Pagination claire, action principale toujours visible sans scroll |
| **Feedback immédiat** | Toast de confirmation < 500ms après chaque saisie |
| **Optimistic UI** | Afficher le résultat avant la réponse serveur sur les saisies critiques |
| **Pas de modals sur mobile** | Utiliser des pages dédiées ou des bottom drawers |
| **Offline prévu** | Architecture permettant l'offline-first en V2 sans refonte majeure |

### Cible matérielle principale

```
Smartphone Android d'entrée de gamme
- RAM        : 2-3 Go
- Écran      : 5-6 pouces, 360-390px de largeur
- Connexion  : 3G / 4G instable, parfois coupée
- Navigateur : Chrome Android récent
```

### Optimisations techniques obligatoires

```
- Bundle JS < 200kb gzippé pour les pages terrain (saisie, lots)
- Images : format WebP, lazy loading, dimensions explicites
- Fonts : preload Inter, subset latin + latin-ext uniquement
- Pas d'animations lourdes sur mobile (respecter prefers-reduced-motion)
- Service Worker configuré dès le MVP (cache assets statiques au minimum)
- Viewport meta tag correct sur toutes les pages
- Touch targets : min 44×44px sur tous les éléments interactifs
```

---

## 5. FORMATAGE FINANCIER — FCFA

Toutes les données financières sont en **FCFA (XOF)** sans exception dans le MVP.

### Utilitaire obligatoire

```typescript
// src/lib/formatters.ts

// Formatage FCFA standard avec Intl.NumberFormat
export const formatFCFA = (amount: number): string => {
  return new Intl.NumberFormat('fr-SN', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
// Résultat : "125 000 FCFA"

// Formatage compact pour les dashboards (KPI cards)
export const formatFCFACompact = (amount: number): string => {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M FCFA`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K FCFA`
  return `${amount} FCFA`
}
// Résultats : "1.2M FCFA" / "125K FCFA" / "800 FCFA"

// Parser une saisie utilisateur en entier FCFA
export const parseFCFA = (value: string): number => {
  return parseInt(value.replace(/[^\d]/g, ''), 10) || 0
}
```

### Règles de stockage

```
- Tous les montants stockés en INTEGER en base (FCFA entiers, pas de centimes)
- Jamais de FLOAT ou DECIMAL pour les montants — risque d'arrondi inacceptable
- Exemple : 125000 en DB → "125 000 FCFA" à l'affichage
- Champ currency sur Organization (défaut: "XOF") pour l'évolution multi-devises
- Zod enforce : z.number().int().nonnegative() sur tous les champs montant
```

---

## 6. CONTEXTE TERRAIN — AFRIQUE / SÉNÉGAL

| Contrainte | Réponse technique |
|---|---|
| Connexion internet faible ou instable | Optimistic UI, retry automatique, Service Worker V2 |
| Profils non techniques | UX ultra simple, 1 action principale visible par écran |
| Smartphone Android bas de gamme | Bundle léger, images optimisées, pas de librairies lourdes |
| Monnaie FCFA | `formatFCFA()` partout, entiers en DB, aucune décimale |
| Contexte comptable local | OHADA simplifié, pas IFRS |
| Peu d'expérience numérique | Labels clairs, icônes + texte, messages d'erreur humains |
| Terrain = rapidité absolue | Saisie journalière < 30 secondes |
| Connectivité intermittente | Pas de blocage UX en cas de lenteur réseau |

**Langue** : Français obligatoire. Architecture i18n (next-intl) intégrée dès le MVP.
Ajout du Wolof et de l'Anglais prévu en V2 sans refonte de l'interface.

---

## 7. UTILISATEURS CIBLES ET RÔLES

| Rôle | Description | Accès |
|---|---|---|
| `SUPER_ADMIN` | Administrateur plateforme SunuFarm | Tout + gestion organisations |
| `OWNER` | Propriétaire de l'organisation | Accès total sur son organisation |
| `MANAGER` | Gestionnaire de ferme | Opérationnel complet sur sa/ses ferme(s) |
| `TECHNICIAN` | Technicien d'élevage terrain | Saisie + consultation lots |
| `DATA_ENTRY` | Agent de saisie | Saisie journalière uniquement |
| `ACCOUNTANT` | Comptable / financier | Finances + comptabilité uniquement |
| `VET` | Vétérinaire / conseiller technique | Santé + consultation lots |
| `VIEWER` | Lecteur | Consultation uniquement, aucune saisie |

Permissions fines par module ET par ferme.
Un `MANAGER` peut n'avoir accès qu'à une seule ferme au sein d'une organisation qui en possède dix.

---

## 8. MODULES FONCTIONNELS

### A. Administration générale
- Authentification (email/password + magic link, 2FA en V2)
- Gestion des utilisateurs et invitations par email
- Rôles et permissions par organisation et par ferme
- Gestion des organisations (multi-tenant isolé)
- Paramètres généraux (devise, langue, fuseau horaire, logo)
- Journal d'activité / audit logs complets

### B. Référentiel avicole
- Espèces (poulet de chair, pondeuse, pintade, dinde, caille...)
- Types d'élevage (chair, ponte, reproduction)
- Souches / races (Cobb 500, Ross 308, ISA Brown, Label Rouge...)
- Fournisseurs (poussins, aliments, médicaments)
- Clients (professionnels, revendeurs, particuliers)
- Types d'aliments (démarrage, croissance, finition, ponte)
- Types de médicaments et vaccins
- Catégories de dépenses
- Motifs de mortalité (maladie, accident, prédation, stress thermique...)
- Classifications qualité œufs (A, B, C, cassés, sales)

### C. Gestion des fermes et infrastructures
- Fermes (nom, localisation GPS, superficie, capacité totale)
- Bâtiments / poulaillers (dimensions, capacité, type ventilation)
- Équipements (mangeoires, abreuvoirs, état)
- Géolocalisation optionnelle
- Statut et état des infrastructures

### D. Gestion des lots ← CŒUR DU SYSTÈME
- Numéro de lot auto-généré (format : `SF-2024-001`)
- Type : chair / pondeuse / reproducteur
- Date entrée, âge calculé en temps réel
- Effectif initial, fournisseur, coût d'achat total et par sujet
- Affectation bâtiment
- Statut : `ACTIVE` | `CLOSED` | `SOLD` | `SLAUGHTERED`
- **Rentabilité en temps réel** (recettes - charges, marge %)
- Historique complet et immuable

### E. Saisie journalière ← ÉCRAN NUMÉRO 1 DU MVP
- Interface optimisée mobile : 3 champs + 1 bouton → < 30 secondes
- Mortalité du jour (nombre + motif optionnel)
- Aliment distribué (kg)
- Eau consommée (litres)
- Champs secondaires optionnels : température, humidité, poids, observations
- Effectif vivant recalculé automatiquement après chaque saisie
- KPI du jour affichés immédiatement (pas besoin de naviguer)
- Saisie modifiable jusqu'à J+1 uniquement (verrouillage automatique ensuite)

### F. Production d'œufs (lots pondeuses)
- Production journalière : total, commercialisables, cassés, sales, déclassés
- Taux de ponte calculé et affiché avec indicateur coloré
- Ramassage multi-passages par jour
- Stock d'œufs en temps réel
- Alerte si taux de ponte < seuil paramétrable

### G. Poulets de chair (lots chair)
- Suivi poids (pesées échantillon)
- GMQ et IC calculés automatiquement
- Estimation date prêt à l'abattage basée sur le poids cible
- Alerte lot prêt à la vente

### H. Santé animale
- Plan vaccinal par type de lot (modèles réutilisables)
- Calendrier vaccinal avec alertes de retard
- Traitements administrés (médicament + dose + durée)
- Incidents sanitaires
- Historique sanitaire par lot
- Stock médicaments et vaccins (avec dates de péremption)

### I. Gestion de stock
- Aliments, médicaments, consommables
- Entrées / sorties / inventaires
- Alertes stock bas (seuil = X jours de consommation estimée)
- Valorisation CMUP
- Traçabilité par mouvement horodaté

### J. Achats
- Fournisseurs
- Bons de commande
- Réceptions avec contrôle quantité
- Factures et paiements fournisseurs
- Solde dettes fournisseurs

### K. Ventes
- Clients
- Ventes de poulets (au kg ou à la pièce)
- Ventes d'œufs (par plateau ou caisse)
- Ventes de fientes
- Facturation et reçus imprimables
- Encaissements et créances clients

### L. Finances ← KPI TOUJOURS VISIBLES
- Dépenses par catégorie et par lot
- Recettes par type et par lot
- Caisse et banque (multi-comptes)
- **Rentabilité par lot** — calculée automatiquement, affichée en temps réel
- **Rentabilité par ferme** — agrégation des lots
- Coût de revient détaillé par lot
- Tableau de bord financier synthétique

### M. Comptabilité (V2)
- Plan de comptes OHADA simplifié
- Journal comptable automatique + manuel
- Balance et grand livre
- Export comptable CSV/Excel

### N. Ressources humaines (V2)
- Employés par ferme, fonctions, présences
- Rémunérations et paie simplifiée

### O. Maintenance (V2)
- Équipements, entretiens préventifs, pannes, coûts

### P. Reporting
- Dashboard global (multi-fermes, vue direction)
- Dashboard par ferme
- Dashboard par lot (complet avec historique)
- Export PDF (rapport de lot, rapport journalier, rapport financier)
- Export Excel / CSV sur toutes les listes
- Rapports périodiques automatiques (hebdo, mensuel)

### Q. Alertes et notifications
- Mortalité anormale (> seuil paramétrable)
- Baisse taux de ponte (< seuil)
- Stock aliment critique (< X jours)
- Retard vaccination (> 2 jours)
- Créances clients en retard (> 30 jours)
- Notifications in-app + email (Resend)
- Push mobile en V2 (Expo Notifications)

---

## 9. ROADMAP

### MVP — Critère de succès

> Un technicien peut gérer un lot complet (entrée → vente) en autonomie totale.
> La saisie journalière prend moins de 30 secondes sur un Android bas de gamme.

| Module | Priorité | MVP |
|---|---|---|
| Auth + utilisateurs + rôles | P0 | ✅ |
| Organisations + fermes + bâtiments | P0 | ✅ |
| Gestion des lots | P0 | ✅ |
| Saisie journalière mobile-first | P0 | ✅ |
| Production œufs | P0 | ✅ |
| **Rentabilité par lot (temps réel)** | P0 | ✅ |
| Dashboard principal + KPI | P0 | ✅ |
| Stock aliments simplifié | P1 | ✅ |
| Dépenses par lot | P1 | ✅ |
| Ventes simples | P1 | ✅ |
| Alertes in-app | P1 | ✅ |
| Rapports PDF (lot + journalier) | P1 | ✅ |
| Module santé basique | P2 | ✅ |
| Comptabilité OHADA | P3 | ❌ V2 |
| RH et paie | P3 | ❌ V2 |
| App mobile native | P2 | ❌ V2 |
| Mode offline-first | P2 | ❌ V2 |
| Multi-langue Wolof / Anglais | P3 | ❌ V2 |

### V2 — 3 mois après validation MVP terrain

- Application React Native + Expo (Android prioritaire)
- Mode offline avec synchronisation différée (IndexedDB + sync queue)
- Module santé avancé (calendrier vaccinal complet)
- Module achats et ventes complets avec facturation
- Notifications push mobile (Expo)
- RH simplifié
- Multi-langue (Wolof + Anglais)
- Comptabilité OHADA de base

### V3 — Long terme

- Multi-pays et multi-devises complètes
- BI avancé paramétrable
- API publique (intégrations tierces, capteurs IoT)
- Portail client
- Intelligence artificielle (prédiction mortalité, recommandations)
- Marketplace fournisseurs agréés

---

## 10. ARCHITECTURE TECHNIQUE

### Principes fondamentaux

```
Multi-tenant     : organizationId PARTOUT, isolation totale garantie par le code
Soft delete      : deletedAt sur Organization, Farm, Building, Batch, User
Audit logs       : AuditLog créé sur toute action create/update/delete métier
Timestamps       : createdAt + updatedAt sur TOUS les modèles sans exception
Permissions      : vérifiées côté SERVEUR uniquement, jamais seulement côté client
Validation       : Zod côté serveur ET client, schémas partagés dans /lib/validators
Erreurs          : gestion centralisée, messages en français, stack trace jamais exposée
Pagination       : cursor-based (pas offset) pour la scalabilité
Production-ready : pas de code expérimental, pas de TODO en production
```

### Structure des dossiers

```
sunufarm/                            ← racine du repo
├── CLAUDE.md                        ← ce fichier (contexte projet)
├── PROGRESS.md                      ← état d'avancement session par session
├── .env.local                       ← variables locales (jamais committé)
├── .env.example                     ← template complet des variables
├── prisma/
│   ├── schema.prisma                ← schéma unique, source de vérité
│   ├── migrations/                  ← migrations auto-générées par Prisma
│   └── seed.ts                      ← seeds avec données sénégalaises réalistes
├── src/
│   ├── app/                         ← Next.js 15 App Router
│   │   ├── (auth)/                  ← pages publiques : login, register, forgot-password
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/             ← routes protégées (layout avec sidebar)
│   │   │   ├── layout.tsx           ← layout : sidebar + header + session check + org check
│   │   │   ├── page.tsx             ← dashboard global
│   │   │   ├── farms/               ← gestion fermes et bâtiments
│   │   │   ├── batches/             ← liste et détail des lots + rentabilité
│   │   │   ├── daily/               ← saisie journalière (écran principal terrain)
│   │   │   ├── eggs/                ← production d'œufs
│   │   │   ├── stock/               ← gestion stock
│   │   │   ├── sales/               ← ventes
│   │   │   ├── purchases/           ← achats
│   │   │   ├── health/              ← santé animale
│   │   │   ├── finances/            ← finances et rentabilité
│   │   │   ├── reports/             ← rapports et exports
│   │   │   └── settings/            ← paramètres organisation et utilisateurs
│   │   ├── api/                     ← API routes (webhooks, exports PDF, etc.)
│   │   └── layout.tsx               ← root layout (fonts, providers, meta)
│   ├── components/
│   │   ├── ui/                      ← shadcn/ui — NE JAMAIS MODIFIER ces fichiers
│   │   ├── layout/                  ← Sidebar, Header, BottomNav (mobile), PageHeader
│   │   ├── forms/                   ← formulaires réutilisables (DailyRecordForm, etc.)
│   │   ├── tables/                  ← DataTable générique avec pagination cursor
│   │   ├── charts/                  ← wrappers recharts (MortalityChart, LayingChart...)
│   │   ├── kpi/                     ← KpiCard, KpiGrid, KpiBadge, KpiTrend
│   │   ├── alerts/                  ← AlertBanner, NotificationBell, AlertList
│   │   └── [module]/                ← composants spécifiques (BatchCard, FarmSelector...)
│   ├── lib/
│   │   ├── prisma.ts                ← client Prisma singleton
│   │   ├── auth.ts                  ← config NextAuth v5
│   │   ├── utils.ts                 ← utilitaires : cn(), slugify(), generateBatchNumber()
│   │   ├── formatters.ts            ← formatFCFA, formatDate, formatNumber, formatPercent
│   │   ├── kpi.ts                   ← toutes les formules KPI métier (pures, testables)
│   │   ├── permissions.ts           ← helpers vérification rôles et permissions
│   │   ├── audit.ts                 ← helper création audit logs
│   │   └── validators/              ← schémas Zod par domaine métier
│   │       ├── batch.ts
│   │       ├── daily-record.ts
│   │       ├── farm.ts
│   │       ├── sale.ts
│   │       ├── expense.ts
│   │       └── ...
│   ├── actions/                     ← Server Actions Next.js 15, un fichier par domaine
│   │   ├── auth.ts
│   │   ├── farms.ts
│   │   ├── buildings.ts
│   │   ├── batches.ts
│   │   ├── daily-records.ts
│   │   ├── eggs.ts
│   │   ├── stock.ts
│   │   ├── sales.ts
│   │   ├── purchases.ts
│   │   ├── expenses.ts
│   │   ├── health.ts
│   │   └── notifications.ts
│   ├── hooks/                       ← custom React hooks
│   │   ├── useOrganization.ts
│   │   ├── useFarm.ts
│   │   ├── useBatch.ts
│   │   └── ...
│   ├── types/                       ← types TypeScript globaux et re-exports Prisma
│   │   ├── index.ts
│   │   └── api.ts
│   └── constants/                   ← constantes métier
│       ├── kpi-thresholds.ts        ← seuils d'alerte (paramétrables en V2)
│       ├── batch-statuses.ts
│       └── roles.ts
├── public/
│   └── icons/                       ← PWA icons (192x192, 512x512)
└── [fichiers config]
    ├── next.config.ts
    ├── tailwind.config.ts
    ├── tsconfig.json
    └── ...
```

### Conventions de nommage

```
Composants React     → PascalCase.tsx         (BatchCard.tsx, DailyRecordForm.tsx)
Fichiers utilitaires → camelCase.ts            (formatters.ts, kpi.ts)
Dossiers             → kebab-case             (daily-records/, egg-production/)
Server Actions       → camelCase, par domaine  (createBatch, updateDailyRecord)
Schémas Zod          → camelCase + Schema     (createBatchSchema, dailyRecordSchema)
Types Prisma         → re-exportés as-is       (Batch, Farm, Organization)
Types custom         → interfaces explicites   (BatchWithKpi, FarmSummary)
Constantes           → UPPER_SNAKE_CASE       (DEFAULT_MORTALITY_THRESHOLD)
Variables env        → SUNUFARM_*             (SUNUFARM_DATABASE_URL)
```

---

## 11. MODÉLISATION DE DONNÉES — ENTITÉS CLÉS

### Entités principales

```
Organization        → tenant racine (1 par client/entreprise)
User                → compte utilisateur global plateforme
UserOrganization    → lien User ↔ Organization avec rôle + permissions fermes
Farm                → ferme (appartient à Organization)
Building            → bâtiment/poulailler (appartient à Farm)
Batch               → lot d'élevage (appartient à Building)
DailyRecord         → saisie journalière (appartient à Batch, 1 par jour par lot)
MortalityRecord     → mortalité détaillée (appartient à DailyRecord)
EggProductionRecord → production œufs journalière (appartient à Batch)
WeightRecord        → pesée échantillon (appartient à Batch)
TreatmentRecord     → traitement médicament administré (appartient à Batch)
VaccinationRecord   → vaccination réalisée (appartient à Batch)
VaccinationPlan     → modèle de plan vaccinal réutilisable
FeedStock           → stock aliment (appartient à Farm)
FeedMovement        → mouvement stock aliment (entrée/sortie/inventaire)
MedicineStock       → stock médicament (appartient à Farm)
Sale                → vente (appartient à Organization)
SaleItem            → ligne de vente (quantité, prix unitaire, produit)
Customer            → client (appartient à Organization)
Supplier            → fournisseur (appartient à Organization)
Purchase            → achat fournisseur (appartient à Organization)
PurchaseItem        → ligne d'achat
Expense             → dépense (liée à un Batch et/ou une Farm)
Invoice             → facture (vente ou achat)
Payment             → paiement (lié à Invoice)
Employee            → employé (appartient à Farm)
AuditLog            → log d'activité (userId + action + resourceId + before/after + timestamp)
Notification        → alerte (appartient à User dans Organization)
Breed               → race/souche (référentiel global)
Species             → espèce (référentiel global)
FeedType            → type d'aliment (référentiel global)
MortalityReason     → motif de mortalité (global + custom par org)
```

### Règles métier critiques

```
MULTI-TENANT (règle absolue)
- Chaque modèle opérationnel a organizationId direct ou via relation parente
- Jamais de requête Prisma sans where.organizationId dans une Server Action

LOTS
- Numéro unique auto : SF-{YYYY}-{NNN} avec padding (ex: SF-2024-047)
- Effectif vivant = effectif initial - SUM(mortalités) - SUM(réformes) [calculé, jamais stocké]
- Statut immuable une fois passé à CLOSED / SOLD / SLAUGHTERED
- Saisie journalière : modifiable jusqu'à J+1 minuit uniquement (sauf rôle MANAGER+)
- 1 seul DailyRecord par (batchId, date) — contrainte unique Prisma

CALCULS KPI (toujours calculés à la volée, jamais stockés)
- Taux de mortalité     = (total morts / effectif initial) × 100
- Effectif vivant       = effectif initial - SUM(mortalités) - SUM(réformes)
- Taux de ponte         = (œufs produits / effectif pondeuses vivantes) × 100
- GMQ                   = (poids moyen actuel - poids entrée moyen) / âge en jours
- IC                    = aliment total consommé (kg) / gain total poids (kg)
- Rentabilité lot       = recettes lot - charges lot
- Marge %               = (rentabilité / charges) × 100

FINANCES
- Montants : INTEGER en base (FCFA, pas de centimes)
- Jamais FLOAT ou DECIMAL pour les montants
- Zod : z.number().int().nonnegative() sur tous les champs montant
- Devise : champ currency sur Organization, défaut "XOF"

INTÉGRITÉ
- Soft delete sur : Organization, Farm, Building, Batch, User (champ deletedAt)
- Audit log systématique : create/update/delete sur toutes les entités métier
- Timestamps createdAt + updatedAt sur TOUS les modèles Prisma
- Index sur : organizationId, batchId, date (pour les requêtes fréquentes)
```

---

## 12. KPI ET FORMULES MÉTIER

| KPI | Formule | Unité | Alerte si |
|---|---|---|---|
| Taux de mortalité | (morts / effectif initial) × 100 | % | > 0.5%/jour |
| Taux de survie | 100 - taux mortalité | % | — |
| Effectif vivant | initial - morts - réformes | sujets | — |
| GMQ | (poids moyen J - poids moyen J0) / âge | g/jour | < standard race |
| IC | aliment consommé total / gain poids total | kg/kg | > standard race |
| Taux de ponte | (œufs / pondeuses vivantes) × 100 | % | < 70% |
| Taux cassés | (cassés / total œufs) × 100 | % | > 3% |
| Conso/sujet/jour | aliment distribué / effectif vivant | g/sujet | > standard |
| Coût par sujet | charges totales lot / effectif initial | FCFA | — |
| Revenu par sujet | recettes lot / sujets vendus | FCFA | — |
| Marge brute | recettes - (aliment + poussins + médic) | FCFA | < 0 |
| Marge nette | marge brute - charges fixes | FCFA | < 0 |
| Rentabilité % | (marge nette / charges totales) × 100 | % | < 10% |

### Seuils d'alerte MVP

```typescript
// src/constants/kpi-thresholds.ts
export const KPI_THRESHOLDS = {
  MORTALITY_DAILY_ALERT_PCT: 0.005,   // 0.5% de mortalité par jour → alerte rouge
  LAYING_RATE_WARNING_PCT: 0.70,       // Taux de ponte < 70% → alerte orange
  FEED_STOCK_DAYS_WARNING: 3,          // Stock < 3 jours de conso → alerte stock
  VACCINATION_DELAY_DAYS: 2,           // Retard > 2 jours → alerte sanitaire
  RECEIVABLE_WARNING_DAYS: 30,         // Créance > 30 jours → alerte financière
} as const
```

---

## 13. UX/UI — DIRECTIVES

### Design system SunuFarm

```
Couleur principale  : #16a34a (green-600) — nature, croissance, confiance
Couleur secondaire  : #ea580c (orange-600) — alertes, attention
Couleur danger      : #dc2626 (red-600) — erreurs critiques
Couleur info        : #2563eb (blue-600) — information
Fond principal      : #ffffff
Fond secondaire     : #f9fafb (gray-50)
Texte principal     : #111827 (gray-900)
Texte secondaire    : #6b7280 (gray-500)
Typographie         : Inter (Google Fonts, subset latin)
Border radius       : 12px sur cards — moderne, pas trop corporate
Ombres              : shadow-sm uniquement — interface propre et légère
```

### Dashboard principal — structure

```
┌──────────────────────────────────────────────────────┐
│ 🌿 SunuFarm    [Ferme: Dakar Nord ▼]    [🔔] [User] │
├───────────┬──────────────────────────────────────────┤
│           │  💰 Revenus  💸 Dépenses  📈 Marge  🐓 Lots │  ← KPI row
│ Dashboard │──────────────────────────────────────────┤
│ Lots      │  ⚠️ 2 alertes actives (si > 0)           │
│ Saisie    │──────────────────────────────────────────┤
│ Œufs      │  Lots actifs (liste + rentabilité live)   │
│ Stock     │──────────────────────────────────────────┤
│ Ventes    │  📊 Mortalité 30 jours    🥚 Ponte 30j   │
│ Finances  │                                           │
│ Rapports  │                                           │
│ Réglages  │                                           │
└───────────┴──────────────────────────────────────────┘
```

### Écran saisie journalière — mobile (priorité absolue)

```
┌────────────────────────────────┐
│  ←  Saisie du jour             │
│     Lot SF-2024-023            │
│     Lundi 15 Jan 2024 · Jour 18│
├────────────────────────────────┤
│                                │
│  ☠️  Mortalité                 │
│  ┌──────────────────────────┐  │
│  │         0                │  │
│  └──────────────────────────┘  │
│                                │
│  🌾  Aliment distribué         │
│  ┌──────────────────────────┐  │
│  │        125  kg           │  │
│  └──────────────────────────┘  │
│                                │
│  💧  Eau consommée             │
│  ┌──────────────────────────┐  │
│  │        200  litres       │  │
│  └──────────────────────────┘  │
│                                │
│  [+ Ajouter détails optionnels]│
│                                │
├────────────────────────────────┤
│  ✅  ENREGISTRER               │  ← 52px, vert pleine largeur
└────────────────────────────────┘
```

### Navigation web (sidebar)

```
🏠 Tableau de bord
🐓 Lots d'élevage
📋 Saisie journalière    ← lien direct depuis la home
🥚 Production œufs
🏗️ Fermes & Bâtiments
📦 Stock
💰 Ventes
🛒 Achats
💊 Santé animale
💵 Finances
📊 Rapports
👥 Équipe
⚙️ Paramètres
```

### Navigation mobile (bottom bar)

```
🏠 Accueil | 📋 Saisie | 🐓 Lots | 📊 Stats | ☰ Menu
```

---

## 14. SÉCURITÉ — PATTERN OBLIGATOIRE

```typescript
// Pattern à appliquer dans CHAQUE Server Action sans exception
export async function createBatch(data: unknown) {
  // 1. Vérifier l'authentification
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    throw new Error('Non authentifié')
  }

  // 2. Valider les données entrantes avec Zod
  const parsed = createBatchSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error('Données invalides : ' + parsed.error.message)
  }

  // 3. Vérifier l'appartenance à l'organisation + le rôle
  const membership = await prisma.userOrganization.findFirst({
    where: {
      userId: session.user.id,
      organizationId: parsed.data.organizationId,
    }
  })
  if (!membership || !hasPermission(membership.role, 'CREATE_BATCH')) {
    throw new Error('Permission refusée')
  }

  // 4. Exécuter l'action métier
  const batch = await prisma.batch.create({
    data: { ...parsed.data }
  })

  // 5. Créer un audit log
  await createAuditLog({
    userId: session.user.id,
    organizationId: parsed.data.organizationId,
    action: 'CREATE_BATCH',
    resourceId: batch.id,
    after: batch,
  })

  return { success: true, data: batch }
}
```

**Règles de sécurité non négociables :**
- Validation Zod côté serveur **obligatoire** sur toutes les Server Actions
- `organizationId` vérifié **avant toute opération** sur les données
- Erreurs techniques **jamais exposées** à l'utilisateur (logger + message générique)
- Rate limiting sur les routes d'authentification
- Variables `NEXT_PUBLIC_*` uniquement pour ce qui doit réellement être public
- Pas de `console.log` en production — utiliser un logger structuré

---

## 15. VARIABLES D'ENVIRONNEMENT

```env
# Base de données (Supabase PostgreSQL)
SUNUFARM_DATABASE_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"
SUNUFARM_DIRECT_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"

# Auth (NextAuth v5)
AUTH_SECRET="[générer avec: openssl rand -base64 32]"
AUTH_URL="http://localhost:3000"

# Email (Resend)
RESEND_API_KEY="re_..."
EMAIL_FROM="noreply@sunufarm.sn"

# Storage (Supabase Storage)
SUPABASE_URL="https://[ref].supabase.co"
SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="SunuFarm"
NEXT_PUBLIC_APP_VERSION="1.0.0"
NODE_ENV="development"
```

---

## 16. RISQUES ET MITIGATIONS

| Risque | Impact | Mitigation |
|---|---|---|
| Oubli organizationId dans une requête | CRITIQUE — fuite inter-tenant | Pattern Server Action obligatoire + code review |
| Montants avec décimales FCFA | Métier — calculs incorrects | INTEGER en DB + Zod enforce + formatFCFA() |
| Perte données saisie offline | Élevé | Optimistic UI + retry auto + Service Worker V2 |
| Performance mobile bas de gamme | Élevé | Bundle < 200kb, lazy loading, pagination |
| Mauvaise adoption terrain | Élevé | < 30s saisie, onboarding guidé, seeds démo |
| Erreur saisie journalière | Moyen | Confirmation + édition J+1 + audit log |
| Montée en charge (1000+ lots) | Moyen | Index Prisma, cursor pagination, query profiling |
| Compaction contexte Claude Code | Opérationnel | Sessions courtes, PROGRESS.md à jour |
| OHADA comptabilité incorrecte | Légal | Module séparé, validé par expert-comptable local |
| Sécurité multi-tenant | Critique | Tests d'isolation inter-org dans les seeds |

---

## 17. QUALITÉ CODE — CHECKLIST AVANT DE CLORE UN MODULE

```
[ ] Types TypeScript stricts, zéro any sans justification commentée
[ ] Validation Zod côté serveur sur toutes les Server Actions
[ ] organizationId vérifié dans chaque action sans exception
[ ] Audit log créé pour chaque create/update/delete métier
[ ] Messages d'erreur en français, compréhensibles par un non-développeur
[ ] Composants conçus mobile-first, testés visuellement à 375px
[ ] Montants en INTEGER, tous les affichages passent par formatFCFA()
[ ] Pagination implémentée sur toutes les listes (seuil : > 10 items)
[ ] Loading states sur toutes les actions asynchrones
[ ] Toast de confirmation sur toutes les mutations réussies
[ ] Tests manuels effectués avec les seeds de démo
[ ] Zéro console.log laissé dans le code
[ ] Nommage conforme aux conventions (sunufarm partout)
[ ] Performance vérifiée : pas de N+1, includes Prisma appropriés
```

---

## 18. ÉTAT D'AVANCEMENT

> Créer et maintenir `PROGRESS.md` à la racine. Mettre à jour après chaque session.

```
[ ] Étape 1 — Analyse fonctionnelle structurée
[ ] Étape 2 — Architecture globale validée
[ ] Étape 3 — Modélisation données validée
[ ] Étape 4 — Roadmap MVP/V2/V3 validée
[ ] Étape 5 — Arborescence projet créée
[ ] Étape 6 — Schéma Prisma complet
[ ] Étape 7 — Seeds réalistes (données sénégalaises)
[ ] Étape 8 — formatters.ts (FCFA, dates, nombres)
[ ] Étape 8 — kpi.ts (toutes les formules métier)
[ ] Étape 8 — permissions.ts + audit.ts
[ ] Étape 8 — validators/ (schémas Zod par domaine)
[ ] Étape 9 — Module Auth (login, register, session, middleware)
[ ] Étape 9 — Module Organisations + Fermes + Bâtiments
[ ] Étape 9 — Module Lots (CRUD + rentabilité temps réel)
[ ] Étape 9 — Module Saisie journalière (priorité terrain < 30s)
[ ] Étape 9 — Module Production œufs
[ ] Étape 9 — Module Stock aliments
[ ] Étape 9 — Module Dépenses
[ ] Étape 9 — Module Ventes
[ ] Étape 9 — Module Finances + Rentabilité agrégée
[ ] Étape 9 — Module Santé basique
[ ] Étape 9 — Module Alertes + Notifications in-app
[ ] Étape 10 — Layout principal (sidebar + header + bottom nav mobile)
[ ] Étape 10 — Toutes les pages et vues
[ ] Étape 11 — Dashboard global + KPI cards
[ ] Étape 12 — Rapports PDF (lot + journalier + financier)
[ ] Étape 12 — Export Excel / CSV
[ ] Étape 13 — Sécurité + refactoring + optimisation mobile
```

---

## 19. COMMANDE DE DÉMARRAGE POUR CHAQUE SESSION

Copie-colle ce message exact au début de chaque nouvelle session Claude Code :

```
Relis CLAUDE.md et PROGRESS.md.
Résume l'état actuel du projet en 3 lignes maximum.
Aujourd'hui on travaille sur : [MODULE OU ÉTAPE À PRÉCISER]
Commence par lire les fichiers existants liés à ce module avant d'écrire du code.
```

---

*SunuFarm — Notre Ferme — L'ERP avicole de référence pour l'Afrique*
*CLAUDE.md v2.0 — Document de contexte projet complet*
