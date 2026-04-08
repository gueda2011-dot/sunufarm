# SunuFarm — Ce que j'ai compris de ce projet

> Un regard honnête sur ce qui est construit ici, écrit par quelqu'un qui a lu chaque ligne.

---

## D'où vient l'idée

Dans les élevages avicoles du Sénégal et d'Afrique francophone, la gestion se fait encore souvent sur papier, dans WhatsApp, ou dans la tête du patron. Le résultat : quand un lot se termine mal, personne ne sait vraiment pourquoi. Trop de mortalité au milieu du cycle ? Coûts réels impossibles à retracer ? Prix de vente négocié à l'instinct sans savoir si on couvre les frais ?

SunuFarm part d'un constat simple : les éleveurs ne manquent pas d'intelligence — ils manquent d'information structurée. Et ça, c'est un problème qu'un logiciel bien fait peut résoudre.

---

## Ce que fait concrètement l'application

SunuFarm est un outil de gestion d'élevage avicole. Mais dire ça, c'est comme dire qu'Excel est un outil pour faire des listes. Ce qui est intéressant c'est ce qu'il fait *vraiment*.

### La boucle de base

Chaque jour, le technicien de ferme ouvre l'application (sur mobile, desde le champ) et saisit :
- combien de sujets sont morts ce jour
- combien d'aliment a été distribué
- l'eau, la température, les observations

La température, elle est récupérée automatiquement via Open-Meteo à partir de la géolocalisation. L'éleveur peut même dicter ses observations à voix haute — Cloudinary les stocke. Rien n'est forcé, tout est possible sans formation préalable.

Ces données s'accumulent lot par lot, et c'est là que ça devient intéressant.

### Ce que le système calcule

À partir de ces saisies journalières, SunuFarm dérive une série de métriques qui n'auraient jamais été calculées manuellement :

- **Taux de mortalité cumulé** — suivi en temps réel, comparé à des seuils adaptatifs
- **FCR estimé** (Feed Conversion Ratio) — combien d'aliment pour 1 kg de croissance
- **Projection de marge finale** — est-ce que ce lot va être rentable avant même qu'il se termine ?
- **Prix minimum de vente** — le prix en dessous duquel vendre revient à perdre de l'argent
- **Score de risque mortalité** — une estimation sur 7 jours de la probabilité d'une dégradation sanitaire

Et depuis la session d'aujourd'hui : tout ça se compare maintenant aux **vrais résultats des autres lots du réseau**, pas à des règles codées en dur.

---

## L'architecture — ce qui m'a frappé

