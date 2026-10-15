# Issue #133 — phase 2, catalogue et oracle en lecture seule

Cette branche s'empile sur la PR Draft #136. La PR Draft #135 reste le contrat de conception ; #134 ne sert qu'à présenter les sites physiques. Le moteur et les collecteurs utilisés par Production ne changent pas. Le pin est `2026-10-15-v9-tesla-mac-ingress-verified` ; le dist et la base SQLite sont des artefacts de travail, non des données publiées.

## Extraction des 30 sources signalées

`v9_tariff_embedded_133.py` ajoute au catalogue #136 chaque feuille tarifaire identifiée par chemin de fichier, SHA-256 et pointeur JSON. L'import vérifie l'égalité de la charge utile à ce pointeur avant insertion. Il conserve les identifiants source, le JSON brut et les diagnostics. Les assertions de portée utilisent uniquement les identifiants explicites de la même source. Un tarif de station reste lié à la station source ; un connecteur connu sans EVSE crée un conteneur technique dont `source_evse_id` est vide, sans PDC inventé. Aucun tarif ne se propage par site physique, nom, GPS ou puissance.

| Mesure | Avant #136 | Après phase 2 | Ajout |
| --- | ---: | ---: | ---: |
| SourceStation | 184 674 | 284 413 | 99 739 |
| ChargePoint | 389 310 | 566 948 | 177 638 |
| Connector | 389 310 | 460 144 | 70 834 |
| RawOffer | 365 066 | 578 647 | 213 581 |
| OfferScope, assertions | 374 025 | 622 402 | 248 377 |
| Evidence | 785 | 806 | 21 |

Parmi les nouvelles assertions, **218 379** ont une jointure d'identifiants source exacte, **29 746** restent au niveau station et **252** restent sans portée prouvée. Ce sont des assertions, pas des offres supplémentaires : un profil peut référencer plusieurs EVSE. Les 3 535 ambiguïtés de portée déjà présentes dans le catalogue #136 restent conservées. Les 27 sources décomposables ajoutent des offres. Tesla en comptait déjà 1 179. `user-stations` dépend de données utilisateur absentes du pin ; Shell Al Jazira n'a aucune charge utile tarifaire dans son fichier épinglé. Ces deux sources ne peuvent donc pas être décomposées sans nouvelles données. Les 467 indices e-Totem, 78 profils sans référence exacte et 1 politique réseau FastVolt sont conservés, sans prix applicable à une prise.

Le fichier compact DOT-NL possédait déjà une Evidence #136 au même chemin mais avec un SHA différent des octets du dist utilisé ici. L'import conserve cette Evidence historique et ajoute une preuve distincte avec le SHA réel du fichier épinglé ; il ne réécrit pas l'ancien enregistrement.

