# Protocole pilote — Feed Refactor Phase 3A

> Objectif : valider rapidement la compréhension terrain du mode sac et des nouveaux libellés Business avant diffusion large.

## Cible

- 2 à 3 éleveurs pilotes
- 1 lot chair actif avec saisie quotidienne réelle
- 1 session d’observation de 10 à 15 minutes par pilote

## Scénario de test

1. Ouvrir la saisie journalière.
2. Basculer du mode `kg` au mode `sacs`.
3. Enregistrer une consommation du jour en sacs.
4. Vérifier le retour dans l’historique du lot.
5. Ouvrir la page lot et commenter le graphe réel vs référence.
6. Ouvrir la vue Business et lire les nouveaux verdicts.

## Questions à poser

1. Le choix `kg / sacs` est-il compris immédiatement ?
2. La saisie en sacs correspond-elle à votre manière de travailler au quotidien ?
3. L’icône d’estimation dans l’historique est-elle claire ou ambiguë ?
4. Le graphe réel vs référence aide-t-il à comprendre l’écart d’aliment ?
5. Les messages Business paraissent-ils plus justes qu’avant, surtout sur les jeunes lots ?

## Critères d’acceptation

- Le pilote comprend le mode sac sans explication longue.
- Le pilote comprend qu’une ligne estimée ne remplace pas une saisie manuelle.
- Aucun retour fort de confusion sur les verdicts avant J7.
- Au moins 2 pilotes sur 3 jugent le wording Business “plus juste” ou “plus prudent”.

## Trace attendue

- Date du test
- Nom ou code du pilote
- Lot utilisé
- Verbatims clés
- Décision : `OK`, `Ajustement mineur`, `Bloquant`

## Support interne

- Référence fonctionnelle : [feed-logic-refactor.md](C:/Users/pcpro/sunufarm/docs/roadmaps/feed-logic-refactor.md)
- Rollout : [feed-refactor-rollout.md](C:/Users/pcpro/sunufarm/docs/release-notes/feed-refactor-rollout.md)
