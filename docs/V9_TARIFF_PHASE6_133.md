# Issue #133 — phase 6, qualification des cohortes sans activation

Statut : PR Draft sur #141 → #139 → #138 → #137 → #136. Conception #135, identité de présentation #134, dossier Scan Pay Lully #140 et mémoire Data Lab #332 consultés. Aucun collecteur, registre Production, UI, classement ou pin n'est changé. Le dist reste `2026-10-15-v9-tesla-mac-ingress-verified`, manifeste SHA-256 `2b7b9964d8fce26f65aaf1e508717a114cb68ca16c66fb3c06ba9a076f2db52f` et **666 631 RawOffer**.

## Matrice et dénominateurs

La [matrice exhaustive des lignes observées](../reports/v9-tariff-133/phase6-matrix-pin-2026-10-15.json) groupe par `(pin,pays,CPO,canal,famille tarifaire)` et conserve chaque ID de ligne, prise, offre, origine, motif de gate et compteur de tuples par zone. Le recensement du [dual-run Phase 6](../reports/v9-tariff-133/dualrun-phase6-pin-2026-10-15.json) compte **21 379 occurrences de tuples exacts** dans les mêmes zones et scénarios, dont **719 évaluées + 2 refus sans offre exacte = 721 lignes**. Les répétitions de session comptent séparément ; ce n'est pas un recensement de toutes les offres du pin. L'échantillonnage ASCII, les 21 scénarios, les tuples, les offres, les identifiants, les montants, devises, FX, composants, diagnostics, portées et classifications sont strictement ceux de #141 : **zéro résultat runtime ou classification changé**.

| Qualification mesurée | Compte |
| --- | ---: |
| Cohortes `(pin,pays,CPO,canal,famille)` observées | 181 |
| Lignes dont RawOffer/OfferScope, statut, montant, devise/FX et **composantes** concordent avec oracle indépendant, sans écart inexpliqué | 590/721 |
| Cohortes vertes sur toutes leurs lignes **échantillonnées** | 140/181 |
| Cohortes dont tous les tuples des **zones interrogées** ont été échantillonnés | 36/181 |
| Cohortes à la fois vertes et entièrement échantillonnées dans ces zones | 29/181 |
| Cohortes éligibles à la promotion sur tout le pin | **0** |

Une ligne n'est verte que si la RawOffer et l'OfferScope sont exacts, si l'oracle prouve le prix **et toutes les composantes facturées** dans ce scénario, si statut et devise/FX concordent, et s'il n'y a ni régression ni divergence inexpliquée. L'oracle source de #141 couvre les règles horaires/conditionnelles uniquement dans les branches qu'il accepte ; les branches refusées sont gardées. Les 62 prix sans oracle et les 18 insuffisances échouent explicitement. Les deux corrections Kilowatt gratuites sont mesurées mais ne constituent pas une promotion de cohorte. Les lignes incalculables et inéligibles n'apportent pas une preuve de montant. Pour toute cohorte, la matrice marque `pinWideTupleCensusComplete=false` et `ruleBranchAndSessionCoverageComplete=false` : même les 29 cohortes vertes dans les zones ne prouvent ni les autres prises du pin ni les autres sessions/branches. **Aucune cohorte n'est inscrite au flag Production.** Les proportions observées ne sont jamais extrapolées aux 666 631 RawOffer.

## Les 62 prix candidats sans oracle

La matrice donne les **62 IDs exhaustifs**, chemins, SHA et motifs exacts. Les [golden source Phase 6](../tests/golden/v9-tariff-phase6-source-133.json) vérifient huit faits sur les octets du pin ; aucune nouvelle sémantique fournisseur n'est inférée. Aucun des six groupes ne gagne un oracle de montant dans cette phase.

| Famille | Lignes | Source actuelle et preuve qui manque |
| --- | ---: | --- |
| ES REVE `component_groups` | 22 | 8 forfaits conditionnels (`RESERVATION_EXPIRES`), 10 groupes à règles multiples, 2 sémantiques ENERGY, 2 durées/autres. Les payloads identifient les conditions mais pas l'état de réservation, la priorité/addition des règles ni l'ancrage des durées pour la session. Obtenir règles REVE/checkout fournisseur et état de réservation par offre/prise ; les cas à énergie unique déjà prouvés restent inchangés. |
| IT | 20 | 16 charges utiles portent `postChargeFeeUnknown` pour 15 minutes après charge : obtenir le barème du site, son déclencheur et l'éventuelle période de grâce. Quatre A2A présentent `graceMinutes:0` dans `pricing` mais 60 dans la politique d'occupation, avec fenêtre 07:00–23:00 Europe/Rome : obtenir la règle officielle applicable à cette prise, la priorité entre ces champs et l'ancrage DST avant oracle. |
| NL DOT-NL | 8 | La source compacte porte `PARKING_TIME` avec seuil de 2 700 s, sans preuve de l'ancrage (occupation totale ou après charge), du pas et de l'application au franchissement du seuil. Obtenir la définition fournisseur par tarif/prise ; le payload seul ne suffit pas. |
| GB OCPI | 8 | Six cas avec TVA déclarée (`vat:20`) et deux avec groupes OCPI multiples. Obtenir base TTC/HT, ordre d'addition et règle de sélection des éléments sur le tarif exact ; le champ TVA seul ne prouve pas le total consommateur. |
| FR Electroverse | 2 | Même offre exacte, deux sessions ; bandes `ENERGY` et `PARKING_TIME` superposées avec seuil 600 s. Obtenir l'ancrage et la priorité/addition des bandes par prise/offre. |
| MA Tesla | 2 | Règles `powerMinute` et bandes de puissance dans le pin, candidat à 0 MAD. Obtenir la définition Tesla de la puissance mesurée, des bandes et du temps facturé, ainsi que le contexte d'éligibilité de la session. Ne pas transformer le 0 candidat en tarif gratuit. |

