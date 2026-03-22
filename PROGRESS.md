# PROGRESS.md — SunuFarm

> Mis à jour après chaque session de travail.
> Dernière mise à jour : 2026-03-20

---

## État global

| Étape | Description | Statut |
|---|---|---|
| Étape 1 | Analyse fonctionnelle structurée | ✅ Validée |
| Étape 2 | Architecture globale validée | ✅ Validée |
| Étape 3 | Modélisation données validée | ✅ Validée |
| Étape 4 | Roadmap MVP/V2/V3 | ✅ Validée |
| Étape 5 | Arborescence complète du projet | ✅ Validée |
| Étape 6 | Schéma Prisma complet | ✅ Généré |
| Étape 7 | Seeds réalistes (données sénégalaises) | ⬜ À faire |
| Étape 8 | formatters.ts, kpi.ts, permissions.ts, audit.ts, validators/ | ⬜ À faire |
| Étape 9 | Modules backend (Server Actions) | ⬜ À faire |
| Étape 10 | Pages et vues frontend | ⬜ À faire |
| Étape 11 | Dashboards et KPI | ⬜ À faire |
| Étape 12 | Rapports PDF et exports | ⬜ À faire |
| Étape 13 | Refactoring, sécurité, optimisation | ⬜ À faire |

---

## Décisions techniques prises

| Décision | Valeur | Raison |
|---|---|---|
| Version Prisma réelle | 7.5 (pas 5) | Projet initialisé avec Prisma 7 |
| Version Next.js réelle | 16.2 (pas 15) | Projet initialisé avec Next.js 16 |
| Version Zod réelle | 4.x (pas 3.x) | Dépendance installée |
| Generator Prisma | `prisma-client` | Syntaxe Prisma 7 |
| Config datasource | `prisma.config.ts` | Pattern Prisma 7 |
| Env var base de données | `SUNUFARM_DATABASE_URL` | Convention projet |
| Permissions ferme | JSON dans `UserOrganization.farmPermissions` | MVP — table séparée en V2 |
| Motif mortalité | Optionnel, défaut "Non précisé" | Décision terrain validée |
| Types de ventes MVP | Poulets vifs, œufs, fientes uniquement | Décision produit validée |

---

## Session 1 — 2026-03-20

**Travail effectué :**
- Étapes 1-3 : analyse fonctionnelle, architecture et modélisation validées
- Étapes 4-5 : roadmap et arborescence complètes présentées
- Étape 6 : `prisma/schema.prisma` généré (37 modèles, 13 enums)
- `prisma.config.ts` mis à jour pour `SUNUFARM_DATABASE_URL`
- `PROGRESS.md` créé

**Fichiers créés / modifiés :**
- `prisma/schema.prisma` — schéma complet production-ready
- `prisma.config.ts` — variable env corrigée

**Prochaine session :**
- Commencer par : `prisma db push` ou `prisma migrate dev` pour valider le schéma en base
- Puis étape 7 : `prisma/seed.ts` avec données sénégalaises réalistes
- Puis étape 8 : utilitaires (`formatters.ts`, `kpi.ts`, `permissions.ts`, `audit.ts`, `validators/`)

---

## Schéma Prisma — Modèles générés

| Domaine | Modèles |
|---|---|
| Référentiels globaux | Species, Breed, FeedType, MortalityReason |
| Auth (NextAuth v5) | Account, Session, VerificationToken |
| Utilisateurs | User, UserOrganization |
| Organisation | Organization |
| Infrastructure | Farm, Building |
| Lots | Batch |
| Saisie journalière | DailyRecord, MortalityRecord |
| Production œufs | EggProductionRecord |
| Pesées | WeightRecord |
| Santé | VaccinationPlan, VaccinationPlanItem, VaccinationRecord, TreatmentRecord |
| Stock aliments | FeedStock, FeedMovement |
| Stock médic. | MedicineStock, MedicineMovement |
| Commerce | Customer, Supplier, Sale, SaleItem, Purchase, PurchaseItem |
| Finances | Expense, ExpenseCategory, Invoice, Payment |
| RH | Employee |
| Système | Notification, AuditLog |
