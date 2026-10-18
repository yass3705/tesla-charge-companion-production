# Lully Direct — prérequis d'activation Scan Pay

Décision documentaire pour #133, indépendante de la Phase 4. Le pin `2026-10-15-v9-tesla-mac-ingress-verified` contient quatre PDC à Place Lully : trois à 7,36 kW et un à 22,08 kW. La source `e55c-direct-france` est inactive et `france-e55c-offers`, active, n'offre aucun Direct exact à ces PDC. Aucun tarif Direct n'est activé ici.

Avant une PR d'activation distincte :

1. Obtenir pour chaque groupe de PDC un checkout consommateur Scan Pay daté, avec URL, identité station/PDC/prise et opérateur, et archiver les octets et leur SHA. Vérifier que les quatre PDC sont bien ceux du checkout, et qu'aucun prix ne dépend seulement de l'adresse ou du site.
2. Confirmer prix TTC, frais fixes de 0,60 € **une fois par session**, grille de charge et de stationnement jour/nuit par groupe, définition du stationnement après charge, fuseau Europe/Paris, frontières 07:00/23:00 et changement DST. Rejeter si le checkout diffère des valeurs source Phase 3 ou si un terme reste implicite.
3. Construire des RawOffer et OfferScope exacts par PDC/prise et canal Direct ; garder Electroverse séparé. Exécuter l'oracle source sur jour, nuit, franchissement horaire et DST pour les deux groupes, avec 90 minutes de charge et 30 après charge, sans double comptage.
4. Reconstruire le dist du même pin ou d'un nouveau pin approuvé, comparer multiensembles d'identifiants et payloads bruts, puis lancer dual-run et golden. Exiger zéro portée extrapolée, zéro régression inexpliquée et revue humaine avant toute activation ou publication.

Les prix source et preuves de calculabilité sont consignés dans `docs/V9_TARIFF_PHASE3_133.md` et `reports/v9-tariff-133/lully-direct-phase3.json`. Ils ne constituent pas à eux seuls un tarif Direct actif. Cette PR ne change ni le registre, ni le runtime, ni les collectes, ni le flux Tesla/Mac Updater Test.