Les [compteurs par pays, CPO, canal et état de portée](../reports/v9-tariff-133/coverage-phase2-pin-2026-10-15.json) comprennent les états avant et après. Les fichiers compressés [station/PDC/prise](../reports/v9-tariff-133/coverage-phase2-pin-2026-10-15-station-point-connector.csv.gz) et [offre/portée/preuve](../reports/v9-tariff-133/coverage-phase2-pin-2026-10-15-offer-scope.csv.gz) donnent le détail ligne à ligne. Le [rapport d'extraction](../reports/v9-tariff-133/embedded-extraction-phase2-pin-2026-10-15.json) explicite les 30 décisions et leurs diagnostics. Les nombres par pays restent distincts des lignes d'assertion : FR 190 820 → 203 585 offres, GB 224 → 31 946, NL 54 → 45 607, BE 27 → 92 609, DE 327 → 28 371, CH 19 908 → 20 497, IT 109 303 → 111 461, MA 6 → 174 ; ES, LU et PT ne changent pas sur ce lot.

## Oracle et golden files

`v9_tariff_oracle_133.mjs` ne charge aucun moteur Production. Il parcourt des minutes UTC et détermine l'horaire local par fuseau IANA, y compris les deux passages DST. Il évalue séparément énergie, charge, connexion, stationnement, après-charge, frais fixes, `afterMinutesRate`, minimum et plafond, abonnement et congestion par couple offre/prise lorsque la trajectoire SOC est prouvée. Il refuse les dimensions ou sémantiques manquantes. Les conversions n'utilisent que `data/exchange_rates.json` au SHA-256 vérifié et daté du 15 octobre 2026 ; le montant source reste toujours disponible.

Les [16 golden cases issus des fichiers épinglés](../tests/golden/v9-tariff-pinned-source-oracle-133.json) couvrent Bois-d'Arcy, Place Lully jour/nuit/DST, Métropolis, DOT-NL, Midhope, GeniePoint, Tesla SuC/Mac et CH/IT/DE/ES/BE/MA. Chaque cas relit le fichier réel, vérifie son SHA et extrait son pointeur JSON. Parmi les calculs indépendants : Lully 5,208 € le jour et 3,912 € la nuit ou au repli DST ; Métropolis 14,23 € avec kWh entamé et frais après charge ; GeniePoint 8,88 £ ; Tesla SuC 8,20 € et Mac 157,50 MAD. Les formats dont la règle complète n'est pas démontrée restent `uncomputable`, notamment les bandes OCPI Electra à Bois-d'Arcy, le compact DOT-NL, et les grilles brutes DE/BE/MA.

La dernière rectification du [document source Midhope](https://github.com/yass3705/tesla-charge-companion-data-lab/blob/0de67f9/docs/uk-midhope-release-readiness-2026-10-10.md) annule la borne automatique du 24 octobre : 08:30–18:00 `Europe/London` reste l'horaire local lors du changement DST. Le tarif reste révisable sur nouvelle preuve CPO.

## Dual-run et divergences

L'échantillon passe de **13 scénarios/44 lignes** à **20 scénarios/67 lignes** : trois temporalités Lully, une longue session Métropolis, DOT-NL au passage minuit, Midhope, GeniePoint et congestion SuC s'ajoutent aux pays déjà couverts. Le [rapport par ligne et par scénario](../reports/v9-tariff-133/dualrun-phase2-pin-2026-10-15.json) compare statut, montant, devise, composantes, provenance, portée et couverture ; le [golden de dual-run](../tests/golden/v9-tariff-dualrun-phase2-133.json) verrouille le résultat dist. On obtient 29 lignes calculées, 36 non calculables et 2 sans offre exacte ; **56 concordances et 11 écarts classés « données insuffisantes »**, aucune correction démontrée et aucune régression démontrée. **47** lignes ont une jointure catalogue exacte, **18** offres runtime dérivées ne correspondent pas à un RawOffer de même identifiant, et **2** n'ont aucune offre runtime exacte. Le classement ne transforme jamais un simple gain de calculabilité en correction.

Les limites principales restent concrètes : les profils Direct épinglés de Lully sont présents dans le catalogue et les golden files, mais leur source est inactive dans le registre Production ; le dual-run runtime y observe Electroverse. Les quatre offres Midhope ont une portée exacte et un oracle calculable, mais le moteur interprète `durationMinutes + postChargeMinutes` comme occupation alors que le scénario explicite 60 minutes d'occupation dont 15 après charge : le rapprochement temporel doit être normalisé avant toute conclusion sur l'écart de montant. GeniePoint possède un tarif source contrôlable, sans offre runtime exacte sur le site échantillonné. Bois-d'Arcy conserve ses stations source et ses PDC distincts malgré une présentation physique commune ; les bandes OCPI non prouvées empêchent encore le calcul. Tesla SuC/Mac reste collecté dans Updater Test, sans modification de cette chaîne.

## Reproduction

Sur le dist validé du pin, copier d'abord la base #136 ; ne jamais importer dans la base de référence. Exécuter ensuite :

```sh
python3 scripts/v9_tariff_embedded_133.py "$DIST" --database "$PHASE2_DB" --report "$EMBEDDED_REPORT"
python3 scripts/v9_tariff_phase2_coverage_133.py "$PHASE1_DB" "$PHASE2_DB" "$COVERAGE_REPORT"
node scripts/v9_tariff_dualrun_133.mjs "$DIST" "$DUALRUN_RAW"
python3 scripts/v9_tariff_reconcile_133.py "$PHASE2_DB" "$DUALRUN_RAW" "$DUALRUN_REPORT"
TCC_V9_DIST="$DIST" node --test tests/v9-tariff-oracle-133.test.mjs tests/v9-tariff-pinned-source-oracle-133.test.mjs tests/v9-tariff-dualrun-phase2-dist-133.test.mjs
```

Il n'y a ni bascule vers l'évaluateur, ni modification du résultat Production, ni fusion prévue par cette PR.
