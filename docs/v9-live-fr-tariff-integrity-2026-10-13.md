# V9 publiée : premier contrôle d'intégrité tarifaire France (13 octobre 2026)

Référence publique : déploiement Pages `7026921334`, Production `6e3eaef101d72bf6d4855a819bcc2e4408e94528`, snapshot immuable `2026-10-13-nine-country-be-belib-exact-candidate`. La configuration HTTP annonce bien ce snapshot. Aucune nouvelle publication n'est déclenchée par ce dossier.

## Cause corrigée : tarif direct Electra perdu dans l'adaptateur

Le fichier `snapshot-inputs/FR/direct/electra_exact_direct_offers.json` contient 724 règles officielles station par station. L'adaptateur `direct-offers.js` interprétait le champ métier `kind: "direct"` comme un type de connecteur, produisant `connectorKinds: ["DIRECT"]`. Aucun connecteur AC ou DC ne pouvait correspondre. Le correctif ne reprend `kind` comme type de prise que lorsqu'il vaut réellement `AC` ou `DC`. Les grilles distinctes restent distinctes, sans choisir arbitrairement l'une d'elles.

Sur la base IRVE effectivement publiée, 717 des 724 règles ont une station présente, réparties sur 514 stations ; les 7 autres demeurent sans correspondance. Vélizy Carré Vélizy (`FRELCP12954229`) et La Boursidière (`FRELCP12953869`) ont chacun deux tarifs collectés, mais aucune liaison officielle tarif → EVSE/puissance dans cette source. Après le correctif, les règles sont visibles pour le diagnostic ; un montant direct ne doit être classé que si l'attribution à la prise est univoque. La disparition totale de ces règles avant le calcul était un défaut technique distinct de cette preuve encore manquante.

## Cas eMSP confrontés au snapshot publié

| Station et EVSE IRVE | Offre exacte publiée | Constat |
| --- | --- | --- |
| Lidl `LFR3148EVCP01`, CCS `FRLDLE00002411/12` | Electra GraphQL, location `9cef9192-c6b1-429f-90ae-657da863b31e`, `FR*LDL*E00002411/12`, 0,39 €/kWh | Même EVSE après normalisation, coordonnées ~48.80923/2.0553. C'est un prix eMSP Electra, distinct du direct Lidl Plus 0,29 €/kWh. La source Electra indique « ChargePoint Austria » comme CPO ; cette divergence de nom mérite contrôle mais ne crée pas une correspondance par proximité. |
| Electric 55 Place Lully, AC 7,4 kW `FR55CEFR78210P21PL1/2/3` | Electroverse cache, location `4402250`, 0,04 €/min charge et après charge en journée sur les EVSE 1/2/3 | Identité de prise exacte ; l'EVSE 0 à 22,1 kW a un autre tarif. Aucune offre Electra eMSP attachée à cette station dans le pin. |
| Electric 55 Bois-d'Arcy, AC 22,1 kW `FR55CEFR78390CHEVREU1LS0/1` | Electra GraphQL, location `792a7fa4-334c-4848-961a-49c38b587176`, 0,084 €/min jour ; Electroverse cache, location `2333492`, 0,08 €/min jour | Deux sources eMSP et deux EVSE exacts ; tarifs distincts légitimes dans le snapshot. Les frais après charge doivent être contrôlés avec la durée effective, séparément des minutes de charge. |

La collecte Electric 55 `data/operator_direct/e55c_exact_france.json` contient des rapprochements EVSE pour Place Lully, mais sa classification source indique `publicationReady: false` ; le catalogue direct effectivement publié ne contient qu'un autre site Electric 55. Aucun prix direct Place Lully ou Bois-d'Arcy n'est créé par ce correctif.

## Perte de couverture nationale détectée, correction retenue

L'inventaire IRVE servi contient 48 058 stations / 165 792 EVSE (base Stable épinglée d'août) ; la base Data Lab du 11 octobre contient 49 211 stations / 164 368 EVSE. Contre la base publiée, 92 850/97 371 offres Electra et 86 782/89 991 offres Electroverse ont une identité EVSE exacte. Une substitution brute par la base récente restaurerait 4 521 offres Electra, mais ferait perdre 3 932 offres Electroverse actuellement rattachées, tout en en restaurant 3 086. Cette substitution n'est donc **pas promue** : les 7 730 offres eMSP sans identité dans le pin actuel et le renouvellement des 9 474 identifiants EVSE anciens exigent une réconciliation contrôlée. Un candidat expérimental a été construit et validé localement, sans modification du pin ni publication.

## Validation et suite

`node tests/france-direct-offer-kind.test.mjs` reproduit le rejet historique et vérifie l'attachement après correction, l'absence de fuite vers une autre station et la conservation des deux grilles officielles. Prochain contrôle : rebuild sur le pin publié, calcul de scénarios déterministes pour les six stations, audit des éléments facturés et des libellés, puis CI PR. Les paramètres personnels de la capture n'étant pas fournis, aucun profil utilisateur n'est supposé.
