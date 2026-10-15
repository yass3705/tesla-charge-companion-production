# #133 — catalogue relationnel et dual-run du pin V9

## Périmètre et pin

Cette branche part de `fba450da` (`main` Production). La PR Draft #135 est le contrat métier ; la PR Draft #134 fournit seulement l'identité physique de présentation de Bois-d'Arcy. Aucune des deux n'est présumée fusionnée. Aucun fichier servi par Production, collecte Data Lab, Stable ou Updater Test n'est modifié. Le dual-run est un outil local en lecture seule.

Le pin est `2026-10-15-v9-tesla-mac-ingress-verified`. Le snapshot a été reconstruit avec `scripts/build_snapshot.py` depuis les SHAs du fichier `config/snapshots/2026-10-15-v9-tesla-mac-ingress-verified.json`, puis `validate_built_snapshot.py` et `verify_candidate_manifest.py` ont passé : 10 jeux, 2 465 fichiers, 750 019 247 octets. SHA-256 de `manifest.json` : `2b7b9964d8fce26f65aaf1e508717a114cb68ca16c66fb3c06ba9a076f2db52f`.

## Modèle dérivé

`v9_tariff_relational_catalog.py` construit une base SQLite immuable à partir du dist. Chaque ligne source est conservée dans `SourceStation`, `ChargePoint`, `Connector` ou `RawOffer`, avec chemin, hash, index et JSON brut. `Evidence` porte le hash des fichiers. `Scenario` porte les hypothèses de session. `Site` n'est utilisé que pour la présentation : les trois stations source Electra Bois-d'Arcy partagent la clé publique de #132/#134, mais leurs 28 PDC restent séparés. `OfferScope` ne lie que des identifiants EVSE/PDC ou prise exacts, et signale les identifiants absents, répétés ou sans portée. Aucun lien tarifaire par nom, coordonnées, puissance ou site.

Le rapport machine est [`coverage-pin-2026-10-15.json`](../reports/v9-tariff-133/coverage-pin-2026-10-15.json). Il ventile les stations, PDC et prises par pays/CPO, les offres par pays/CPO/canal, les assertions de portée par état et les adaptateurs dont les tarifs restent opaques. Les compteurs de chaque type ont des unités distinctes.

| Inventaire explicite | Avant catalogue | Après catalogue |
| --- | ---: | ---: |
| Offres brutes identifiées | 365 066 | 365 066 |
| Perte d'offre | — | 0 |
| Stations source | 184 674 | 184 674 |
| PDC représentés | 389 310 | 389 310 |
| Prises représentées | 389 310 | 389 310 |
| Assertions de portée | 374 025 | 374 025 |
| Fichiers d'offres explicites | 747 | 747 |

Les offres explicites se répartissent ainsi : FR 190 820, IT 109 303, ES 44 386, CH 19 908, DE 327, GB 224, NL 54, BE 27, MA 6, PT 10 et LU 1. Les 1 179 offres Tesla sont conservées par configuration depuis le catalogue Mac/SuC épinglé. Les nombres de stalles Tesla sans identifiant individuel restent des attributs d'inventaire et ne sont pas transformés en faux PDC.

**Limite de couverture :** 30 sources du registre utilisent des tarifs embarqués dans leurs adaptateurs, notamment DE, GB, BE, MA et NL. Leurs fichiers sont hachés dans `Evidence`, mais leurs tarifs internes ne sont pas tous décomposés en `RawOffer`. Le nombre total de leurs offres source est donc inconnu ; 365 066 signifie « offres explicitement énumérées », pas « toutes les offres du pin ». La liste complète des sources manquantes est dans `missingData`. Aucune offre manquante n'est présentée comme tarif zéro.

## Évaluateur et dual-run