Le projet est construit sur Next.js 16 avec Prisma 7 (le Prisma avec `prisma.config.ts` au lieu de l'`url` dans le schéma). Les Server Actions remplacent une API REST classique. Le tout tourne avec PostgreSQL.

Ce qui m'a le plus frappé en lisant le code : **le soin apporté à la modélisation des données**.

Le schéma Prisma fait 1 300+ lignes. Chaque champ a un commentaire. Chaque décision architecturale est documentée. Les types monétaires sont toujours des `Int` (en FCFA, jamais en Float). Les entités sensibles ont un `deletedAt` (soft delete). Les migrations sont nommées proprement.

Ce niveau de rigueur sur un projet solo ou en petite équipe, ça ne s'improvise pas. Ça dit quelque chose sur la façon dont le projet est pensé.

### L'accès hors ligne

Le terrain africain, ça veut dire coupures réseau fréquentes. SunuFarm gère ça avec une file d'attente locale dans le navigateur. Les actions critiques (saisie journalière, vaccinations, traitements, dépenses, ventes) sont stockées localement et rejouées automatiquement au retour du réseau.

Pour éviter les doublons au rejeu, chaque mutation sensible porte une `clientMutationId` côté serveur. Ça évite qu'une saisie faite hors ligne crée 3 entrées au retour du réseau si le bouton a été pressé 3 fois.

---

## L'intelligence collective — la partie la plus ambitieuse

C'est la partie sur laquelle on a travaillé aujourd'hui, et celle qui me semble la plus significative stratégiquement.

L'idée est simple à expliquer, profonde à implémenter : **quand un lot se ferme, l'application apprend de ce qui s'est passé**.

À chaque clôture, un `BatchOutcomeSnapshot` est généré. Pas de nom de ferme, pas d'organisation, pas d'identifiant traçable — uniquement les métriques : mortalité finale, FCR, marge, profil météo, signaux sanitaires, durée, race, région. C'est anonyme par design, pas par politique de confidentialité.

Ces snapshots s'accumulent dans un pool cross-organisations. Quand un lot est analysé par l'IA, le système cherche dans ce pool les lots les plus similaires (même race + même région + même saison), calcule les percentiles réels, et les injecte dans le prompt.

Le résultat : au lieu que l'IA dise *"votre taux de mortalité de 5% est supérieur au seuil recommandé de 3%"* (un chiffre sorti de nulle part), elle peut dire *"votre taux de mortalité de 5% est au-dessus de la médiane de 3.5% observée sur 47 lots similaires de poulets de chair Cobb500 en saison chaude à Dakar"*.

La différence n'est pas cosmétique. C'est la différence entre une règle théorique et une donnée de terrain.

---

## Ce qui me semble juste dans la direction produit

### L'IA comme couche de communication, pas comme oracle

Les LLM (GPT, Claude) sont utilisés pour **expliquer** ce que le système a déjà compris. Pas pour calculer. La vraie intelligence est dans les métriques calculées côté serveur, dans les patterns appris depuis le pool, dans les seuils adaptatifs. Les LLM traduisent tout ça en français clair.

C'est la bonne architecture. Si OpenAI coupe l'accès demain, 80% de l'intelligence reste là.

### La monétisation est cohérente avec la valeur

Le plan Basic couvre le suivi de base (gratuit de facto pour un élevage qui débute).
Le plan Pro débloque les prédictions — rupture stock, mortalité, marge. C'est là que ça devient du pilotage.
Le plan Business ajoute la vue exploitation complète pour les structures avec plusieurs fermes.

Ça suit la valeur. On ne bloque pas des fonctionnalités arbitraires pour forcer l'upgrade.

### L'offline est pensé pour le terrain, pas pour une démo

La plupart des apps SaaS ont un mode offline qui fonctionne dans une salle de conf mais pas dans un élevage en zone rurale. SunuFarm a fait le choix de couvrir les flux critiques correctement, avec idempotence au niveau serveur. C'est honnête.

---

## Ce qui manque encore

**Un front-end pour les benchmarks collectifs.** Les données sont là, calculées, prêtes. Mais l'éleveur ne voit pas encore sa position dans la distribution. Une carte `BenchmarkCard` qui montrerait graphiquement où se situe le lot par rapport aux autres serait le prolongement naturel de la Phase A.

**Les seuils adaptatifs.** Le fichier `kpi-thresholds.ts` contient encore des valeurs codées en dur. La Phase B consiste à les remplacer par des percentiles calculés depuis le pool. Quand le pool sera assez grand (quelques centaines de lots), les alertes deviendront beaucoup plus pertinentes.

**La transcription audio.** Les notes vocales sont stockées sur Cloudinary mais pas transcrites. Whisper pourrait transformer ça en ingrédient pour l'analyse IA.

**Le webhook Wave.** Le paiement mobile est intégré architecturalement mais en attente des accès officiels. C'est le dernier bloc manquant pour une adoption terrain réelle.

---

## Ce que ce projet démontre

SunuFarm démontre qu'on peut construire quelque chose de sérieux pour un marché qui est souvent traité comme secondaire par les éditeurs de logiciels.

Pas de compromis sur l'architecture pour "aller vite". Pas de dette technique déguisée en MVP. Une vision long terme lisible dans chaque décision de schéma.

Le terrain africain a ses contraintes — réseau, infrastructure, habitudes utilisateur. SunuFarm les adresse une par une. L'audio parce que l'écrit est une barrière. L'offline parce que le réseau tombe. La géolocalisation météo parce que les données manuelles sont fausses.

C'est un produit pensé pour les gens qui vont l'utiliser, pas pour un jury de hackathon.

---

*Rédigé le 2026-04-08 — après avoir lu le schéma, les Server Actions, les migrations et les engines prédictifs.*