DE Wirelane conserve sa RawOffer 0,64 €/kWh + 1 € sans offre runtime Direct exacte ; GeniePoint `OUTOFORDER` conserve `tariff_ids: []`. Ce sont deux refus distincts des 62 montants candidats. Les 16 IT font avec eux les **18 divergences data_insufficient**. Les 12 abonnements non sélectionnés restent `ineligible_expected`. Bois-d'Arcy garde trois stations source/28 PDC et seulement 12 portées Electra démontrées, sans transfert par #134 ni hypothèse de saturation réelle. Lully Direct reste inactif selon #140.

## Shadow isolé et rollback

Le [rejeu hors Production](../reports/v9-tariff-133/phase6-shadow-pin-2026-10-15.json) appelle le contrat #141 sur 719 lignes avec offre exacte et 175 clés `(pin,pays,CPO,canal)`. Flag absent par défaut : **0 évaluation, 0 log**. Une activation locale artificielle de ces clés effectue 719 rappels et 719 événements minimisés (environ 289 ko au total) ; le rollback synchrone supprime immédiatement tous les rappels/logs ultérieurs. La réponse garde la même identité objet, et le tableau de classement est inchangé. Sur ce Mac, latence de l'enveloppe : désactivé p50/p95 environ 0,001/0,002 ms ; replay activé environ 0,022/0,027 ms ; après rollback environ 0,0002/0,0002 ms. Les chiffres sont un **microbenchmark de l'enveloppe et d'une lecture des résultats enregistrés**, pas le coût d'un second calcul moteur en Production ni un SLA. Les anciens composants et l'ancienne provenance n'étaient pas enregistrés dans le rapport #141 : ce replay ne prétend comparer que statut, total et devise. Les tests du contrat couvrent séparément ses drapeaux composants/provenance. Aucune cohorte n'a été activée dans l'application.

## Ordre de revue et fusion ultérieure

1. Revoir #135 (contrat), puis #134 (regroupement visuel uniquement) et verrouiller l'absence de modification d'OfferScope. Rebaser chacun sur `main` à jour, vérifier tests ciblés, CI et absence de déploiement.
2. Rebaser séquentiellement #136 → #137 → #138 → #139 → #141 → cette PR sur le SHA accepté précédent, résoudre les conflits sans aplatir la filiation source, puis exécuter à chaque étage CI ciblée, invariants du pin/RawOffer et contrôle du dist. Les golden historiques ne sont modifiés que par preuve source explicite.
3. Mettre à jour et relire le passage de relais Data Lab #332 après les décisions Production, contrôler sa sûreté publique et sa CI documentaire. #140 reste un chantier indépendant d'activation Scan Pay Lully, sans blocage ni promotion implicite par cette chaîne.

Ce plan ne fusionne ni ne publie rien. Une revue humaine séparée doit valider chaque intégration et toute future activation ; les gates de cohortes demeurent fermées.

## Reproduction bornée

`TCC_V9_PHASE4_SAMPLE=1 TCC_V9_PHASE6_CENSUS=1 node scripts/v9_tariff_dualrun_133.mjs "$TCC_V9_DIST" /tmp/phase6-raw.json`, puis `python3 scripts/v9_tariff_reconcile_133.py "$TCC_V9_PHASE3_CATALOG_DB" /tmp/phase6-raw.json /tmp/phase6-reconciled.json`. `python3 scripts/v9_tariff_phase6_matrix_133.py reports/v9-tariff-133/dualrun-phase5-pin-2026-10-15.json /tmp/phase6-reconciled.json /tmp/phase6-matrix.json` refuse tout changement des 721 tuples et résultats. `node scripts/v9_tariff_shadow_bench_133.mjs /tmp/phase6-reconciled.json /tmp/phase6-shadow.json` mesure le contrat isolé. Golden, tests ciblés et CI sans publication vérifient les artefacts versionnés.
