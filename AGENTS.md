# SunuFarm — Instructions pour agents IA

## Contexte projet
SunuFarm est un ERP avicole multi-tenant pour l'Afrique francophone (Sénégal en priorité).
Stack : Next.js App Router, TypeScript strict, Tailwind CSS, Prisma, PostgreSQL, NextAuth v5.

## Règles absolues
- Multi-tenant : chaque requête Prisma doit inclure `organizationId` dans le `where`
- Montants en INTEGER (FCFA, pas de centimes) — utiliser `formatFCFA()` pour l'affichage
- Server Actions uniquement (pas d'API routes sauf webhooks/exports)
- Validation Zod côté serveur sur toutes les mutations
- Mobile-first : la saisie journalière doit rester utilisable en < 30 secondes

## Où lire le contexte complet
- `CLAUDE.md` — contexte projet complet (architecture, modules, conventions)
- `PROGRESS.md` — état d'avancement par session
- `prisma/schema.prisma` — source de vérité du modèle de données
- `src/lib/` — utilitaires, formatters, KPI, permissions

## Ce qu'il ne faut pas indexer
- `node_modules/` — dépendances, ne pas lire
- `.next/` — build Next.js, ne pas lire
- `prisma/generated/` — client Prisma auto-généré, ne pas lire