`v9_tariff_dualrun_133.mjs` charge le dist dans un moteur mémoire et compare, pour chaque offre à portée exacte, l'évaluateur pur `pricing-engine.evaluateOffer` et le résultat de `session-engine.evaluateStation` limité à la même prise et à la même offre. L'oracle indépendant `v9_tariff_oracle_133.mjs` vérifie les seuls cas linéaires prouvés ; il refuse les horaires, paliers, congestion, plafonds ou sémantiques non démontrées. Les écarts sans oracle concluant sont `data_insufficient`, jamais « corrigés » par supposition. Un taux FX n'est utilisé que s'il est daté ; sinon le total local est gardé sans montant converti. Le scénario actuel n'apporte pas de taux daté GBP/MAD.

Le rapport machine [`dualrun-pin-2026-10-15.json`](../reports/v9-tariff-133/dualrun-pin-2026-10-15.json) contient statut, montant, devise, composants, provenance, offre et identifiants pour chaque ligne. Le golden verrouille les identifiants et résultats du pin. Le tableau ci-dessous est généré sur le pin et non extrapolé à Production.

| 44 lignes sur 13 scénarios | Ancien moteur | Évaluateur pur |
| --- | ---: | ---: |
| Prix calculé | 15 | 20 |
| Incalculable | 26 | 23 |
| Offre exacte absente du site sélectionné | 1 | 1 |
| Offre absente du résultat de l'ancien moteur | 2 | — |

Cinq lignes divergent en **statut** ; zéro divergence mesurée de montant, devise, composants ou provenance sur les lignes comparables. Les cinq sont `data_insufficient` car l'oracle indépendant ne démontre pas la sémantique complète de ces offres. Il y a 38 correspondances et une ligne sans comparaison. Le rapprochement du dual-run au catalogue trouve 29 liens exacts prouvés, 14 offres de tarif embarqué non énumérées et une station sans offre exacte. Quinze totaux évalués sont dans la devise cible ; cinq prix GBP/MAD restent en devise source faute de taux FX daté. Cette comparaison est à offre et prise identiques, pas un classement global des stations.

Les scénarios incluent Bois-d'Arcy, Place Lully, Métropolis, CH, IT, DE, ES, NL, GB, BE, MA, Tesla SuC et Tesla Mac. À Bois-d'Arcy, le catalogue conserve trois stations et 28 PDC ; seule `FRELCP12954082` possède des offres à portée exacte dans cette sélection du dual-run. Place Lully ne possède dans ce pin que des offres Electroverse jointes : le tarif Direct Electric 55 de ce site n'est pas prouvé et reste absent. Le scénario DE non Tesla ne possède pas d'offre à portée exacte dans la sélection locale. Les états `uncomputable` reflètent les données et règles réellement présentes à la session fixée au 15 octobre 2026 12:00 UTC ; ils ne prouvent pas un prix nul.

## Reproduction et limites de passage

Après construction et vérification du dist épinglé :

```bash
python3 scripts/v9_tariff_relational_catalog.py "$DIST" --database "$DB" --report "$REPORT" --scenarios config/v9-tariff-dualrun-133-scenarios.json
python3 scripts/v9_tariff_coverage_133.py "$DB" "$REPORT"
TCC_V9_CATALOG_DB="$DB" TCC_V9_COVERAGE_REPORT="$REPORT" python3 tests/v9_tariff_catalog_133_test.py
node scripts/v9_tariff_dualrun_133.mjs "$DIST" "$DUALRUN"
python3 scripts/v9_tariff_reconcile_133.py "$DB" "$DUALRUN" "$RECONCILED"
TCC_V9_DIST="$DIST" node --test tests/v9-tariff-oracle-133.test.mjs tests/v9-tariff-dualrun-dist-133.test.mjs
```

Ce dual-run ne constitue pas encore la bascule prévue par #135. Il manque la décomposition complète des tarifs embarqués, des oracles indépendants pour les frontières horaires/DST, `afterMinutesRate`, minimum/plafond, abonnement et congestion, ainsi qu'un jeu FX daté et vérifié. Les tests existants du moteur couvrent certaines règles, mais ne démontrent pas à eux seuls la correction du nouveau contrat. Aucune comparaison de prix entre devises sans FX daté et aucune généralisation de ce petit échantillon à la couverture nationale n'est faite.
