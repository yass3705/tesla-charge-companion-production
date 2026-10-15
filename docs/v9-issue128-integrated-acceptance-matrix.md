# TCC V9 — Recette intégrée #128

Référence: #128. Base: main après PR #129. Ce registre sépare **tests d'intégration réels du snapshot** et **fixtures synthétiques**. Aucune validation globale n'est déduite de la réussite d'une fixture.

| Critère | Preuve actuelle | Niveau | Prochaine preuve nécessaire |
| --- | --- | --- | --- |
| Carte station, puissances, PDC et voies Direct/Electra/Electroverse | `tests/runtime-browser-journey-global.mjs`, PR #129, workflow global | Intégré, scénario CH | Étendre à plusieurs CPO et plusieurs PDC |
| Plusieurs puissances / PDC distincts, association non transitive | `tests/v9-station-card-lot1.test.mjs` et `tests/v9-station-card-browser.mjs` | Fixture | Vérifier un résultat V9 réel multi-PDC |
| Absence de prix, ambiguïté et incalculable | `tests/v9-tariff-readability-lot3.test.mjs`, `tests/v9-tariff-lanes.test.mjs` | Fixture | Tester sur offres du snapshot de plusieurs pays |
| Congestion 80 % et bascule spécifique à une voie | `tests/runtime-browser-journey-global.mjs` (fixture injectée dans page), `tests/v9-lot3-tariff-browser.mjs` | Fixture DOM | Contrôler tarif moteur réel éligible, deux PDC indépendants |
| Tarifs horaires, frais fixes, stationnement, plafonds et seuils | Tests tarifaires existants à inventorier séparément | Non démontré en E2E UI | Cas réels diurne/nocturne et tarif complexe avec total et détails |
| Tesla SuC et Maroc/Mac | Tests de provenance UI et moteur existants | Partiel | Parcours rendu depuis bases Tesla propres dans les deux contextes |
| Desktop/mobile sans débordement | `tests/v9-station-card-browser.mjs`, `tests/v9-lot3-tariff-browser.mjs` et screenshots de #127 | Fixture | Exécuter responsive sur un parcours complet |
| Publication GitHub Pages | Non demandée | Hors recette | Autorisation explicite avant tout déploiement |

## Principes de clôture

1. Ne pas modifier collecte, prix, matching EVSE ou Tesla/Mac dans ce chantier de recette.
2. Toute différence de calcul constatée relève de #100 avec preuve concrète et PR séparée.
3. Une validation est traçable par SHA, run, pays, station/PDC et capture quand applicable.
4. La clôture de #128 exige les scénarios **intégrés** restants et les suites post-fusion ; ne pas fermer sur la seule base du vert des fixtures.
