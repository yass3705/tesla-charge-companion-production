# BUMP Direct FR — supplément IRVE actif du 13 octobre 2026

## Preuve et périmètre

Le candidat `2026-10-13-fr-bump-active-supplement-candidate` garde les pins Data Lab `e39a4466096b520b3c459e75539bf9b112235165` et Stable `0a6d2c3415504397310d3dc92fae40be843b2435`. La source tarifaire BUMP demeure l'artefact Data Lab `e22c23b1ce6e59a3d834145624c78ea88803e7bb`, SHA-256 `63aa413a14e4c9511596a180ca2988f6822e32c228f859518af61ef5acc3e229`. Le supplément prend les enregistrements de la base IRVE plus récente épinglée, SHA-256 `7113daf751ff34922474d8c9ead10c8e998ca651400d56a08f4964d3e66cf94f`, et le statut dynamique épinglé, SHA-256 `d42e12ea4bdf8e4eb00ee57844f6257c430d8398ed446b64ad39a1af39388463`.

Parmi les **543 EVSE BUMP tarifés mais absents** du référentiel national du candidat précédent :

| État | EVSE | Décision |
| --- | ---: | --- |
| Absents de la base IRVE plus récente | 485 | Aucune station ajoutée. |
| Présents sans statut « en service » positif | 16 | Aucune station ajoutée. |
| Identité exacte, mais localisation ou nom contradictoire | 3 | Exclusion ; `FRBMPP779265P` diffère d'environ 1,8 km entre source BUMP et IRVE. |
| EVSE exact, BUMP public, même puissance, coordonnées et nom concordants, tarif actuel et statut positif | **39** | 21 stations ajoutées au référentiel gelé. |

Le fichier `data/overlays/france-bump-active-supplement-evidence-2026-10-13.json` donne les identifiants nationaux, EVSE, lieux BUMP et IDs tarifaires ; son SHA est verrouillé dans la configuration. Le build vérifie aussi les SHA source et dynamique, l'unicité de l'EVSE, l'opérateur, la puissance et le statut avant de produire chaque ligne. Les trois conflits géographiques ne sont pas joints.

## Effet du candidat

Le référentiel FR augmente de **48 062 à 48 083 stations** et de **165 809 à 165 848 EVSE**, uniquement avec les 21 stations / 39 EVSE approuvés. BUMP Direct passe de **1 744 à 1 783 EVSE exacts** et de 55 à **58 groupes d'offres** ; ses EVSE tarifés source sans jointure passent de **543 à 504**. Les 1 690 EVSE de l'ancien catalogue Stable restent attachés, 93 attaches sont nouvelles et 60 anciennes restent retirées pour les raisons décrites dans `v9-bump-exact-current-candidate-2026-10-13.md`. Les huit grilles horaires BUMP sans preuve de calcul restent en quarantaine.

Les fichiers nationaux et catalogues hors BUMP sont conservés. Le supplément reconstruit le manifeste FR et les tuiles concernées, y compris les nouvelles tuiles, avec empreintes SHA. Les anciens candidats immuables et le pin public `2026-10-13-nine-country-be-belib-exact-candidate` restent disponibles ; aucun déploiement Pages ou Cloudflare n'est autorisé par ce travail.

## Validation

Le build local termine avec **2 453 fichiers / 743 698 439 octets**. Les tests ciblés valident les 39 EVSE approuvés, les trois rejets géographiques, les 504 EVSE source encore non joints, les 58 groupes de tarifs, le calcul BUMP témoin **1,055 €**, le manifeste et le SHA de toutes les tuiles. La parité Stable passe sur dix ressources critiques ; le graphe navigateur conserve 34 dépendances. Le smoke neuf pays/Tesla passe, avec **3 323 stations tarifées sur 3 771** dans la zone témoin française. Par rapport au candidat précédent, 23 fichiers existants changent, cinq fichiers apparaissent (quatre nouvelles tuiles et une preuve de supplément), aucun fichier n'est supprimé. Les changements de données sont limités à l'IRVE FR BUMP, au catalogue direct BUMP et à leurs métadonnées de build.

CI de la PR #91 : [candidat 38408105581](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38408105581) et [preview 38408105702](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38408105702) réussis, parcours navigateur compris ; `deploy` ignoré. Après fusion `f08c5d60d0ccaad6bba9f3e12ee78bc0bdb49fdb`, [CI candidat `main` 38408405218](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38408405218) et [preview `main` 38408405107](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38408405107) réussies ; Pages ignoré. La publication éventuelle demandera une décision distincte.
