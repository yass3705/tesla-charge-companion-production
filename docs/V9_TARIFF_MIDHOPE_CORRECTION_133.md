# Issue #133 — correction Midhope de la Phase 7

Branche corrective Draft empilée sur Production #143. Même pin `2026-10-15-v9-tesla-mac-ingress-verified`, manifeste SHA-256 `2b7b9964d8fce26f65aaf1e508717a114cb68ca16c66fb3c06ba9a076f2db52f`. Le fichier source Midhope gzip conserve son SHA-256 `f19c37f917a692a4d6efd0d1f42cfb94707941fbfb990f987bf938ecd4a12796` ; aucun octet source, ID ou collecteur n'a changé.

## Avant / après

| Point | Phase 7 #143 avant correction | Correction |
| --- | --- | --- |
| Horaire | Le calcul utilisait déjà 08:30–18:00 Europe/London, mais `winterEvidence` bloquait la qualification après DST. | Lundi–samedi 08:30–18:00 heure locale toute l'année ; dimanche stationnement gratuit. DST déplace uniquement UTC. Annotation historique conservée, sans effet de gate. |
| Branches | 9 scénarios × 4 prises = 36 évaluations. | 16 scénarios × 4 prises = 64 évaluations, dont samedi, 08:29/08:30, 17:59/18:00 GMT, DST automne et printemps. 60 `priced`, 4 refus avant `validFrom`, 64 concordances du moteur avec l'oracle indépendant. |
| Prix fournisseur | Garde d'hiver non fondée. | £0.39996/kWh TTC, £0.80004 par tranche de 30 minutes entamée, £0.01/min après charge, £25 de préautorisation exclus. Observé le 10/10, source valide dès le 10/10 sans `validTo`, épinglée au 15/10. Fraîcheur prouvée **pour ce pin uniquement** ; toute preuve tarifaire plus récente exige une nouvelle validation. |
| Qualification | 0 candidate ; Midhope bloquée par saison. | 1 candidate pin-wide : les quatre RawOffer et quatre prises Midhope exactes. CH DE*EDH reste bloquée. 0 activation. |

Les [golden source](../tests/golden/v9-tariff-phase7-midhope-source-133.json) fixent séparément montants et composantes ; l'[oracle](../scripts/v9_tariff_phase7_source_oracle_133.mjs) lit les octets épinglés et n'importe aucun moteur Production. La [matrice](../reports/v9-tariff-133/phase7-qualification-pin-2026-10-15.json) vérifie toutes les portées exactes et la date du prix. Le rapport des [branches](../reports/v9-tariff-133/phase7-midhope-branches-pin-2026-10-15.json) compare statut, GBP, conversion EUR datée, énergie, stationnement et frais après charge.

Les 666 631 RawOffer, 710 386 OfferScope et leurs empreintes d'IDs restent celles du recensement Phase 7. Les 721 résultats runtime initiaux sont identiques à Phase 6. Les 62 refus sans oracle et 18 divergences insuffisantes sont exclus de la cohorte. Aucune propagation par site #134, activation, fusion, collecte ou publication.
