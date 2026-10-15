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

### Audit critique du code actuel

| Étape actuelle | Observation vérifiable | Risque à tester dans le dual-run |
| --- | --- | --- |
| `runtime-owned/assets/v9/offer-engine.js` `semanticKey`/`dedupeOffers` | La clé peut regrouper selon `equivalenceKey`, abonnement ou signature sans EVSE/prise ; `mergeEquivalentOffers` garde un gagnant avec alias et provenance. | Une preuve brute ou une portée distincte peut devenir invisible ; exiger égalité du multiensemble source et matérialiser chaque offre. |
| `runtime-overrides/assets/v9/session-engine.js` `evaluateStation` | Un profil de station prend la puissance maximale. Les offres exactes prennent le premier profil compatible ; les non exactes passent par le profil représentatif. | Dépendance à l'ordre des prises, perte de combinaisons et extension implicite des offres non exactes. |
| `v9-production-shell/bridge.js` `variantsByPower` | Les variantes groupent par type, puissance arrondie et IDs d'offres compatibles, puis sont réévaluées. | Deux PDC de même puissance peuvent perdre leur distinction de portée si leurs offres sont seulement stationnelles. |
| `bridge.js` `tariffLaneState` | Toute différence de signature entre offres d'une voie est classée ambiguë. | Des abonnements, produits ou périodes réellement alternatifs peuvent devenir « incalculables » à tort ; un conflit réel ne doit pas être classé au prix le plus bas. |
| `bridge.js` `stationCards` sur `main` | Clé de carte par ID station, puis résumé meilleur PDC ; #132 propose une identité de site séparée. | Trois cartes Bois-d'Arcy avant #132 ; la réunion visuelle ne doit pas devenir une réunion tarifaire. |

Ces points sont des **risques déduits du code**, pas un comptage de prix incorrects publié. Les moteurs courants possèdent déjà des gardes utiles : restriction EVSE/prise, fuseau, segments, post-charge, minimum, congestion, FX et résultat incomplet. La migration les compare à un oracle ; elle ne suppose ni qu'ils sont tous faux, ni que leur couverture est exhaustive.

### Couverture avant/après : unités et preuve disponible

Pin de développement courant : `2026-10-15-v9-tesla-mac-ingress-verified`, Data Lab `94d4fc6785a0c1d2ed4df1d01b5a30d203bd4cd3` (`config/refresh-policy.json`). Les chiffres ci-dessous sont **des observations historiques du candidat du 13 octobre**, pas un nouvel audit du pin du 15 octobre : `docs/v9-technical-tariff-readiness-2026-10-13.md`. Les mesurer de nouveau sur ce pin est la première étape obligatoire de l'implémentation.

| Périmètre historique | Avant documenté | Après exigé dans le dual-run |
| --- | --- | --- |
| FR IRVE | 48 083 stations / 165 848 EVSE du candidat ; unité : inventaire, pas prix. | Multiensemble d'EVSE et prises identique au pin, sauf delta source explicitement approuvé. |
| Electra eMSP FR | 92 867 jointures / 97 371 offres source ; calculabilité non déduite. | Toutes les offres brutes conservées ; chaque jointure prouvée garde une portée identique ou plus précise, avec statut par scénario. |
| Electroverse eMSP FR | 86 794 jointures / 89 991 offres source ; 3 197 sans jointure dans ce pin. | Aucun des 3 197 ne reçoit de prix par analogie ; tout nouveau lien exige preuve EVSE/prise. |
| BUMP direct FR | 1 783 EVSE exacts attachés au candidat daté. | Zéro perte non expliquée d'offre ou de lien exact ; les 449 PDC au connecteur non prouvé restent diagnostic séparé. |
| BE NAP | 70 523 EVSE source, 57 548 avec prix ad-hoc source dans le relevé daté. | Mesurer séparément source, jointure, éligibilité et prix calculable ; ne pas confondre les 57 548 avec des devis. |
| Bois-d'Arcy #132 | Capture : 3 cartes, 17 + 1 + 10 PDC ; trois IDs IRVE liés au même `publicId` Electra selon Data Lab. | Si #132 est validée : 1 carte / 28 PDC, **28 portées tarifaires indépendantes** ; total Direct/Electra/Electroverse compté par offre et scénario, sans prix présumé. |

