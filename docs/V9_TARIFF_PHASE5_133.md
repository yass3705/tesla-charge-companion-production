# Issue #133 — phase 5, filiation et preuve indépendante

Statut : PR Draft empilée sur #139 → #138 → #137 → #136. Contrat #135, identité physique #134 limitée à la présentation, verrou Scan Pay Lully #140 et mémoire Data Lab #332 consultés. Aucun moteur Production, collecte, pin, tarif Lully Direct, réponse UI ni classement n'est modifié. Dist immuable `2026-10-15-v9-tesla-mac-ingress-verified` : 2 465 fichiers, manifeste SHA-256 `2b7b9964d8fce26f65aaf1e508717a114cb68ca16c66fb3c06ba9a076f2db52f`.

## Même échantillon, dénominateurs distincts

Les 21 scénarios et l'algorithme ASCII de #139 sont inchangés : **21 379 tuples exacts interrogés** avec sessions répétées, **719 tuples sélectionnés + 2 refus = 721 lignes**. Avant : 151 lignes sans filiation catalogue, 230 **des 652 montants candidats** sans oracle indépendant. Leur intersection est **38 lignes**, leur union **343 lignes** ; aucun pourcentage n'est projeté sur les 666 631 RawOffer. La [preuve ligne par ligne](../reports/v9-tariff-133/phase5-proof-pin-2026-10-15.json) contient les 151 et 230 IDs exhaustifs, motifs, chemins, pointeurs et SHA, ainsi que les 18 divergences Phase 4. Le [dual-run Phase 5](../reports/v9-tariff-133/dualrun-phase5-pin-2026-10-15.json) conserve les évaluations complètes.

| Mesure sur les mêmes 721 lignes | Phase 4 | Phase 5 |
| --- | ---: | ---: |
| Calculable / incalculable / inéligible / sans offre | 652 / 55 / 12 / 2 | 652 / 55 / 12 / 2 |
| Filiation catalogue exacte directe / dérivée | 301 / 267 | 301 / 418 |
| Filiation manquante | 151 | **0** |
| Prix candidat avec oracle indépendant concordant | 422 | **590** |
| Prix candidat sans oracle indépendant | 230 | **62** |
| Concordances des deux moteurs | 689 | 689 |
| Corrections démontrées / données insuffisantes | 14 / 18 | **2 / 18** |
| Abonnement non sélectionné, inéligible explicite | inclus dans 18 insuffisances | **12** |

Tous les 721 tuples conservent **strictement** le même statut runtime, montant, devise, FX, composants, provenance, station/PDC/prise/offre et écart entre moteurs. Aucun montant oracle confirmé ne diverge du candidat. Les 590 concordances oracle sont une preuve distincte de l'accord ancien/nouveau moteur. L'oracle rejette maintenant 12 prix italiens autrefois classés « corrections démontrées » : leurs charges utiles disent `postChargeFeeUnknown` avec **15 minutes après charge** dans le scénario. Les montants énergie seuls ne prouvent pas le coût total ; ces 12 deviennent données insuffisantes. Les deux corrections encore démontrées sont les prises Kilowatt à 0 MAD. La rectification est volontairement visible dans le golden source historique CH, passé de refus à prix prouvé ; le golden dual-run Phase 3 reste historique et son test protège uniquement la parité runtime.

## 151 filiations : cause et correction

| Cause racine dans le banc/réconciliateur | Lignes | Preuve récupérée |
| --- | ---: | --- |
| NL : pointeur DOT-NL supprimé quand l'oracle refusait le calcul | 28 | Station, PDC, index compact actif et `/5` exact, même pour une règle incalculable. |
| BE : recherche limitée à une seule page NAP | 108 | Référence `(location, EVSE, rateId)` exacte dans les 17 pages vérifiées par SHA. |
| BE : deux pages contiennent la même offre EVSE/tarif | 4 | Deux RawOffer et deux OfferScope exacts conservés par ligne ; payload tarifaire identique, chemins et SHA distincts, aucune déduplication. |
| UK : recherche OCPI limitée à Applegreen | 11 | Référence `(party, location, EVSE, prise, tariff_id)` exacte, y compris MFL, SSM et ZES. |

Le catalogue dérivé reste **666 631 RawOffer**, **362 234 SourceStation**, **654 932 ChargePoint**, **460 144 Connector**, **710 386 OfferScope** et **807 Evidence**. Les 151 lignes se relient à **11 couples chemin/SHA** déjà présents dans Evidence ; chaque OfferScope retenu est une assertion source exacte. Les quatre doublons BE gardent les deux lignes RawOffer distinctes et chaque portée EVSE est vérifiée. Aucun lien n'utilise la clé de site #134, les coordonnées ou une puissance similaire. Ce sont des corrections de filiation dans le banc, sans écriture dans le catalogue ni les collectes.

