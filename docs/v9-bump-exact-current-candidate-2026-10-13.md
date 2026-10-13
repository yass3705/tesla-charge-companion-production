# BUMP Direct France — candidat exact du 13 octobre 2026

## Périmètre et provenance

Le candidat de développement `2026-10-13-fr-bump-exact-current-candidate` conserve les pins nationaux du candidat précédent : Data Lab `e39a4466096b520b3c459e75539bf9b112235165`, Stable `0a6d2c3415504397310d3dc92fae40be843b2435`. **Seul** le catalogue Direct BUMP est remplacé par un artefact dérivé du commit Data Lab immuable `e22c23b1ce6e59a3d834145624c78ea88803e7bb` (`v9-production-runtime/data/v9/france-bump-offers.json`, SHA-256 `63aa413a14e4c9511596a180ca2988f6822e32c228f859518af61ef5acc3e229`). Le générateur `scripts/build_bump_exact_override.py` conserve seulement les EVSE présents **une fois** dans l'IRVE épinglé sous l'opérateur Bump. Le fichier candidat et son empreinte sont dans `data/overlays/` et dans sa configuration immuable ; le build refuse toute dérive de SHA, de provenance, de nombre ou d'opérateur.

| Niveau | EVSE ou points | Interprétation |
| --- | ---: | --- |
| Source BUMP France | 2 500 points | Inventaire GraphQL/IRVE du 13 octobre. |
| Tarif source classable | 2 295 | Tarif source disponible et analysé ; ce chiffre n'est pas une jointure runtime. |
| Offre runtime Data Lab complète | 2 287 | Huit EVSE à grilles horaires restent incalculables. |
| Jointure unique au référentiel FR épinglé | **1 744** | 55 groupes d'offres Direct BUMP dans le candidat. |
| Tarif source sans EVSE dans l'IRVE épinglé | **543** | Conservés en trace, sans prix affiché ni borne inventée. |
| Source non classable | 205 | Aucun montant runtime. |

Le catalogue Stable antérieur attachait 1 750 EVSE BUMP. Le candidat conserve **1 690** de ces liens, ajoute **54** EVSE exacts et retire **60** anciens liens : 32 n'ont plus de mapping EVSE courant, 17 n'ont plus de station applicative rapprochée, huit portent les grilles horaires non calculables et trois IDs ont disparu de la source courante. Les 543 EVSE nouveaux mais absents de l'IRVE épinglé ne sont pas ajoutés par proximité. Ce différentiel ne change pas l'inventaire France ; la zone témoin du smoke reste à 3 323 stations tarifées sur 3 771, car les EVSE nouvellement tarifés ne créent pas de station tarifée supplémentaire dans cette zone.

## Calcul et absence de propagation

L'ancien catalogue facturait `FRBMPEBMP0837` au temps connecté. La source BUMP actuelle précise 0,01 €/minute **pendant la charge** et 0,555 € fixe, avec stationnement après charge à 0. Dans le même scénario 60 minutes connecté / 50 minutes de charge / 10 minutes après charge, le moteur du candidat donne **1,055 €** contre **1,155 €** auparavant. Sur les 1 690 EVSE communs, un scénario déterministe 10 kWh / 60 minutes connecté / 50 minutes de charge / 10 minutes après charge donne 1 498 montants identiques et 192 modifiés ; 157 baissent de 0,10 € à cause de cette distinction entre charge et connexion. Les autres variations reflètent des règles ou montants de la source courante et ne sont pas extrapolées à d'autres prises.

Le contrôle `v9-bump-current-exact.test.mjs` vérifie l'identité EVSE dans l'adaptateur réel : une offre pour `FRBMPEBMP0837` s'attache une fois à sa prise BUMP, jamais à `UNRELATED`, puis l'oracle 1,055 €. Le build a validé les **1 744** jointures exactes, la parité Stable sur les ressources critiques, le graphe navigateur (34 dépendances), les empreintes SHA-256 et le smoke FR/IT/CH/DE/ES/NL/GB/MA/BE/Tesla. Le manifeste local contient **2 448 fichiers / 743 691 613 octets**. Par rapport au candidat précédent, seuls le catalogue BUMP et les deux fichiers de métadonnées changent ; un fichier d'audit BUMP est ajouté. Aucun autre fichier d'offre ou de base nationale n'est remplacé.

## Restes et publication

Les huit grilles horaires exigent une preuve de verrouillage ou de répartition entre plages ; les 543 EVSE hors IRVE épinglé relèvent de la réconciliation nationale ; les 60 anciens liens retirés ne reçoivent pas un tarif historique sans preuve actuelle. Le candidat ne règle pas les autres blocages IRVE/Electra/UK/DOT-NL consignés dans `v9-technical-tariff-readiness-2026-10-13.md`.

Le pin public Pages demeure `2026-10-13-nine-country-be-belib-exact-candidate`. Ce candidat ne déclenche ni déploiement Pages ni Cloudflare. Les anciens snapshots et configurations restent disponibles pour rollback.
