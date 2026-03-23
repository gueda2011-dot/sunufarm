# PROGRESS.md - SunuFarm

> Mis a jour apres chaque session de travail.
> Derniere mise a jour : 2026-03-22

---

## Etat global

| Etape | Description | Statut |
|---|---|---|
| Etape 1 | Analyse fonctionnelle structuree | Validee |
| Etape 2 | Architecture globale | Validee |
| Etape 3 | Modelisation des donnees | Validee |
| Etape 4 | Roadmap MVP/V2/V3 initiale | Validee |
| Etape 5 | Arborescence du projet | En place |
| Etape 6 | Schema Prisma multi-tenant | Genere et utilise |
| Etape 7 | Seeds de demonstration realistes | Termine |
| Etape 8 | Utilitaires partages (`formatters`, `permissions`, `audit`, `validators`, `utils`) | Termines |
| Etape 9 | Modules backend (Server Actions) | Largement implementes |
| Etape 10 | Pages et vues frontend | Largement implementees |
| Etape 11 | Dashboards, KPI et rapports | MVP implemente |
| Etape 12 | Exports PDF / Excel | A faire |
| Etape 13 | Refactoring, securite, optimisation | En cours |

---

## Positionnement produit

SunuFarm est confirme comme un ERP avicole.

Le coeur fonctionnel actuel couvre surtout :
- organisations et gestion multi-tenant
- fermes et batiments
- lots d'elevage
- saisie journaliere
- production d'oeufs
- sante animale
- stock aliment et medicaments
- clients, ventes, achats, depenses
- tableaux de bord et rapports mensuels

Le projet ne vise pas une gestion agricole generaliste. Le domaine "cultures" n'est pas dans le perimetre actuel.

---

## Stack technique reelle

| Sujet | Valeur |
|---|---|
| Framework | Next.js 16.2 (App Router) |
| React | 19.2.4 |
| ORM | Prisma 7.5 |
| Base de donnees | PostgreSQL |
| Auth | NextAuth v5 beta (credentials + JWT) |
| Validation | Zod 4 |
| Data fetching client | TanStack React Query |
| Formulaires | React Hook Form |
| Styling | Tailwind CSS 4 |

---

## Modules actuellement disponibles

### Authentification
- page de connexion
- route NextAuth
- layout dashboard protege

### Referential et structure
- organisations
- utilisateurs et roles
- fermes
- batiments

### Production avicole
- lots d'elevage
- saisie journaliere
- production d'oeufs
- vaccinations
- traitements

### Commerce et finance
- clients
- ventes
- achats
- depenses
- syntheses financieres

### Stocks
- stock aliment
- mouvements aliment
- stock medicaments
- mouvements medicaments

### Pilotage
- tableau de bord
- KPI operationnels
- rapports mensuels

---

## Session 2026-03-22

### Travail effectue

- correction des erreurs TypeScript bloquantes
- correction des vrais problemes ESLint cote application
- remplacement des references Prisma invalides `batchNumber` par `number`
- adaptation de certains retours Zod v4 (`issues` au lieu de `errors`)
- suppression des usages signales de `Date.now()` dans le rendu
- assainissement de plusieurs composants React Hook Form
- mise a jour de la configuration ESLint pour ignorer les dossiers Prisma generes
- regeneration des types Next avec `next typegen`
- verification du projet avec `tsc` et `eslint`

### Resultat des verifications

- `npx next typegen` : OK
- `npx tsc --noEmit --pretty false` : OK
- `npm run lint` : OK

---

## Dette technique restante

- finaliser la logique multi-organisation avec un vrai switcher d'organisation active
- consolider les permissions fines par ferme dans toute l'UI
- renforcer les tests automatises
- industrialiser les exports et impressions
- ajouter plus d'indicateurs de rentabilite par lot et par periode
- nettoyer progressivement les commentaires historiques devenus obsoletes

---

## Prochaines priorites recommandees

1. Stabiliser le pilotage multi-organisation.
2. Enrichir la rentabilite par lot avec marges, encaissements et ecarts.
3. Ajouter des alertes avicoles metier plus poussees.
4. Implementer les exports PDF / Excel pour les rapports et historiques.
5. Introduire une vraie strategie de tests sur les Server Actions critiques.
