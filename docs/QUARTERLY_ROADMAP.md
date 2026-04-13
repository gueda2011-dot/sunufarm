# Quarterly Roadmap

## Objectif

Traduire la roadmap de scalabilite en priorites de livraison sur les prochains trimestres.

Cette feuille de route ne remplace pas `docs/SCALABILITY_ROADMAP.md`.
Elle sert a planifier les prochains blocs produit et tech de facon plus operationnelle.

## Perimetre

- horizon court a moyen terme
- priorites reliees a `docs/MODULE_PRIORITIES.md`
- arbitrage entre stabilite, valeur produit et capacite d'execution

## Trimestre Actuel — Q2 2026

### Objectif principal

Stabiliser le coeur du produit et rendre l'execution equipe plus previsible.

### Produit

- fiabiliser encore `batches`, `daily-records`, `reports` et `subscriptions / payments`
- garder les parcours critiques simples a rejouer en demo et en support
- reduire les points de friction sur les exports et le pilotage admin

### Livre ce trimestre

- [x] Logique de maturite economique sur la vue Business (`getProfitabilityStatus`) : verdict "Cycle en demarrage" quand aucune vente n'existe, pour ne jamais afficher "non rentable" a tort en phase de demarrage — score global et couleur de carte adaptes en consequence
- [x] Projection de marge finale basee sur le burn rate observe et le benchmark interne de lots similaires
- [x] Refonte logique alimentaire Phase 1–4 (plan `c:\Users\pcpro\.claude\plans\swirling-plotting-lamport.md`) :
  - [x] Phase 1 : schéma Prisma (FeedBagEvent, ZootechnicalCurvePoint, FarmAdjustmentProfile), seed courbes Cobb500/Ross308/ISA Brown/Lohmann Brown interpolées
  - [x] Phase 2 : moteur reconstruction pondérée (CURVE_WEIGHTED), fonctions chair/pondeuse/dispatcher, farm-feed-adjustment (OBSERVING), server actions feed-bags, 25 tests unitaires
  - [x] Phase 3A : diagnostics contextuels (libellés, seuil J7, qualité données), toggle sac/kg DailyForm, FeedReferencePanel graphe réel vs référence, offline support
  - [x] Phase 3B : seuils KPI différenciés chair/pondeuse (kpi-thresholds.ts), garde PERFORMANCE_VERDICT_MIN_AGE_DAYS
  - [x] Phase 4 : Lohmann Brown (71 points hebdo J7–J490), enrichissement BatchOutcomeSnapshot (curveVersion/senegalProfileUsed/farmAdjustmentStatus/pctEstimatedJ14/avgConfidenceJ14), features ML (pct_estime_j14, confiance_moyenne_j14), server actions FarmAdjustmentProfile (compute/activate/reset), UI FarmAdjustmentPanel

### Tech

- finir les derniers blocs structurants de la Phase 6
- cadrer les futurs besoins de jobs asynchrones
- cadrer les besoins de cache applicatif et d'async processing

### Resultat attendu

- arbitrages plus clairs sur ce qui passe avant le reste
- meilleure reprise du projet par plusieurs intervenants
- trajectoire plus nette pour les traitements lourds

## Trimestre Suivant

### Objectif principal

Augmenter la valeur percue sans fragiliser le coeur de fonctionnement.

### Produit

- pousser les modules de differenciation utiles sur le terrain
- ameliorer `notifications`, `health`, `stock` et `ai` si le coeur reste stable
- rendre les retours admin et support plus actionnables

### Tech

- introduire, si besoin confirme, une vraie file de jobs pour exports, emails et traitements lents
- preparer une premiere strategie simple de cache sur les vues les plus relues
- renforcer les validations autour des parcours multi-organisations et paiements

### Resultat attendu

- plus de valeur visible sans reouvrir les fragilites du socle
- meilleures bases pour absorber la croissance d'usage

## Trimestre D'Apres

### Objectif principal

Industrialiser les modules les plus actifs et mieux separer produit, admin et plateforme.

### Produit

- faire monter en maturite les modules les plus utilises
- clarifier ce qui releve du produit terrain, de l'admin et de l'outillage interne

### Tech

- renforcer l'observabilite orientee usage et performance
- etudier une separation plus nette des surfaces admin et metier
- ajouter plus de validations automatisees sur les parcours les plus critiques

### Resultat attendu

- socle plus facile a faire evoluer
- risque de regression plus faible sur les zones sensibles

## Regles D'Usage

- chaque trimestre doit rester cohérent avec `docs/MODULE_PRIORITIES.md`
- un sujet de priorite 1 ou 2 doit passer avant une initiative de confort
- si un trimestre devient trop charge, preferer couper du perimetre plutot que diluer la priorite

## Revue

Cette roadmap doit etre relue au moins a chaque changement de phase ou de priorite active.
Les trajectoires complementaires sont detaillees dans `docs/ASYNC_JOBS.md` et `docs/CACHE_STRATEGY.md`.
