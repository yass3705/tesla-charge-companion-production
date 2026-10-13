# V9 : description de la règle appliquée (13 octobre 2026)

La V9 publiée déroulait toutes les plages du tarif dans chaque voie, y compris celles qui n'avaient pas servi au calcul, et montrait `0,00 EUR/min congestion dès 80 %` pour un composant nul. Cela rendait difficile la comparaison des offres Electric 55 Place Lully et Bois-d'Arcy.

Le résumé d'une voie calculée utilise désormais `matchedRule`, les segments de session ou les groupes OCPI effectivement évalués. Une plage de nuit qui n'a pas été traversée est absente du résumé ; si la session traverse deux plages, les deux règles utilisées restent visibles. Les frais après charge sont indiqués dans ce résumé lorsqu'une composante de stationnement a effectivement été facturée. Les taux nuls de frais ne sont plus présentés comme des conditions payantes. La totalité des grilles, la source, l'identifiant d'offre et sa date disponible sont conservés dans « Détail du tarif ».

Ce changement ne touche ni les offres sources, ni le calcul, ni le classement, ni le snapshot épinglé. Régression ciblée : `node tests/v9-applied-tariff-description.test.mjs`. Un test navigateur et le rebuild épinglé restent requis avant fusion. Aucun déploiement Pages n'est inclus.