Le rapport d'implémentation devra produire pour **chaque** pin, pays, CPO, canal et scénario les compteurs `source_offers`, `source_evses`, `source_connectors`, `exact_links`, `ambiguous_links`, `unlinked_offers`, `eligible`, `priced`, `ambiguous`, `uncomputable`, `missing`, `ineligible`, avec deltas avant/après et raisons par ID. Les unités sont distinctes ; la somme des états de calcul doit égaler le nombre de couples prise/offre évalués. Une offre sans lien est conservée dans `unlinked_offers`, pas transformée en `missing` pour toute la station. **Aucun chiffre après implémentation n'est encore mesurable dans une PR de conception** ; la colonne « après » est un invariant d'acceptation.

### Golden scenarios et oracles requis

| Pays / cas | Portée et composantes à prouver | Oracle / refus |
| --- | --- | --- |
| FR Electra Bois-d'Arcy | 28 PDC de #132, AC22 / DC100 / DC400 ; trois canaux séparés, offres exactes seulement. | Un site visuel ne transmet aucun prix entre les trois IDs IRVE ; comparer chaque ID d'offre et diagnostic source. |
| FR Electric 55 Place Lully | Deux PDC, jour/nuit, fixe, stationnement. | Devis par prise, frontière 07:00/23:00 ; Direct inconnu reste incalculable selon preuve source. |
| FR Métropolis Neuilly et Bry-sur-Marne | `afterMinutesRate`, temps local, conflit Electroverse P1. | Passage de seuil et DST ; conflit Bry-sur-Marne sans montant Electroverse. |
| NL DOT-NL | OCPI énergie, durée arrondie, FLAT conditionnel, minuit. | Source courante prioritaire ; ancien site sans ID actuel ne récupère pas son prix. |
| GB Midhope / GeniePoint | Post-charge, exemption horaire, `PARKING_TIME`, GBP. | Inconnue de sémantique = incalculable ; deux devises sans FX valide non classées. |
| CH / IT / DE / ES / BE / MA | Direct local, EVSE/prise, fuseau et devise ; cas absence d'offre. | Un scénario représentatif réel épinglé par pays ; aucun overlay eMSP extrapolé hors couverture prouvée. |
| Tesla SuC / Mac | Sources et pays distincts, abonnement et congestion source. | Pas de changement de collecte Updater ; montant de congestion non facturé sans condition vérifiée. |

Chaque golden file contiendra le SHA des entrées, l'ID site et station source, EVSE/PDC/prise, offre, canal, scénario complet, statut, composants et total local/converti. Les fixtures synthétiques servent les frontières ; au moins un cas par pays doit relire un snapshot épinglé et être comparé à un oracle indépendant, pas seulement à l'ancien moteur.

### Tests existants exécutés pour l'audit de conception

Sur `fba450da`, Node 22 : `v9-tariff-lanes`, `france-electra-rich-migration`, `v9-electra-plus-direct`, `netherlands-dotnl-ocpi-pricing`, `v9-nl-zero-price-step-midnight`, `uk-midhope-verified-pricing`, `uk-ocpi-first-match`, `v9-applied-tariff-description` et `v9-tariff-readability-lot3` ont passé. Ce sont des tests ciblés ou fixtures, **pas** la couverture intégrée de #128. `electroverse-rich-pricing`, `v9-congestion-soc80` et `v9-ocpi-component-coverage` n'ont pas démarré dans ce worktree vierge : ils exigent respectivement `dist/v9-explicit-candidate` et `dist/v9-global-preview`. Aucun build lourd n'a été relancé pour cette PR documentaire. Leur exécution sur artefact immuable fait partie de la gate d'implémentation.

### Conditions d'arrêt

Arrêter la promotion si un ID d'offre source ou de PDC disparaît sans preuve de retrait, si une relation site devient une relation prix, si un total incomplet entre au classement, si une devise manque de taux daté, si une contradiction est arbitrairement départagée, ou si une différence de composants ne peut être expliquée par la règle source. Les chiffres datés de 2023–2026 ne sont pas substitués au pin courant. CI, audit des secrets publics et revue humaine précèdent toute décision de fusion ; publication Pages et Cloudflare restent des actions séparées.
