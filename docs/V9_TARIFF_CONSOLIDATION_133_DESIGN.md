# Issue #133 — conception de la consolidation tarifaire V9

Statut : **conception pour revue**, basée sur Production `fba450da`, 15 octobre 2026. Aucun changement de moteur, de collecte, de pin ou de publication dans cette PR. L'identité physique de #132 est une PR Draft indépendante et n'est pas présumée fusionnée.

## Contrat de base

La station physique sert à présenter et à localiser. Le calcul se fait sur la clé `(snapshot, station source, EVSE/PDC, prise, puissance nominale, canal, offre source, scénario)`. Un même site peut contenir plusieurs stations source ; aucun prix ne traverse cette frontière sans correspondance EVSE/prise démontrée. Les voies Direct CPO, Electra eMSP et Electroverse eMSP restent indépendantes. Un abonnement Direct sélectionné est une offre distincte, avec coût mensuel et remise expliqués séparément.

Le moteur cible reçoit un catalogue immuable de faits : `Site`, `SourceStation`, `ChargePoint`, `Connector`, `RawOffer`, `OfferScope`, `Evidence`, `Scenario`. `RawOffer` conserve intégralement la charge utile, l'ID, le SHA et la date de source ; aucune déduplication destructive. `OfferScope` contient les IDs de prise/EVSE/PDC exacts ou une portée source justifiée, le CPO réel, pays, puissance et canal. Une absence de portée exacte devient un diagnostic, jamais une permission d'étendre au site. Les correspondances de site de #132 ne modifient pas `OfferScope`.

Pour chaque `(prise, offre, scénario)`, produire `Evaluation` avec statut `priced | missing | ambiguous | uncomputable | ineligible`, raison stable, provenance des champs, règle et fuseau appliqués, composants facturés, total en devise source, conversion et taux daté si disponible. Préserver aussi les offres écartées et leurs raisons. `missing` concerne la voie sans offre identifiée ; `ambiguous` concerne des preuves incompatibles de même portée et instant ; `uncomputable` concerne une offre identifiée dont le calcul manque de variable ou de sémantique. L'UI rend `ambiguous` et `uncomputable` par « Tarif incalculable » conformément à la politique Data Lab.

Le choix du meilleur tarif ne compare que des évaluations complètes et éligibles, sur la **même prise et le même scénario**. Départage : total converti, puis coût non converti si même devise, puis priorité source déclarée, puis ID source stable. Une vraie contradiction de grilles applicables au même produit reste ambiguë et ne se résout jamais par ce départage. Le classement de site peut retenir le meilleur couple `(prise, offre)` tout en gardant tous les couples consultables.

## Calcul et frontières

Une chronologie locale explicite sépare charge, branchement après charge et stationnement. L'oracle additionne énergie par segment horaire, frais fixes une fois, minutes de charge, minutes connectées, stationnement après grâce, paliers `afterMinutesRate`, seuils, minimums/plafonds et congestion seulement si l'offre et la prise y sont éligibles. Les frontières jour/nuit et DST utilisent le fuseau source validé ; une règle horaire sans fuseau fiable échoue fermée. La congestion ≥ 80 % est activée par défaut seulement si sa règle est prouvée ; son interrupteur est indexé par prise + offre + scénario, et les deux totaux sont calculés séparément. Préautorisation ≠ frais. Conversion indisponible : conserver le total local, ne pas le classer entre devises. Abonnement non sélectionné : inéligible, mais conservé dans le catalogue.

## Migration contrôlée

1. Capturer une baseline immuable par pin et scénario : inventaire source, liens exacts, évaluations et états UI, ventilés pays/CPO/canal/prise/puissance. Établir des golden files sur des offres réelles épinglées et un petit oracle indépendant.
2. Construire le catalogue relationnel en lecture seule à côté du moteur actuel. Vérifier la conservation par multiensembles d'IDs EVSE, prises, offres et empreintes brutes. Différences de portée et offres orphelines deviennent des rapports, jamais des suppressions implicites.
3. Ajouter un évaluateur pur réutilisable et un dual-run par scénario. Comparer état, total, devise, composants et provenance par clé exacte ; classer chaque divergence en correction démontrée, régression ou donnée insuffisante.
4. Basculer par pays/CPO/canal seulement après oracles, couverture non dégradée ou exclusion justifiée, revue humaine et CI. Garder rollback vers l'ancien moteur et le snapshot épinglé. Publication séparée et explicite.

Les collectes Data Lab et le transport Tesla/Mac d'Updater Test restent en place. Tesla/Mac est exempt de migration de collecte ; ses offres passent néanmoins le même contrat d'évaluation avec provenance et règles Tesla propres. Le site Stable conserve son rôle de référence/rollback.

## Travaux de cette PR de conception

L'audit critique, les mesures datées, la matrice de scénarios et les critères de passage sont complétés ci-dessous avant toute PR d'implémentation. Une réussite de fixture ne sera pas qualifiée de validation du snapshot réel.