## 230 montants sans oracle : preuve et refus

Sur les 230 d'origine, **180** obtiennent une preuve nouvelle : ES 113 (groupes REVE énergie à pas explicite, forfait inconditionnel et kWh), CH 19 (all-day et période gratuite non franchie), NL 20 (pas de 60 secondes au pas d'une minute), FR 10, GB 6 (tarif OCPI énergie unique sans champ TVA), IT 12 (règles simples sans frais inconnus). **50** de ces 230 restent non prouvés. En parallèle, les **12** prix IT antérieurement « prouvés » sont refusés pour frais après charge inconnus : total courant **62 prix calculés sans oracle**. Les [12 golden source Phase 5](../tests/golden/v9-tariff-phase5-source-133.json) vérifient des octets/SHA exacts et couvrent aussi les refus réservation, bande de durée, TVA OCPI et frais IT inconnus. Les 24 cas source antérieurs restent testés.

| Résidu parmi les 62 prix candidats | Lignes | Décision |
| --- | ---: | --- |
| ES : groupe conditionnel de réservation, règles multiples/horaires/durées ou énergie à sémantique non unique | 22 | Ne pas déduire une réservation ni une priorité entre éléments REVE. |
| NL : bande de durée OCPI `PARKING_TIME` à ancrage non démontré | 8 | Ne pas traiter le seuil comme temps total ou temps après charge par hypothèse. |
| GB : TVA OCPI déclarée ou groupes répétés sans règle d'addition démontrée | 8 | Garder le résultat sans preuve indépendante. |
| IT : frais après charge inconnus ou fenêtre/grâce contradictoire | 20 | Ne pas valider un total qui omet 15 minutes branchées après charge. |
| FR : bandes OCPI ENERGY/PARKING_TIME non désambiguïsées | 2 | Refus par prise/offre. |
| MA Tesla : tarification par bande de puissance dont le candidat affiche 0, oracle générique non adapté | 2 | Ne pas inférer 0 ou facturation par minute sans règle Tesla propre. |

Ces 62 lignes restent des **gates fermées** même si les deux moteurs concordent. Les 12 abonnements non choisis sont `ineligible_expected`, sans prix ni correction. Les 4 offres Duferco IT de l'ancien groupe des 18 restent `data_insufficient` : `postChargeFeeUnknown` pour une session avec après charge. Les 12 autres IT reclassées rejoignent ce motif, soit 16 IT dans les 18 insuffisances finales ; DE et GeniePoint constituent les 2 autres. DE Wirelane possède une RawOffer nominative `0,64 €/kWh + 1 €`, mais le tuple runtime Direct exact n'existe pas ; aucune somme n'est attribuée. GeniePoint Memorial Park & Ride est `OUTOFORDER`, prise avec `tariff_ids: []` : aucune offre exacte ni prix attribué.

## Invariants physiques et intégration réversible

Bois-d'Arcy conserve **trois stations source / 28 PDC**. Seules les 12 offres Electra du `FRELCP12954082` ont une portée prouvée ; scénario avec congestion demandée et saturation/SOC non prouvés = incalculable, scénario explicitement sans cette composante = 12 × 12,20 € pour 20 kWh. Aucun prix ne passe aux 16 autres PDC ou aux six IDs Electra non joints. Lully Direct reste inactif et la PR #140 demeure documentaire. Tesla/Mac Updater Test et toutes les collectes sont inchangés.

Le [contrat shadow](../scripts/v9_tariff_shadow_133.mjs) est **hors runtime Production et éteint par défaut**. Il n'évalue que si une cohorte `(pin,pays,CPO,canal)` est explicitement inscrite ; il rend toujours l'objet du moteur courant inchangé, émet seulement états, compteurs d'écarts et empreintes courtes des IDs, puis `rollback()` coupe immédiatement toute nouvelle évaluation. Aucun flag n'est activé dans l'UI ou les classements. Ce module prouve la mécanique, pas l'autorisation de bascule. Les 62 oracles manquants, 18 insuffisances, DE/GeniePoint et règles Electra conditionnelles ferment encore les gates des cohortes concernées.

## Reproduction bornée

Le script dual-run de #139, avec `TCC_V9_PHASE4_SAMPLE=1`, recrée les mêmes 721 lignes sur le même dist. Rapprocher avec `v9_tariff_reconcile_133.py`, puis lancer `v9_tariff_phase5_report_133.py` avec rapport Phase 4, rapport Phase 5, base SQLite Phase 3 et dist. Le rapport refuse tout écart de tuple, échantillonnage ou parité runtime et vérifie RawOffer, OfferScope et Evidence. Les tests Phase 5, le golden source, les contrôles du dist et la CI ciblée doivent passer avant revue. Aucune fusion ni publication automatique.
